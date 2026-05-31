using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TravelEngine.Api.Models;

public class Trip
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public string UserId { get; set; } = string.Empty;

    [Required, MaxLength(512)]
    public string Title { get; set; } = string.Empty;

    [Required, MaxLength(256)]
    public string Destination { get; set; } = string.Empty;

    public double Latitude { get; set; }
    public double Longitude { get; set; }

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal BudgetUsd { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal EstimatedCostUsd { get; set; }

    [MaxLength(2000)]
    public string? UserPrompt { get; set; }

    [Column(TypeName = "jsonb")]
    public string? Interests { get; set; }

    [Column(TypeName = "jsonb")]
    public string? Constraints { get; set; }

    public TripStatus Status { get; set; } = TripStatus.Draft;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }

    public ICollection<ItineraryDay> ItineraryDays { get; set; } = new List<ItineraryDay>();
}

public enum TripStatus
{
    Draft,
    Confirmed,
    InProgress,
    Completed,
    Cancelled
}
