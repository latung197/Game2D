using Game.Application.Abstractions;
using Game.Shared.Contracts;
using Game.Realtime.Connections;
using Microsoft.AspNetCore.SignalR;

namespace Game.Realtime.Hubs;

public sealed class SignalRGameEventPublisher(IHubContext<GameHub> hub, ConnectionRegistry connections) : IGameEventPublisher
{
    public Task PublishSnapshotAsync(ViewerSnapshot view, CancellationToken cancellationToken)
    {
        var ids = connections.ConnectionIds(view.ViewerId, view.Snapshot.MatchId);
        return ids.Length == 0 ? Task.CompletedTask :
            hub.Clients.Clients(ids).SendAsync("Snapshot", BinaryGameCodec.EncodeSnapshot(view.Snapshot), cancellationToken);
    }

    public Task PublishEventAsync(string roomId, GameEvent gameEvent, CancellationToken cancellationToken) =>
        hub.Clients.Group(roomId).SendAsync("GameEvent", gameEvent, cancellationToken);

    public Task PublishShotAsync(string roomId, ShotTrace shot, CancellationToken cancellationToken) =>
        hub.Clients.Group(roomId).SendAsync("Shot", BinaryGameCodec.EncodeShot(shot), cancellationToken);

    public Task PublishImpactAsync(string roomId, ImpactEvent impact, CancellationToken cancellationToken) =>
        hub.Clients.Group(roomId).SendAsync("Impact", BinaryGameCodec.EncodeImpact(impact), cancellationToken);

    public Task PublishAmmoAsync(string roomId, Guid playerId, AmmoState ammo, CancellationToken cancellationToken)
    {
        var ids = connections.ConnectionIds(playerId, roomId);
        return ids.Length == 0 ? Task.CompletedTask :
            hub.Clients.Clients(ids).SendAsync("AmmoChanged", ammo, cancellationToken);
    }

    public Task PublishKillAsync(string roomId, KillEvent kill, CancellationToken cancellationToken) =>
        hub.Clients.Group(roomId).SendAsync("Kill", kill, cancellationToken);

    public Task PublishItemsAsync(string roomId, ItemSnapshot snapshot, CancellationToken cancellationToken) =>
        hub.Clients.Group(roomId).SendAsync("WorldItems", snapshot, cancellationToken);

    public Task PublishPickupAsync(string roomId, ItemPicked pickup, CancellationToken cancellationToken) =>
        hub.Clients.Group(roomId).SendAsync("ItemPicked", pickup, cancellationToken);

    public Task PublishZoneAsync(string roomId, ZoneState zone, CancellationToken cancellationToken) =>
        hub.Clients.Group(roomId).SendAsync("ZoneState", zone, cancellationToken);

    public Task PublishResultAsync(string roomId, MatchResult result, CancellationToken cancellationToken) =>
        hub.Clients.Group(roomId).SendAsync("MatchEnded", result, cancellationToken);
}
