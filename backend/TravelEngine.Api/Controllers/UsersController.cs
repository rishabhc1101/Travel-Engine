using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TravelEngine.Api.Data;
using TravelEngine.Api.DTOs;
using TravelEngine.Api.Models;

namespace TravelEngine.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController(AppDbContext db) : ControllerBase
{
    private string CurrentUid => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("UID claim missing");

    // POST /api/users/profile  — upsert on first login
    [HttpPost("profile")]
    public async Task<ActionResult<UserProfileDto>> UpsertProfile(
        [FromBody] UpsertUserRequest request, CancellationToken ct)
    {
        var uid = CurrentUid;
        var existing = await db.Users.FindAsync([uid], ct);

        if (existing is null)
        {
            var user = new User
            {
                Uid = uid,
                DisplayName = request.DisplayName,
                Email = request.Email,
                TravelPreferences = request.TravelPreferences
            };
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);
            return CreatedAtAction(nameof(GetProfile), MapToDto(user));
        }

        existing.DisplayName = request.DisplayName;
        existing.Email = request.Email;
        existing.TravelPreferences = request.TravelPreferences ?? existing.TravelPreferences;
        await db.SaveChangesAsync(ct);
        return Ok(MapToDto(existing));
    }

    // GET /api/users/profile
    [HttpGet("profile")]
    public async Task<ActionResult<UserProfileDto>> GetProfile(CancellationToken ct)
    {
        var uid = CurrentUid;
        var user = await db.Users.FindAsync([uid], ct);
        if (user is null) return NotFound();
        return Ok(MapToDto(user));
    }

    // PATCH /api/users/preferences
    [HttpPatch("preferences")]
    public async Task<ActionResult<UserProfileDto>> UpdatePreferences(
        [FromBody] string preferencesJson, CancellationToken ct)
    {
        var uid = CurrentUid;
        var user = await db.Users.FindAsync([uid], ct);
        if (user is null) return NotFound();
        user.TravelPreferences = preferencesJson;
        await db.SaveChangesAsync(ct);
        return Ok(MapToDto(user));
    }

    private static UserProfileDto MapToDto(User u) =>
        new(u.Uid, u.DisplayName, u.Email, u.TravelPreferences, u.CreatedAt);
}
