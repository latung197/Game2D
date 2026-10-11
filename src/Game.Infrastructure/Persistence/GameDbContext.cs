using Microsoft.EntityFrameworkCore;

namespace Game.Infrastructure.Persistence;

public sealed class UserEntity
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class MatchHistoryEntity
{
    public string MatchId { get; set; } = string.Empty;
    public Guid? WinnerId { get; set; }
    public string? WinnerName { get; set; }
    public DateTimeOffset EndedAt { get; set; }
    public List<MatchPlayerEntity> Players { get; set; } = [];
}

public sealed class MatchPlayerEntity
{
    public string MatchId { get; set; } = string.Empty;
    public Guid PlayerId { get; set; }
    public string Username { get; set; } = string.Empty;
    public int Placement { get; set; }
    public int Kills { get; set; }
    public int Deaths { get; set; }
}

public sealed class PlayerStatisticsEntity
{
    public Guid PlayerId { get; set; }
    public int Matches { get; set; }
    public int Wins { get; set; }
    public int Kills { get; set; }
    public int Deaths { get; set; }
}

public sealed class GameDbContext(DbContextOptions<GameDbContext> options) : DbContext(options)
{
    public DbSet<UserEntity> Users => Set<UserEntity>();
    public DbSet<MatchHistoryEntity> MatchHistory => Set<MatchHistoryEntity>();
    public DbSet<MatchPlayerEntity> MatchPlayers => Set<MatchPlayerEntity>();
    public DbSet<PlayerStatisticsEntity> PlayerStatistics => Set<PlayerStatisticsEntity>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.Entity<UserEntity>(user =>
        {
            user.ToTable("users");
            user.HasKey(x => x.Id);
            user.Property(x => x.Username).HasMaxLength(24).IsRequired();
            user.HasIndex(x => x.Username).IsUnique();
            user.Property(x => x.PasswordHash).IsRequired();
            user.Property(x => x.CreatedAt).IsRequired();
        });
        builder.Entity<MatchHistoryEntity>(match =>
        {
            match.ToTable("match_history");
            match.HasKey(x => x.MatchId);
            match.Property(x => x.MatchId).HasMaxLength(32);
            match.Property(x => x.WinnerName).HasMaxLength(24);
            match.Property(x => x.EndedAt).IsRequired();
            match.HasMany(x => x.Players).WithOne().HasForeignKey(x => x.MatchId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        builder.Entity<MatchPlayerEntity>(player =>
        {
            player.ToTable("match_players");
            player.HasKey(x => new { x.MatchId, x.PlayerId });
            player.Property(x => x.MatchId).HasMaxLength(32);
            player.Property(x => x.Username).HasMaxLength(24).IsRequired();
            player.HasIndex(x => x.PlayerId);
        });
        builder.Entity<PlayerStatisticsEntity>(statistics =>
        {
            statistics.ToTable("player_statistics");
            statistics.HasKey(x => x.PlayerId);
        });
    }
}
