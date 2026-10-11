using Game.Shared.Contracts;

namespace Game.Application.Abstractions;

public interface IMatchCommandGateway
{
    Task<JoinAccepted?> JoinAsync(Guid playerId, string username, string roomId, CancellationToken cancellationToken);
    ValueTask DisconnectAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
    bool Input(Guid playerId, string roomId, InputBatch input);
    bool Fire(Guid playerId, string roomId, FireIntent intent);
    bool Reload(Guid playerId, string roomId, WeaponKind weapon);
    Task<AmmoState[]> GetAmmoAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
    Task<ItemSnapshot?> GetItemsAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
    Task<InventoryState> GetInventoryAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
    Task<UseItemResult> UseItemAsync(Guid playerId, string roomId, ItemKind kind, CancellationToken cancellationToken);
    Task SetHeadlightsAsync(Guid playerId, string roomId, bool enabled, CancellationToken cancellationToken);
    Task<PickupResult> PickupAsync(Guid playerId, string roomId, ushort itemId, CancellationToken cancellationToken);
    Task<ZoneState?> GetZoneAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
    Task<RadarResult> UseRadarAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
}

public interface IGameEventPublisher
{
    Task PublishSnapshotAsync(ViewerSnapshot snapshot, CancellationToken cancellationToken);
    Task PublishEventAsync(string roomId, GameEvent gameEvent, CancellationToken cancellationToken);
    Task PublishShotAsync(string roomId, ShotTrace shot, CancellationToken cancellationToken);
    Task PublishImpactAsync(string roomId, ImpactEvent impact, CancellationToken cancellationToken);
    Task PublishAmmoAsync(string roomId, Guid playerId, AmmoState ammo, CancellationToken cancellationToken);
    Task PublishKillAsync(string roomId, KillEvent kill, CancellationToken cancellationToken);
    Task PublishItemsAsync(string roomId, ItemSnapshot snapshot, CancellationToken cancellationToken);
    Task PublishPickupAsync(string roomId, ItemPicked pickup, CancellationToken cancellationToken);
    Task PublishZoneAsync(string roomId, ZoneState zone, CancellationToken cancellationToken);
    Task PublishResultAsync(string roomId, MatchResult result, CancellationToken cancellationToken);
}
