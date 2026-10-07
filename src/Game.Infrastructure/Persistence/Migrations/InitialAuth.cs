using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Game.Infrastructure.Persistence.Migrations;

[DbContext(typeof(GameDbContext))]
[Migration("202610080001_InitialAuth")]
public sealed class InitialAuth : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "users",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Username = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                PasswordHash = table.Column<string>(type: "text", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_users", x => x.Id));
        migrationBuilder.CreateIndex("IX_users_Username", "users", "Username", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable("users");
}
