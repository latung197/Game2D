using Game.Application.Abstractions;
using Game.Shared.Contracts;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Game.Infrastructure.Persistence;

public sealed class EfMatchResultStore(GameDbContext db) : IMatchResultStore
{
    public async Task<bool> SaveIfMissingAsync(MatchResult result, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        if (await db.MatchHistory.AnyAsync(match => match.MatchId == result.MatchId, cancellationToken))
            return false;
        db.MatchHistory.Add(new MatchHistoryEntity
        {
            MatchId = result.MatchId,
            WinnerId = result.WinnerId,
            WinnerName = result.WinnerName,
            EndedAt = result.EndedAt,
            Players = result.Players.Select(player => new MatchPlayerEntity
            {
                MatchId = result.MatchId,
                PlayerId = player.PlayerId,
                Username = player.Username,
                Placement = player.Placement,
                Kills = player.Kills,
                Deaths = player.Deaths
            }).ToList()
        });
        foreach (var player in result.Players)
        {
            var statistics = await db.PlayerStatistics.FindAsync([player.PlayerId], cancellationToken);
            if (statistics is null)
            {
                statistics = new PlayerStatisticsEntity { PlayerId = player.PlayerId };
                db.PlayerStatistics.Add(statistics);
            }
            statistics.Matches++;
            statistics.Wins += player.PlayerId == result.WinnerId ? 1 : 0;
            statistics.Kills += player.Kills;
            statistics.Deaths += player.Deaths;
        }
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            await transaction.RollbackAsync(cancellationToken);
            return false;
        }
    }

    public async Task<MatchResult?> GetForPlayerAsync(string matchId, Guid playerId,
        CancellationToken cancellationToken)
    {
        var match = await db.MatchHistory.AsNoTracking().Include(value => value.Players)
            .FirstOrDefaultAsync(value => value.MatchId == matchId, cancellationToken);
        if (match is null || !match.Players.Any(player => player.PlayerId == playerId)) return null;
        return new MatchResult(match.MatchId, match.WinnerId, match.WinnerName, match.EndedAt,
            match.Players.OrderBy(player => player.Placement)
                .Select(player => new MatchPlayerResult(player.PlayerId, player.Username,
                    player.Placement, player.Kills, player.Deaths)).ToArray());
    }
}
