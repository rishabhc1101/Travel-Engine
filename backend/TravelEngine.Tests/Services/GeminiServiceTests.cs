using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using TravelEngine.Api.DTOs;
using TravelEngine.Api.Services;

namespace TravelEngine.Tests.Services;

public class GeminiServiceTests
{
    private static GeminiService CreateService(string? apiKey = "")
    {
        var httpFactory = new Mock<IHttpClientFactory>();
        httpFactory
            .Setup(f => f.CreateClient("gemini"))
            .Returns(new HttpClient());

        var config = new Mock<IConfiguration>();
        config.Setup(c => c["Gemini:ApiKey"]).Returns(apiKey);

        var logger = new Mock<ILogger<GeminiService>>();

        return new GeminiService(httpFactory.Object, config.Object, logger.Object);
    }

    private static PlanTripRequest MakeRequest(int durationDays = 3, string destination = "Paris, France") =>
        new PlanTripRequest(
            Destination: destination,
            StartDate: DateOnly.FromDateTime(DateTime.Today),
            EndDate: DateOnly.FromDateTime(DateTime.Today.AddDays(durationDays)),
            BudgetUsd: 1500m,
            UserPrompt: "Love museums and food",
            Interests: new List<string> { "Culture", "Food" },
            Constraints: new List<string>()
        );

    // ── Template fallback tests ──────────────────────────────────────────────

    [Fact]
    public async Task GenerateItinerary_EmptyApiKey_ReturnsTemplateResult()
    {
        var svc = CreateService(apiKey: "");
        var result = await svc.GenerateItineraryAsync(MakeRequest());

        Assert.NotNull(result.Title);
        Assert.NotEmpty(result.Title);
        Assert.NotEmpty(result.Days);
    }

    [Fact]
    public async Task GenerateItinerary_NullApiKey_ReturnsTemplateResult()
    {
        var svc = CreateService(apiKey: null);
        var result = await svc.GenerateItineraryAsync(MakeRequest());

        Assert.NotEmpty(result.Days);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(5)]
    [InlineData(7)]
    public async Task GenerateItinerary_Template_CorrectDayCount(int durationDays)
    {
        var svc = CreateService(apiKey: "");
        var result = await svc.GenerateItineraryAsync(MakeRequest(durationDays));

        Assert.Equal(durationDays, result.Days.Count);
    }

    [Fact]
    public async Task GenerateItinerary_Template_EachDayHasAtLeastOneActivity()
    {
        var svc = CreateService(apiKey: "");
        var result = await svc.GenerateItineraryAsync(MakeRequest(durationDays: 3));

        foreach (var day in result.Days)
        {
            Assert.NotEmpty(day.Activities);
        }
    }

    [Fact]
    public async Task GenerateItinerary_Template_DayNumbersAreSequential()
    {
        var svc = CreateService(apiKey: "");
        var result = await svc.GenerateItineraryAsync(MakeRequest(durationDays: 4));

        var numbers = result.Days.Select(d => d.DayNumber).ToList();
        Assert.Equal(Enumerable.Range(1, 4).ToList(), numbers);
    }

    [Fact]
    public async Task GenerateItinerary_Template_TitleContainsDestination()
    {
        var svc = CreateService(apiKey: "");
        var result = await svc.GenerateItineraryAsync(MakeRequest(destination: "Tokyo, Japan"));

        Assert.Contains("Tokyo", result.Title, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GenerateItinerary_Template_EstimatedCostIsPositive()
    {
        var svc = CreateService(apiKey: "");
        var result = await svc.GenerateItineraryAsync(MakeRequest());

        Assert.True(result.EstimatedCost > 0);
    }

    [Fact]
    public async Task GenerateItinerary_Template_CostDoesNotExceedBudget()
    {
        var svc = CreateService(apiKey: "");
        var result = await svc.GenerateItineraryAsync(MakeRequest());

        Assert.True(result.EstimatedCost <= 1500m * 1.2m, // allow 20 % tolerance
            $"Estimated cost {result.EstimatedCost} exceeds budget by too much");
    }

    [Fact]
    public async Task GenerateItinerary_Template_ActivitiesHaveNames()
    {
        var svc = CreateService(apiKey: "");
        var result = await svc.GenerateItineraryAsync(MakeRequest());

        var allActivities = result.Days.SelectMany(d => d.Activities);
        Assert.All(allActivities, a => Assert.False(string.IsNullOrWhiteSpace(a.Name)));
    }
}
