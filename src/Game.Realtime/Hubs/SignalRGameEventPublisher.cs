using Game.Application.Abstractions;
using Game.Shared.Contracts;
using Game.Realtime.Connections;
using Microsoft.AspNetCore.SignalR;

namespace Game.Realtime.Hubs;

public sealed class SignalRGameEventPublisher(IHubContext<GameHub> hub, ConnectionRegistry connections) : IGameEventPublisher
{
    public Task PublishSnapshotAsync(ViewerSnapshot view, CancellationToken cancellationToken)
    {
        var ids = connections.ConnectionIds(view.ViewerId);
        return ids.Length == 0 ? Task.CompletedTask :
            hub.Clients.Clients(ids).SendAsync("Snapshot", BinaryGameCodec.EncodeSnapshot(view.Snapshot), cancellationToken);
    }

    public Task PublishEventAsync(GameEvent gameEvent, CancellationToken cancellationToken) =>
        hub.Clients.Group(GameProtocol.DevelopmentMatch).SendAsync("GameEvent", gameEvent, cancellationToken);

    public Task PublishShotAsync(ShotTrace shot, CancellationToken cancellationToken) =>
        hub.Clients.Group(GameProtocol.DevelopmentMatch).SendAsync("Shot", BinaryGameCodec.EncodeShot(shot), cancellationToken);

    public Task PublishImpactAsync(ImpactEvent impact, CancellationToken cancellationToken) =>
        hub.Clients.Group(GameProtocol.DevelopmentMatch).SendAsync("Impact", BinaryGameCodec.EncodeImpact(impact), cancellationToken);
}
