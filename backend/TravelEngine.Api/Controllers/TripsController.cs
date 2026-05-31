using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TravelEngine.Api.Data;
using TravelEngine.Api.DTOs;
using TravelEngine.Api.Models;
using TravelEngine.Api.Services;

namespace TravelEngine.Api.Controllers;

[ApiController]
[Route("api/trips")]
[Authorize]
public class TripsController(
    AppDbContext db,
    IGeminiService gemini,
    IPubSubService pubSub,
    IWeatherService weather,
    ILogger<TripsController> logger) : ControllerBase
{
    private string CurrentUid => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("UID claim missing");

    // POST /api/trips/plan
    [HttpPost("plan")]
    public async Task<ActionResult<TripDetailDto>> PlanTrip(
        [FromBody] PlanTripRequest request, CancellationToken ct)
    {
        if (request.EndDate <= request.StartDate)
            return BadRequest("EndDate must be after StartDate");

        if (request.BudgetUsd <= 0)
            return BadRequest("Budget must be positive");

        var uid = CurrentUid;

        // Ensure user exists
        if (!await db.Users.AnyAsync(u => u.Uid == uid, ct))
            return Unauthorized("User profile not found. Call POST /api/users/profile first.");

        var (title, days, estimatedCost) = await gemini.GenerateItineraryAsync(request, ct);

        // Derive lat/lon from the first activity with coordinates
        double lat = 0, lon = 0;
        var firstActivity = days.SelectMany(d => d.Activities)
            .FirstOrDefault(a => a.Latitude.HasValue);
        if (firstActivity != null)
        {
            lat = firstActivity.Latitude!.Value;
            lon = firstActivity.Longitude!.Value;
        }

        var trip = new Trip
        {
            Id = Guid.NewGuid(),
            UserId = uid,
            Title = title,
            Destination = request.Destination,
            Latitude = lat,
            Longitude = lon,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            BudgetUsd = request.BudgetUsd,
            EstimatedCostUsd = estimatedCost,
            UserPrompt = request.UserPrompt,
            Interests = System.Text.Json.JsonSerializer.Serialize(request.Interests),
            Constraints = System.Text.Json.JsonSerializer.Serialize(request.Constraints),
            Status = TripStatus.Draft
        };

        foreach (var day in days)
        {
            day.TripId = trip.Id;
            foreach (var act in day.Activities)
                act.ItineraryDayId = day.Id;
        }
        trip.ItineraryDays = days;

        db.Trips.Add(trip);
        await db.SaveChangesAsync(ct);

        await pubSub.PublishTripUpdateAsync(trip.Id, $"Itinerary generated for {request.Destination}", ct);

        logger.LogInformation("Trip {tripId} created for user {uid}", trip.Id, uid);
        return CreatedAtAction(nameof(GetTrip), new { id = trip.Id }, MapToDetail(trip));
    }

    // GET /api/trips
    [HttpGet]
    public async Task<ActionResult<List<TripSummaryDto>>> GetMyTrips(CancellationToken ct)
    {
        var uid = CurrentUid;
        var trips = await db.Trips
            .Where(t => t.UserId == uid)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new TripSummaryDto(
                t.Id, t.Title, t.Destination,
                t.StartDate, t.EndDate,
                t.BudgetUsd, t.EstimatedCostUsd,
                t.Status.ToString(), t.CreatedAt))
            .ToListAsync(ct);
        return Ok(trips);
    }

    // GET /api/trips/{id}
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TripDetailDto>> GetTrip(Guid id, CancellationToken ct)
    {
        var trip = await db.Trips
            .Include(t => t.ItineraryDays)
                .ThenInclude(d => d.Activities)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == CurrentUid, ct);

        if (trip is null) return NotFound();
        return Ok(MapToDetail(trip));
    }

    // DELETE /api/trips/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteTrip(Guid id, CancellationToken ct)
    {
        var trip = await db.Trips
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == CurrentUid, ct);
        if (trip is null) return NotFound();
        db.Trips.Remove(trip);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // GET /api/trips/{id}/weather
    [HttpGet("{id:guid}/weather")]
    public async Task<ActionResult<WeatherInfo>> GetTripWeather(Guid id, CancellationToken ct)
    {
        var trip = await db.Trips
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == CurrentUid, ct);
        if (trip is null) return NotFound();

        var info = await weather.GetWeatherAsync(trip.Destination, trip.Latitude, trip.Longitude, ct);
        if (info is null) return StatusCode(503, "Weather service unavailable");
        return Ok(info);
    }

    // GET /api/trips/{id}/stream  — SSE real-time updates
    [HttpGet("{id:guid}/stream")]
    public async Task StreamTripEvents(Guid id, CancellationToken ct)
    {
        var trip = await db.Trips
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == CurrentUid, ct);
        if (trip is null)
        {
            Response.StatusCode = 404;
            return;
        }

        Response.Headers.Append("Content-Type", "text/event-stream");
        Response.Headers.Append("Cache-Control", "no-cache");
        Response.Headers.Append("X-Accel-Buffering", "no");

        await Response.WriteAsync("data: {\"type\":\"connected\"}\n\n", ct);
        await Response.Body.FlushAsync(ct);

        await foreach (var payload in pubSub.SubscribeToTripEventsAsync(id, ct))
        {
            await Response.WriteAsync($"data: {payload}\n\n", ct);
            await Response.Body.FlushAsync(ct);
        }
    }

    // ── Mapping helpers ──────────────────────────────────────────
    private static TripDetailDto MapToDetail(Trip trip) => new(
        trip.Id, trip.Title, trip.Destination,
        trip.Latitude, trip.Longitude,
        trip.StartDate, trip.EndDate,
        trip.BudgetUsd, trip.EstimatedCostUsd,
        trip.Status.ToString(),
        trip.ItineraryDays
            .OrderBy(d => d.DayNumber)
            .Select(d => new ItineraryDayDto(
                d.Id, d.DayNumber, d.Date, d.Theme, d.Summary,
                d.EstimatedDayCostUsd,
                d.Activities
                    .OrderBy(a => a.OrderIndex)
                    .Select(a => new ActivityDto(
                        a.Id, a.OrderIndex, a.Name, a.Description,
                        a.Category, a.Address,
                        a.Latitude, a.Longitude,
                        a.StartTime?.ToString("HH:mm"),
                        a.EndTime?.ToString("HH:mm"),
                        a.EstimatedCostUsd,
                        a.GooglePlaceId, a.BookingUrl, a.WeatherNote))
                    .ToList()))
            .ToList()
    );
}
