namespace TravelEngine.Api.DTOs;

// ── Trip planning ──────────────────────────────────────────────
public record PlanTripRequest(
    string Destination,
    DateOnly StartDate,
    DateOnly EndDate,
    decimal BudgetUsd,
    string UserPrompt,
    List<string> Interests,
    List<string> Constraints
);

public record TripSummaryDto(
    Guid Id,
    string Title,
    string Destination,
    DateOnly StartDate,
    DateOnly EndDate,
    decimal BudgetUsd,
    decimal EstimatedCostUsd,
    string Status,
    DateTime CreatedAt
);

public record TripDetailDto(
    Guid Id,
    string Title,
    string Destination,
    double Latitude,
    double Longitude,
    DateOnly StartDate,
    DateOnly EndDate,
    decimal BudgetUsd,
    decimal EstimatedCostUsd,
    string Status,
    List<ItineraryDayDto> Days
);

public record ItineraryDayDto(
    Guid Id,
    int DayNumber,
    DateOnly Date,
    string? Theme,
    string? Summary,
    decimal EstimatedDayCostUsd,
    List<ActivityDto> Activities
);

public record ActivityDto(
    Guid Id,
    int OrderIndex,
    string Name,
    string? Description,
    string? Category,
    string? Address,
    double? Latitude,
    double? Longitude,
    string? StartTime,
    string? EndTime,
    decimal EstimatedCostUsd,
    string? GooglePlaceId,
    string? BookingUrl,
    string? WeatherNote
);

// ── User profile ──────────────────────────────────────────────
public record UpsertUserRequest(
    string DisplayName,
    string Email,
    string? TravelPreferences
);

public record UserProfileDto(
    string Uid,
    string DisplayName,
    string Email,
    string? TravelPreferences,
    DateTime CreatedAt
);
