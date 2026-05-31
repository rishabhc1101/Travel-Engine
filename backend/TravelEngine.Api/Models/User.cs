using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TravelEngine.Api.Models;

public class User
{
    [Key]
    public string Uid { get; set; } = string.Empty;

    [Required, MaxLength(256)]
    public string DisplayName { get; set; } = string.Empty;

    [Required, MaxLength(320)]
    public string Email { get; set; } = string.Empty;

    [Column(TypeName = "jsonb")]
    public string? TravelPreferences { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Trip> Trips { get; set; } = new List<Trip>();
}
