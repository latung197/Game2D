using System.Text.Json;
using Game.Infrastructure.Persistence;
using Game.Shared.Contracts;
using Microsoft.EntityFrameworkCore;

var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Game");
if (string.IsNullOrWhiteSpace(connection))
{
    var root = Directory.Exists(Path.Combine(Environment.CurrentDirectory, "src", "Game.Api"))
        ? Environment.CurrentDirectory : Path.GetFullPath("..");
    var settings = Path.Combine(root, "src", "Game.Api", "appsettings.Development.json");
    using var document = JsonDocument.Parse(await File.ReadAllTextAsync(settings));
    connection = document.RootElement.GetProperty("ConnectionStrings").GetProperty("Game").GetString();
}
if (string.IsNullOrWhiteSpace(connection)) throw new Exception("Missing test database connection.");
var options = new DbContextOptionsBuilder<GameDbContext>().UseNpgsql(connection).Options;
var first = Guid.NewGuid();
var second = Guid.NewGuid();
var matchId = Guid.NewGuid().ToString("N")[..8];
var result = new MatchResult(matchId, first, "probe-winner", DateTimeOffset.UtcNow,
    [new MatchPlayerResult(first, "probe-winner", 1, 2, 0),
     new MatchPlayerResult(second, "probe-second", 2, 0, 1)]);

try
{
    await using (var db = new GameDbContext(options))
    {
        var store = new EfMatchResultStore(db);
        if (!await store.SaveIfMissingAsync(result, CancellationToken.None))
            throw new Exception("First save was rejected.");
    }
    await using (var db = new GameDbContext(options))
    {
        var store = new EfMatchResultStore(db);
        if (await store.SaveIfMissingAsync(result, CancellationToken.None))
            throw new Exception("Duplicate save was accepted.");
        var read = await store.GetForPlayerAsync(matchId, second, CancellationToken.None);
        if (read?.Players.Count != 2 || read.WinnerId != first)
            throw new Exception("Participant cannot read saved result.");
        if (await store.GetForPlayerAsync(matchId, Guid.NewGuid(), CancellationToken.None) is not null)
            throw new Exception("Outsider can read saved result.");
        var stats = await db.PlayerStatistics.AsNoTracking()
            .Where(player => player.PlayerId == first || player.PlayerId == second)
            .OrderBy(player => player.PlayerId).ToArrayAsync();
        if (stats.Length != 2 || stats.Any(player => player.Matches != 1) ||
            stats.Single(player => player.PlayerId == first) is not
                { Wins: 1, Kills: 2, Deaths: 0 } ||
            stats.Single(player => player.PlayerId == second) is not
                { Wins: 0, Kills: 0, Deaths: 1 })
            throw new Exception("Duplicate save changed statistics.");
    }
    Console.WriteLine("PASS: duplicate result ignored, statistics counted once and access restricted");
}
finally
{
    await using var cleanup = new GameDbContext(options);
    await cleanup.MatchHistory.Where(match => match.MatchId == matchId).ExecuteDeleteAsync();
    await cleanup.PlayerStatistics.Where(player => player.PlayerId == first || player.PlayerId == second)
        .ExecuteDeleteAsync();
}
