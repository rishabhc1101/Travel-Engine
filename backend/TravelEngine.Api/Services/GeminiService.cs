using TravelEngine.Api.DTOs;
using TravelEngine.Api.Models;

namespace TravelEngine.Api.Services;

public interface IGeminiService
{
    Task<(string Title, List<ItineraryDay> Days, decimal EstimatedCost)> GenerateItineraryAsync(
        PlanTripRequest request, CancellationToken ct = default);
}

/// <summary>
/// Template-based itinerary generator that produces a structured day-by-day travel plan
/// using curated activity patterns grouped by traveller interest.
/// </summary>
/// <remarks>
/// To enable AI-powered generation, implement <see cref="IGeminiService"/> with a
/// Vertex AI Gemini client and register it in Program.cs:
/// <c>services.AddScoped&lt;IGeminiService, VertexAiItineraryService&gt;();</c>
/// </remarks>
public sealed class GeminiService(ILogger<GeminiService> logger) : IGeminiService
{
    // Maps each interest to morning / afternoon / evening activity templates
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
                             ["Healthy lunch at an organic café", "Hot spring or float therapy soak", "Ayurvedic treatment"],
                             ["Sunset beach walk", "Sound healing or reiki session", "Farm-to-table wellness dinner"]),
            ["Art"]       = (["Contemporary art museum", "Street art district walking tour", "Artist studio visit"],
                             ["Gallery hop in the arts quarter", "Pottery or painting workshop", "Photography walk"],
                             ["Live music at a local venue", "Art-house cinema screening", "Open-mic night"]),
            ["Nightlife"] = (["Late breakfast and leisurely city stroll", "Rooftop brunch", "Afternoon beach club"],
                             ["Happy hour at a sky bar", "Bar-hopping in the entertainment district", "Sunset cruise with drinks"],
                             ["Live music venue or jazz club", "Dancing at a local nightclub", "Late-night food tour"]),
            ["Sports"]    = (["Morning jog or cycle around the city", "Swimming at the local beach", "Golf or tennis session"],
                             ["Attend a local sports event", "Team sports activity", "Water sports — surfing or snorkelling"],
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

    public Task<(string Title, List<ItineraryDay> Days, decimal EstimatedCost)>
        GenerateItineraryAsync(PlanTripRequest request, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();

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
                Summary = $"Day {i + 1} in {request.Destination}: {theme.ToLower()} — explore {interest.ToLower()} highlights and local experiences.",
                EstimatedDayCostUsd = activities.Sum(a => a.EstimatedCostUsd),
                Activities = activities
            });
        }

        decimal estimatedTotal = days.Sum(d => d.EstimatedDayCostUsd);
        string title = totalDays == 1
            ? $"One Day in {request.Destination}"
            : $"{totalDays}-Day {request.Destination} {primaryInterest} Experience";

        logger.LogInformation("Generated template itinerary: {Title} ({Days} days, ~${Cost})",
            title, totalDays, estimatedTotal);

        return Task.FromResult((title, days, estimatedTotal));
    }

    private static List<Activity> BuildDayActivities(
        string destination, string interest, int dayIndex, decimal dailyBudget)
    {
        var (morning, afternoon, evening) = InterestTemplates.TryGetValue(interest, out var t)
            ? t
            : (DefaultMorning, DefaultAfternoon, DefaultEvening);

        static string Pick(string[] pool, int idx) => pool[idx % pool.Length];

        decimal morningCost   = Math.Round(dailyBudget * 0.25m, 2);
        decimal lunchCost     = Math.Round(dailyBudget * 0.20m, 2);
        decimal afternoonCost = Math.Round(dailyBudget * 0.30m, 2);
        decimal dinnerCost    = Math.Round(dailyBudget * 0.25m, 2);

        return new List<Activity>
        {
            new()
            {
                Id           = Guid.NewGuid(),
                OrderIndex   = 1,
                Name         = Pick(morning, dayIndex),
                Description  = $"Start your morning in {destination} with this {interest.ToLower()} experience.",
                Category     = MapInterestToCategory(interest),
                Address      = $"{destination} — City Centre",
                StartTime    = new TimeOnly(9, 0),
                EndTime      = new TimeOnly(11, 30),
                EstimatedCostUsd = morningCost,
                WeatherNote  = "Best enjoyed in clear weather; bring sunscreen."
            },
            new()
            {
                Id           = Guid.NewGuid(),
                OrderIndex   = 2,
                Name         = $"Lunch at a local {destination} restaurant",
                Description  = $"Enjoy traditional {destination} cuisine and explore local flavours.",
                Category     = "Food",
                Address      = $"{destination} — Restaurant District",
                StartTime    = new TimeOnly(12, 0),
                EndTime      = new TimeOnly(13, 30),
                EstimatedCostUsd = lunchCost
            },
            new()
            {
                Id           = Guid.NewGuid(),
                OrderIndex   = 3,
                Name         = Pick(afternoon, dayIndex),
                Description  = $"Afternoon {interest.ToLower()} activity — a highlight of your {destination} visit.",
                Category     = MapInterestToCategory(interest),
                Address      = $"{destination} — {interest} District",
                StartTime    = new TimeOnly(14, 0),
                EndTime      = new TimeOnly(17, 0),
                EstimatedCostUsd = afternoonCost
            },
            new()
            {
                Id           = Guid.NewGuid(),
                OrderIndex   = 4,
                Name         = Pick(evening, dayIndex),
                Description  = $"End the day with an evening experience in {destination}.",
                Category     = "Food",
                Address      = $"{destination} — Waterfront / Main Square",
                StartTime    = new TimeOnly(19, 0),
                EndTime      = new TimeOnly(21, 30),
                EstimatedCostUsd = dinnerCost
            }
        };
    }

    private static string MapInterestToCategory(string interest) => interest switch
    {
        "Food" or "Nightlife"              => "Food",
        "Adventure" or "Sports"            => "Adventure",
        "Culture" or "History" or "Art"    => "Culture",
        "Shopping"                         => "Shopping",
        "Nature" or "Wellness"             => "Other",
        _                                  => "Sightseeing"
    };
}

