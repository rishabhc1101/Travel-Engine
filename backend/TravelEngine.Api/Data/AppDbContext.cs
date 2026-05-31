using Microsoft.EntityFrameworkCore;
using TravelEngine.Api.Models;

namespace TravelEngine.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Trip> Trips => Set<Trip>();
    public DbSet<ItineraryDay> ItineraryDays => Set<ItineraryDay>();
    public DbSet<Activity> Activities => Set<Activity>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<User>(e =>
        {
            e.HasKey(u => u.Uid);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.TravelPreferences).HasColumnType("jsonb");
        });

        builder.Entity<Trip>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasOne(t => t.User)
             .WithMany(u => u.Trips)
             .HasForeignKey(t => t.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.Property(t => t.Status).HasConversion<string>();
            e.Property(t => t.Interests).HasColumnType("jsonb");
            e.Property(t => t.Constraints).HasColumnType("jsonb");
            e.HasIndex(t => t.UserId);
        });

        builder.Entity<ItineraryDay>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasOne(d => d.Trip)
             .WithMany(t => t.ItineraryDays)
             .HasForeignKey(d => d.TripId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(d => new { d.TripId, d.DayNumber }).IsUnique();
        });

        builder.Entity<Activity>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasOne(a => a.ItineraryDay)
             .WithMany(d => d.Activities)
             .HasForeignKey(a => a.ItineraryDayId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(a => new { a.ItineraryDayId, a.OrderIndex });
        });
    }
}
