using Game.Shared.Contracts;

namespace Game.Application.Abstractions;

public interface IMatchCommandGateway
{
    Task<JoinAccepted?> JoinAsync(Guid playerId, string username, CancellationToken cancellationToken);
    ValueTask LeaveAsync(Guid playerId, CancellationToken cancellationToken);
    bool Input(Guid playerId, InputBatch input);
    bool Fire(Guid playerId, FireIntent intent);
    Task<RadarResult> UseRadarAsync(Guid playerId, CancellationToken cancellationToken);
}

public interface IGameEventPublisher
{
    Task PublishSnapshotAsync(ViewerSnapshot snapshot, CancellationToken cancellationToken);
    Task PublishEventAsync(GameEvent gameEvent, CancellationToken cancellationToken);
    Task PublishShotAsync(ShotTrace shot, CancellationToken cancellationToken);
    Task PublishImpactAsync(ImpactEvent impact, CancellationToken cancellationToken);
}
