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
    }
}
