using Microsoft.EntityFrameworkCore;

namespace Game.Infrastructure.Persistence;

public sealed class UserEntity
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class GameDbContext(DbContextOptions<GameDbContext> options) : DbContext(options)
{
    public DbSet<UserEntity> Users => Set<UserEntity>();

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
    }
}
