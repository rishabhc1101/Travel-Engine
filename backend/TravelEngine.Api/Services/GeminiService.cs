using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using TravelEngine.Api.DTOs;
using TravelEngine.Api.Models;

namespace TravelEngine.Api.Services;

public interface IGeminiService
{
    Task<(string Title, List<ItineraryDay> Days, decimal EstimatedCost)> GenerateItineraryAsync(
        PlanTripRequest request, CancellationToken ct = default);
}

/// <summary>
/// Itinerary generator that calls Google AI Studio (Gemini 1.5 Flash) when an API key
/// is configured, and falls back to the built-in template generator otherwise.
///
/// Free tier: 1,500 requests/day â€” no billing required.
/// Get a key at https://aistudio.google.com/app/apikey
/// Set Gemini:ApiKey in appsettings (or GEMINI__APIKEY env var on Cloud Run).
/// </summary>
public sealed class GeminiService(
    IHttpClientFactory httpFactory,
    IConfiguration config,
    ILogger<GeminiService> logger) : IGeminiService
{
    private const string GeminiEndpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

    // â”€â”€ Gemini REST API request/response records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private sealed record GeminiRequest(
        [property: JsonPropertyName("contents")] IReadOnlyList<GContent> Contents,
        [property: JsonPropertyName("generationConfig")] GGenConfig GenerationConfig);

    private sealed record GContent(
        [property: JsonPropertyName("parts")] IReadOnlyList<GPart> Parts);

    private sealed record GPart(
        [property: JsonPropertyName("text")] string Text);

    private sealed record GGenConfig(
        [property: JsonPropertyName("responseMimeType")] string ResponseMimeType,
        [property: JsonPropertyName("temperature")] double Temperature = 0.7);

    private sealed record GeminiResponse(
        [property: JsonPropertyName("candidates")] IReadOnlyList<GCandidate>? Candidates);

    private sealed record GCandidate(
        [property: JsonPropertyName("content")] GContent Content);

    // â”€â”€ JSON shape we ask Gemini to return â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private sealed record GItinerary(
        [property: JsonPropertyName("title")] string Title,
        [property: JsonPropertyName("days")] IReadOnlyList<GDay> Days);

    private sealed record GDay(
        [property: JsonPropertyName("dayNumber")] int DayNumber,
        [property: JsonPropertyName("theme")] string Theme,
        [property: JsonPropertyName("summary")] string Summary,
        [property: JsonPropertyName("activities")] IReadOnlyList<GActivity> Activities);

    private sealed record GActivity(
        [property: JsonPropertyName("orderIndex")] int OrderIndex,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("description")] string Description,
        [property: JsonPropertyName("category")] string Category,
        [property: JsonPropertyName("address")] string Address,
        [property: JsonPropertyName("startTime")] string StartTime,
        [property: JsonPropertyName("endTime")] string EndTime,
        [property: JsonPropertyName("estimatedCostUsd")] decimal EstimatedCostUsd,
        [property: JsonPropertyName("weatherNote")] string? WeatherNote);

    private static readonly JsonSerializerOptions _json =
        new() { PropertyNameCaseInsensitive = true };

    // â”€â”€ Public entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    public async Task<(string Title, List<ItineraryDay> Days, decimal EstimatedCost)>
        GenerateItineraryAsync(PlanTripRequest request, CancellationToken ct = default)
    {
        var apiKey = config["Gemini:ApiKey"];
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            try
            {
                return await GenerateWithGeminiAsync(request, apiKey, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "Gemini API call failed â€” falling back to template generator");
            }
        }

        return GenerateFromTemplate(request);
    }

    // â”€â”€ Gemini AI path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private async Task<(string Title, List<ItineraryDay> Days, decimal EstimatedCost)>
        GenerateWithGeminiAsync(PlanTripRequest request, string apiKey, CancellationToken ct)
    {
        int numDays = Math.Max(request.EndDate.DayNumber - request.StartDate.DayNumber + 1, 1);
        string interests = request.Interests.Count > 0
            ? string.Join(", ", request.Interests) : "general sightseeing";
        string constraints = request.Constraints.Count > 0
            ? $"Constraints: {string.Join(", ", request.Constraints)}." : "";
        string specialRequests = string.IsNullOrWhiteSpace(request.UserPrompt)
            ? "" : $"\nSpecial requests: {request.UserPrompt}";

        // $$"""...""" = double-dollar raw string: {{var}} is interpolation, single { } are literals
        string prompt = $$"""
            You are an expert travel planner. Generate a detailed {{numDays}}-day itinerary for a trip to {{request.Destination}}.
            Trip dates: {{request.StartDate:yyyy-MM-dd}} to {{request.EndDate:yyyy-MM-dd}}.
            Interests: {{interests}}. {{constraints}}{{specialRequests}}
            Total budget: ${{request.BudgetUsd}} USD.

            Return ONLY valid JSON â€” no markdown fences, no extra text â€” matching this exact schema:
            {
              "title": "string (catchy trip title)",
              "days": [
                {
                  "dayNumber": 1,
                  "theme": "string (e.g. Arrival & First Impressions)",
                  "summary": "string (1-2 sentence overview of the day)",
                  "activities": [
                    {
                      "orderIndex": 1,
                      "name": "string",
                      "description": "string (2-3 sentences with local tips)",
                      "category": "Sightseeing|Food|Adventure|Culture|Shopping|Other",
                      "address": "string (neighbourhood or landmark)",
                      "startTime": "HH:mm",
                      "endTime": "HH:mm",
                      "estimatedCostUsd": 0.00,
                      "weatherNote": "string or null"
                    }
                  ]
                }
              ]
            }
            Include exactly 4 activities per day (morning, lunch, afternoon, dinner/evening).
            Distribute the ${{request.BudgetUsd}} budget realistically across all days.
            """;

        var body = new GeminiRequest(
            Contents: [new GContent([new GPart(prompt)])],
            GenerationConfig: new GGenConfig("application/json"));

        var http = httpFactory.CreateClient("gemini");
        var url = $"{GeminiEndpoint}?key={apiKey}";

        using var response = await http.PostAsJsonAsync(url, body, _json, ct);
        response.EnsureSuccessStatusCode();

        var geminiResp = await response.Content.ReadFromJsonAsync<GeminiResponse>(_json, ct)
            ?? throw new InvalidOperationException("Empty response from Gemini");

        string rawJson = geminiResp.Candidates?[0].Content.Parts[0].Text
            ?? throw new InvalidOperationException("No content in Gemini response");

        // Strip markdown fences if Gemini includes them despite instructions
        rawJson = rawJson.Trim();
        if (rawJson.StartsWith("```")) rawJson = rawJson[(rawJson.IndexOf('\n') + 1)..];
        if (rawJson.EndsWith("```")) rawJson = rawJson[..rawJson.LastIndexOf("```")].TrimEnd();

        var itinerary = JsonSerializer.Deserialize<GItinerary>(rawJson, _json)
            ?? throw new InvalidOperationException("Failed to deserialise Gemini itinerary");

        var days = itinerary.Days.Select((gDay, i) => new ItineraryDay
        {
            Id = Guid.NewGuid(),
            DayNumber = gDay.DayNumber,
            Date = request.StartDate.AddDays(i),
            Theme = gDay.Theme,
            Summary = gDay.Summary,
            EstimatedDayCostUsd = gDay.Activities.Sum(a => a.EstimatedCostUsd),
            Activities = gDay.Activities.Select(a => new Activity
            {
                Id = Guid.NewGuid(),
                OrderIndex = a.OrderIndex,
                Name = a.Name,
                Description = a.Description,
                Category = a.Category,
                Address = a.Address,
                StartTime = TryParseTime(a.StartTime),
                EndTime = TryParseTime(a.EndTime),
                EstimatedCostUsd = a.EstimatedCostUsd,
                WeatherNote = a.WeatherNote
            }).ToList()
        }).ToList();

        decimal total = days.Sum(d => d.EstimatedDayCostUsd);
        logger.LogInformation(
            "Gemini generated itinerary: {Title} ({Days} days, ~${Cost})",
            itinerary.Title, days.Count, total);

        return (itinerary.Title, days, total);
    }

    private static TimeOnly TryParseTime(string? raw)
    {
        if (TimeOnly.TryParse(raw, out var t)) return t;
        return new TimeOnly(9, 0);
    }

    // â”€â”€ Template fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private (string Title, List<ItineraryDay> Days, decimal EstimatedCost)
        GenerateFromTemplate(PlanTripRequest request)
    {
        logger.LogInformation(
            "Using template generator for {Destination} (no Gemini API key configured)",
            request.Destination);

        int totalDays = Math.Max(request.EndDate.DayNumber - request.StartDate.DayNumber + 1, 1);
        decimal dailyBudget = request.BudgetUsd / totalDays;
        string primaryInterest = request.Interests.Count > 0 ? request.Interests[0] : "Culture";

        var days = new List<ItineraryDay>(totalDays);
        for (int i = 0; i < totalDays; i++)
        {
            string interest = request.Interests.Count > 0
                ? request.Interests[i % request.Interests.Count]
                : "Culture";
            var activities = BuildDayActivities(request.Destination, interest, i, dailyBudget);
            string theme = DayThemes[Math.Min(i, DayThemes.Length - 1)];

            days.Add(new ItineraryDay
            {
                Id = Guid.NewGuid(),
                DayNumber = i + 1,
                Date = request.StartDate.AddDays(i),
                Theme = theme,
                Summary = $"Day {i + 1} in {request.Destination}: {theme.ToLower()} â€” explore {interest.ToLower()} highlights.",
                EstimatedDayCostUsd = activities.Sum(a => a.EstimatedCostUsd),
                Activities = activities
            });
        }

        decimal estimatedTotal = days.Sum(d => d.EstimatedDayCostUsd);
        string title = totalDays == 1
            ? $"One Day in {request.Destination}"
            : $"{totalDays}-Day {request.Destination} {primaryInterest} Experience";

        return (title, days, estimatedTotal);
    }

    // â”€â”€ Template data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private static readonly Dictionary<string, (string[] Morning, string[] Afternoon, string[] Evening)>
        InterestTemplates = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Culture"]   = (["Visit the national museum", "Explore the historic old town", "Tour the city art gallery"],
                             ["Guided heritage walking tour", "Visit traditional craft markets", "Explore a historical palace"],
                             ["Traditional cultural performance", "Dinner at a heritage restaurant", "Evening monument visit"]),
            ["Adventure"] = (["Morning hike to a scenic viewpoint", "Rock climbing excursion", "Sunrise kayaking tour"],
                             ["Mountain biking trail", "Whitewater rafting experience", "Paragliding session"],
                             ["Bonfire and stargazing", "Night hiking with a guide", "Sunset cliff-top walk"]),
            ["Food"]      = (["Street food breakfast tour", "Local market food tasting walk", "Traditional cooking class"],
                             ["Food district lunch exploration", "Specialty coffee and desserts tour", "Local brewery visit"],
                             ["Fine dining experience", "Night street food market", "Rooftop restaurant with city views"]),
            ["Nature"]    = (["Sunrise walk in a national park", "Birdwatching tour", "Botanical garden visit"],
                             ["Waterfall or lake excursion", "Scenic boat ride", "Forest canopy walk"],
                             ["Sunset at a scenic overlook", "Night safari or nature tour", "Campfire by the lake"]),
            ["History"]   = (["Ancient ruins or archaeological site", "City oldest religious site tour", "Historical district walk"],
                             ["Museum of history and civilisation", "Colonial-era architecture tour", "Underground history tour"],
                             ["Traditional folklore dinner", "Guided ghost tour of the old city", "Historical storytelling evening"]),
            ["Shopping"]  = (["Local artisan market and souvenirs", "Fashion district morning stroll", "Antique market exploration"],
                             ["Main shopping boulevard", "Spice and textile bazaar", "Designer outlet or mall"],
                             ["Night market with local handicrafts", "Luxury shopping avenue", "Last-minute gift shopping"]),
            ["Wellness"]  = (["Sunrise yoga on the beach", "Spa and traditional massage", "Meditation centre session"],
                             ["Healthy lunch at an organic cafÃ©", "Hot spring or float therapy soak", "Ayurvedic treatment"],
                             ["Sunset beach walk", "Sound healing or reiki session", "Farm-to-table wellness dinner"]),
            ["Art"]       = (["Contemporary art museum", "Street art district walking tour", "Artist studio visit"],
                             ["Gallery hop in the arts quarter", "Pottery or painting workshop", "Photography walk"],
                             ["Live music at a local venue", "Art-house cinema screening", "Open-mic night"]),
            ["Nightlife"] = (["Late breakfast and leisurely city stroll", "Rooftop brunch", "Afternoon beach club"],
                             ["Happy hour at a sky bar", "Bar-hopping in the entertainment district", "Sunset cruise with drinks"],
                             ["Live music venue or jazz club", "Dancing at a local nightclub", "Late-night food tour"]),
            ["Sports"]    = (["Morning jog or cycle around the city", "Swimming at the local beach", "Golf or tennis session"],
                             ["Attend a local sports event", "Team sports activity", "Water sports â€” surfing or snorkelling"],
                             ["Sports bar for a live game", "Bowling or billiards evening", "Evening run along the waterfront"]),
        };

    private static readonly string[] DefaultMorning   = ["Explore the city centre", "Visit the main tourist attraction", "Morning walk along the promenade"];
    private static readonly string[] DefaultAfternoon = ["Enjoy a local cuisine lunch", "Afternoon sightseeing tour", "Visit a local market"];
    private static readonly string[] DefaultEvening   = ["Sunset viewpoint visit", "Dinner at a recommended restaurant", "Evening stroll in the city"];

    private static readonly string[] DayThemes =
    [
        "Arrival & First Impressions", "Cultural Immersion", "Adventure & Exploration",
        "Local Life & Hidden Gems",    "Nature & Scenic Beauty", "Food & Markets",
        "Relaxation & Reflection",     "Off the Beaten Path",   "Highlights & Favourites",
        "Farewell Day"
    ];

    private static List<Activity> BuildDayActivities(
        string destination, string interest, int dayIndex, decimal dailyBudget)
    {
        var (morning, afternoon, evening) = InterestTemplates.TryGetValue(interest, out var t)
            ? t : (DefaultMorning, DefaultAfternoon, DefaultEvening);

        static string Pick(string[] pool, int idx) => pool[idx % pool.Length];

        decimal morningCost   = Math.Round(dailyBudget * 0.25m, 2);
        decimal lunchCost     = Math.Round(dailyBudget * 0.20m, 2);
        decimal afternoonCost = Math.Round(dailyBudget * 0.30m, 2);
        decimal dinnerCost    = Math.Round(dailyBudget * 0.25m, 2);

        return
        [
            new() { Id = Guid.NewGuid(), OrderIndex = 1,
                Name = Pick(morning, dayIndex),
                Description = $"Start your morning in {destination} with this {interest.ToLower()} experience.",
                Category = MapInterestToCategory(interest), Address = $"{destination} â€” City Centre",
                StartTime = new TimeOnly(9, 0), EndTime = new TimeOnly(11, 30),
                EstimatedCostUsd = morningCost, WeatherNote = "Best enjoyed in clear weather." },
            new() { Id = Guid.NewGuid(), OrderIndex = 2,
                Name = $"Lunch at a local {destination} restaurant",
                Description = $"Enjoy traditional {destination} cuisine and explore local flavours.",
                Category = "Food", Address = $"{destination} â€” Restaurant District",
                StartTime = new TimeOnly(12, 0), EndTime = new TimeOnly(13, 30),
                EstimatedCostUsd = lunchCost },
            new() { Id = Guid.NewGuid(), OrderIndex = 3,
                Name = Pick(afternoon, dayIndex),
                Description = $"Afternoon {interest.ToLower()} activity â€” a highlight of your {destination} visit.",
                Category = MapInterestToCategory(interest), Address = $"{destination} â€” {interest} District",
                StartTime = new TimeOnly(14, 0), EndTime = new TimeOnly(17, 0),
                EstimatedCostUsd = afternoonCost },
            new() { Id = Guid.NewGuid(), OrderIndex = 4,
                Name = Pick(evening, dayIndex),
                Description = $"End the day with an evening experience in {destination}.",
                Category = "Food", Address = $"{destination} â€” Waterfront / Main Square",
                StartTime = new TimeOnly(19, 0), EndTime = new TimeOnly(21, 30),
                EstimatedCostUsd = dinnerCost }
        ];
    }

    private static string MapInterestToCategory(string interest) => interest switch
    {
        "Food" or "Nightlife"           => "Food",
        "Adventure" or "Sports"         => "Adventure",
        "Culture" or "History" or "Art" => "Culture",
        "Shopping"                      => "Shopping",
        "Nature" or "Wellness"          => "Other",
        _                               => "Sightseeing"
    };
}

