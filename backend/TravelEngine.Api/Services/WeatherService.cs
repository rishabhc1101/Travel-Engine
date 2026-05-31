using System.Net.Http.Json;
using System.Text.Json;
using Google.Cloud.PubSub.V1;
using Google.Protobuf;
using TravelEngine.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace TravelEngine.Api.Services;

public interface IWeatherService
{
    Task<WeatherInfo?> GetWeatherAsync(string destination, double lat, double lon, CancellationToken ct = default);
    Task CheckActiveTripsAndAlertAsync(CancellationToken ct = default);
}

public record WeatherInfo(
    string Destination,
    string Condition,
    double TempCelsius,
    double WindKph,
    string Icon,
    bool HasAlert,
    string? AlertDescription
);

public class WeatherService(
    IHttpClientFactory httpFactory,
    IConfiguration config,
    AppDbContext db,
    IPubSubService pubSub,
    ILogger<WeatherService> logger) : IWeatherService
{
    private readonly string _apiKey = config["Weather:OpenWeatherMapApiKey"]
        ?? throw new InvalidOperationException("Weather:OpenWeatherMapApiKey not configured");

    public async Task<WeatherInfo?> GetWeatherAsync(
        string destination, double lat, double lon, CancellationToken ct = default)
    {
        var client = httpFactory.CreateClient("weather");
        var url = $"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={_apiKey}&units=metric";

        try
        {
            using var response = await client.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var root = doc.RootElement;

            var condition = root.GetProperty("weather")[0].GetProperty("main").GetString() ?? "Unknown";
            var description = root.GetProperty("weather")[0].GetProperty("description").GetString() ?? "";
            var icon = root.GetProperty("weather")[0].GetProperty("icon").GetString() ?? "01d";
            var temp = root.GetProperty("main").GetProperty("temp").GetDouble();
            var windSpeed = root.GetProperty("wind").GetProperty("speed").GetDouble() * 3.6; // m/s → kph

            bool hasAlert = condition is "Thunderstorm" or "Tornado" or "Squall"
                || windSpeed > 60
                || temp > 40
                || temp < -10;

            string? alertDesc = hasAlert
                ? $"{description} (Wind: {windSpeed:F0} kph, Temp: {temp:F1}°C)"
                : null;

            return new WeatherInfo(destination, condition, temp, windSpeed,
                $"https://openweathermap.org/img/wn/{icon}@2x.png", hasAlert, alertDesc);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch weather for {destination}", destination);
            return null;
        }
    }

    public async Task CheckActiveTripsAndAlertAsync(CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var activeTrips = await db.Trips
            .Where(t => t.StartDate <= today && t.EndDate >= today
                     && t.Status != Models.TripStatus.Cancelled)
            .ToListAsync(ct);

        foreach (var trip in activeTrips)
        {
            var weather = await GetWeatherAsync(trip.Destination, trip.Latitude, trip.Longitude, ct);
            if (weather is null) continue;

            if (weather.HasAlert)
            {
                await pubSub.PublishWeatherAlertAsync(trip.Id, weather, ct);
                logger.LogInformation("Weather alert published for trip {tripId}: {alert}",
                    trip.Id, weather.AlertDescription);
            }
        }
    }
}
