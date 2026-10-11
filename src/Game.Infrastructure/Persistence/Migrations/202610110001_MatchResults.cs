using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Game.Infrastructure.Persistence.Migrations;

[DbContext(typeof(GameDbContext))]
[Migration("202610110001_MatchResults")]
public sealed class MatchResults : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "match_history",
            columns: table => new
            {
                MatchId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                WinnerId = table.Column<Guid>(type: "uuid", nullable: true),
                WinnerName = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
                EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_match_history", x => x.MatchId));
        migrationBuilder.CreateTable(
            name: "player_statistics",
            columns: table => new
            {
                PlayerId = table.Column<Guid>(type: "uuid", nullable: false),
                Matches = table.Column<int>(type: "integer", nullable: false),
                Wins = table.Column<int>(type: "integer", nullable: false),
                Kills = table.Column<int>(type: "integer", nullable: false),
                Deaths = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_player_statistics", x => x.PlayerId));
        migrationBuilder.CreateTable(
            name: "match_players",
            columns: table => new
            {
                MatchId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                PlayerId = table.Column<Guid>(type: "uuid", nullable: false),
                Username = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                Placement = table.Column<int>(type: "integer", nullable: false),
                Kills = table.Column<int>(type: "integer", nullable: false),
                Deaths = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_match_players", x => new { x.MatchId, x.PlayerId });
                table.ForeignKey("FK_match_players_match_history_MatchId", x => x.MatchId,
                    "match_history", "MatchId", onDelete: ReferentialAction.Cascade);
            });
        migrationBuilder.CreateIndex("IX_match_players_PlayerId", "match_players", "PlayerId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("match_players");
        migrationBuilder.DropTable("player_statistics");
        migrationBuilder.DropTable("match_history");
    }
}
