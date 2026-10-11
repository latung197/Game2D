using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Game.Infrastructure.Persistence.Migrations;

[DbContext(typeof(GameDbContext))]
public sealed class GameDbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
        modelBuilder.HasAnnotation("ProductVersion", "10.0.0");
        modelBuilder.Entity<UserEntity>(user =>
        {
            user.Property(x => x.Id).HasColumnType("uuid");
            user.Property(x => x.Username).HasMaxLength(24).IsRequired().HasColumnType("character varying(24)");
            user.Property(x => x.PasswordHash).IsRequired().HasColumnType("text");
            user.Property(x => x.CreatedAt).HasColumnType("timestamp with time zone");
            user.HasKey(x => x.Id);
            user.HasIndex(x => x.Username).IsUnique();
            user.ToTable("users");
        });
        modelBuilder.Entity<MatchHistoryEntity>(match =>
        {
            match.Property(x => x.MatchId).HasMaxLength(32).HasColumnType("character varying(32)");
            match.Property(x => x.WinnerId).HasColumnType("uuid");
            match.Property(x => x.WinnerName).HasMaxLength(24).HasColumnType("character varying(24)");
            match.Property(x => x.EndedAt).HasColumnType("timestamp with time zone");
            match.HasKey(x => x.MatchId);
            match.ToTable("match_history");
        });
        modelBuilder.Entity<MatchPlayerEntity>(player =>
        {
            player.Property(x => x.MatchId).HasMaxLength(32).HasColumnType("character varying(32)");
            player.Property(x => x.PlayerId).HasColumnType("uuid");
            player.Property(x => x.Username).HasMaxLength(24).IsRequired().HasColumnType("character varying(24)");
            player.Property(x => x.Placement).HasColumnType("integer");
            player.Property(x => x.Kills).HasColumnType("integer");
            player.Property(x => x.Deaths).HasColumnType("integer");
            player.HasKey(x => new { x.MatchId, x.PlayerId });
            player.HasIndex(x => x.PlayerId);
            player.ToTable("match_players");
        });
        modelBuilder.Entity<PlayerStatisticsEntity>(statistics =>
        {
            statistics.Property(x => x.PlayerId).HasColumnType("uuid");
            statistics.Property(x => x.Matches).HasColumnType("integer");
            statistics.Property(x => x.Wins).HasColumnType("integer");
            statistics.Property(x => x.Kills).HasColumnType("integer");
            statistics.Property(x => x.Deaths).HasColumnType("integer");
            statistics.HasKey(x => x.PlayerId);
            statistics.ToTable("player_statistics");
        });
        modelBuilder.Entity<MatchHistoryEntity>()
            .HasMany(x => x.Players).WithOne().HasForeignKey(x => x.MatchId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
