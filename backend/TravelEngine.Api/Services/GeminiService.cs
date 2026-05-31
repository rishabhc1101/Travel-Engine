using System.Text;
using System.Text.Json;
using Google.Cloud.AIPlatform.V1;
using TravelEngine.Api.DTOs;
using TravelEngine.Api.Models;

namespace TravelEngine.Api.Services;

public interface IGeminiService
{
    Task<(string Title, List<ItineraryDay> Days, decimal EstimatedCost)> GenerateItineraryAsync(
        PlanTripRequest request, CancellationToken ct = default);
}

public class GeminiService(IConfiguration config, ILogger<GeminiService> logger) : IGeminiService
{
    private readonly string _projectId = config["Gcp:ProjectId"]
        ?? throw new InvalidOperationException("Gcp:ProjectId not configured");
    private readonly string _location = config["Gcp:Location"] ?? "us-central1";
    private readonly string _model = config["Gcp:GeminiModel"] ?? "gemini-1.5-pro";

    public async Task<(string Title, List<ItineraryDay> Days, decimal EstimatedCost)>
        GenerateItineraryAsync(PlanTripRequest request, CancellationToken ct = default)
    {
        var client = await PredictionServiceClient.CreateAsync(cancellationToken: ct);
        var endpoint = $"projects/{_projectId}/locations/{_location}/publishers/google/models/{_model}";

        int nights = request.EndDate.DayNumber - request.StartDate.DayNumber;
        int days = Math.Max(nights + 1, 1);
        var interestsList = string.Join(", ", request.Interests);
        var constraintsList = request.Constraints.Count > 0
            ? string.Join(", ", request.Constraints)
            : "none";

        var prompt = $$"""
            You are an expert travel planner. Generate a detailed, day-by-day travel itinerary in strict JSON format.

            Trip details:
            - Destination: {{request.Destination}}
            - Start: {{request.StartDate:yyyy-MM-dd}}, End: {{request.EndDate:yyyy-MM-dd}} ({{days}} days)
            - Total budget: USD {{request.BudgetUsd}}
            - Interests: {{interestsList}}
            - Constraints: {{constraintsList}}
            - Additional request: {{request.UserPrompt}}

            IMPORTANT budget rules:
            - Sum of all activity costs MUST NOT exceed USD {{request.BudgetUsd}}
            - Suggest budget-appropriate accommodation, food, and activities
            - Include a rough cost estimate per activity

            Return ONLY valid JSON matching exactly this schema (no markdown fences):
            {
              "title": "string",
              "estimatedTotalCostUsd": number,
              "days": [
                {
                  "dayNumber": number,
                  "date": "yyyy-MM-dd",
                  "theme": "string",
                  "summary": "string",
                  "estimatedDayCostUsd": number,
                  "activities": [
                    {
                      "orderIndex": number,
                      "name": "string",
                      "description": "string",
                      "category": "Food|Sightseeing|Adventure|Culture|Shopping|Transport|Accommodation|Other",
                      "address": "string",
                      "latitude": number,
                      "longitude": number,
                      "startTime": "HH:mm",
                      "endTime": "HH:mm",
                      "estimatedCostUsd": number,
                      "bookingUrl": "string or null",
                      "weatherNote": "string or null"
                    }
                  ]
                }
              ]
            }
            """;

        var content = new Content { Role = "user" };
        content.Parts.Add(new Part { Text = prompt });

        var parameters = new GenerateContentRequest
        {
            Model = endpoint,
            GenerationConfig = new GenerationConfig
            {
                Temperature = 0.7f,
                MaxOutputTokens = 8192,
                TopP = 0.9f
            }
        };
        parameters.Contents.Add(content);

        var response = await client.GenerateContentAsync(parameters, cancellationToken: ct);
        var rawJson = response.Candidates[0].Content.Parts[0].Text.Trim();

        // Strip markdown fences if Gemini adds them despite the prompt
        if (rawJson.StartsWith("```"))
        {
            rawJson = rawJson[(rawJson.IndexOf('\n') + 1)..];
            if (rawJson.EndsWith("```"))
                rawJson = rawJson[..rawJson.LastIndexOf("```")];
        }

        logger.LogDebug("Gemini raw response: {json}", rawJson);

        using var doc = JsonDocument.Parse(rawJson);
        var root = doc.RootElement;

        var title = root.GetProperty("title").GetString() ?? "My Trip";
        var estimatedTotal = root.GetProperty("estimatedTotalCostUsd").GetDecimal();

        var itineraryDays = new List<ItineraryDay>();
        foreach (var dayEl in root.GetProperty("days").EnumerateArray())
        {
            var day = new ItineraryDay
            {
                Id = Guid.NewGuid(),
                DayNumber = dayEl.GetProperty("dayNumber").GetInt32(),
                Date = DateOnly.Parse(dayEl.GetProperty("date").GetString()!),
                Theme = dayEl.TryGetProperty("theme", out var th) ? th.GetString() : null,
                Summary = dayEl.TryGetProperty("summary", out var su) ? su.GetString() : null,
                EstimatedDayCostUsd = dayEl.GetProperty("estimatedDayCostUsd").GetDecimal()
            };

            foreach (var actEl in dayEl.GetProperty("activities").EnumerateArray())
            {
                var activity = new Activity
                {
                    Id = Guid.NewGuid(),
                    ItineraryDayId = day.Id,
                    OrderIndex = actEl.GetProperty("orderIndex").GetInt32(),
                    Name = actEl.GetProperty("name").GetString() ?? "Activity",
                    Description = actEl.TryGetProperty("description", out var d) ? d.GetString() : null,
                    Category = actEl.TryGetProperty("category", out var cat) ? cat.GetString() : null,
                    Address = actEl.TryGetProperty("address", out var addr) ? addr.GetString() : null,
                    Latitude = actEl.TryGetProperty("latitude", out var lat) && lat.ValueKind != JsonValueKind.Null
                        ? lat.GetDouble() : null,
                    Longitude = actEl.TryGetProperty("longitude", out var lon) && lon.ValueKind != JsonValueKind.Null
                        ? lon.GetDouble() : null,
                    StartTime = actEl.TryGetProperty("startTime", out var st) && st.GetString() is { } stStr
                        ? TimeOnly.Parse(stStr) : null,
                    EndTime = actEl.TryGetProperty("endTime", out var et) && et.GetString() is { } etStr
                        ? TimeOnly.Parse(etStr) : null,
                    EstimatedCostUsd = actEl.GetProperty("estimatedCostUsd").GetDecimal(),
                    BookingUrl = actEl.TryGetProperty("bookingUrl", out var bu) && bu.ValueKind != JsonValueKind.Null
                        ? bu.GetString() : null,
                    WeatherNote = actEl.TryGetProperty("weatherNote", out var wn) && wn.ValueKind != JsonValueKind.Null
                        ? wn.GetString() : null
                };
                day.Activities.Add(activity);
            }

            itineraryDays.Add(day);
        }

        return (title, itineraryDays, estimatedTotal);
    }
}
