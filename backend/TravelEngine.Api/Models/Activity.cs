using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TravelEngine.Api.Models;

public class Activity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ItineraryDayId { get; set; }

    public int OrderIndex { get; set; }

    [Required, MaxLength(512)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(256)]
    public string? Category { get; set; }

    [MaxLength(512)]
    public string? Address { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal EstimatedCostUsd { get; set; }

    [MaxLength(1024)]
    public string? GooglePlaceId { get; set; }

    [MaxLength(1024)]
    public string? BookingUrl { get; set; }

    [MaxLength(256)]
    public string? WeatherNote { get; set; }

    [ForeignKey(nameof(ItineraryDayId))]
    public ItineraryDay? ItineraryDay { get; set; }
}
