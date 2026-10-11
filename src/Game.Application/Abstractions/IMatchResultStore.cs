using Game.Shared.Contracts;

namespace Game.Application.Abstractions;

public interface IMatchResultStore
{
    Task<bool> SaveIfMissingAsync(MatchResult result, CancellationToken cancellationToken);
    Task<MatchResult?> GetForPlayerAsync(string matchId, Guid playerId, CancellationToken cancellationToken);
}
