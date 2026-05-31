using TravelEngine.Api.Services;

namespace TravelEngine.Api.BackgroundServices;

public class WeatherPollingService(
    IServiceScopeFactory scopeFactory,
    ILogger<WeatherPollingService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Weather polling service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var weatherService = scope.ServiceProvider.GetRequiredService<IWeatherService>();
                await weatherService.CheckActiveTripsAndAlertAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Error in weather polling cycle");
            }

            await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
        }
    }
}
