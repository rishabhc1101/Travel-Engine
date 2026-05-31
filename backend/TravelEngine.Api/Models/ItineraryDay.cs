using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TravelEngine.Api.Models;

public class ItineraryDay
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TripId { get; set; }

    public int DayNumber { get; set; }

    public DateOnly Date { get; set; }

    [MaxLength(512)]
    public string? Theme { get; set; }

    [MaxLength(2000)]
    public string? Summary { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal EstimatedDayCostUsd { get; set; }

    [ForeignKey(nameof(TripId))]
    public Trip? Trip { get; set; }

    public ICollection<Activity> Activities { get; set; } = new List<Activity>();
}
