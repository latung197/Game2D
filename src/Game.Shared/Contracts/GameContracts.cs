namespace Game.Shared.Contracts;

public static class GameProtocol
{
    public const byte Version = 6;
    public const byte InputKind = 1;
    public const byte SnapshotKind = 2;
    public const int InputBytes = 14;
    public const int SnapshotHeaderBytes = 15;
    public const int PlayerBytes = 14;
    public const int ProjectileBytes = 8;
    public const int HazardBytes = 7;
    public const string DevelopmentMatch = "development";
}

public sealed record InputBatch(uint Sequence, uint ClientTick, float MoveX, float MoveY, float AimAngle);
public sealed record PlayerIdentity(ushort NetworkId, Guid PlayerId, string Username);
public enum WeaponKind : byte
{
    Bullet = 1, Laser = 2, Rocket = 3, Artillery = 4, Mud = 5,
    Burst = 6, Sniper = 7, Grenade = 8, Pulse = 9
}
public sealed record FireIntent(WeaponKind Weapon, ushort Range);
public sealed record PlayerState(ushort NetworkId, Guid PlayerId, string Username, float X, float Y, float Rotation, float AimAngle, byte Health, byte Status, float VelocityX, float VelocityY);
public sealed record ProjectileState(ushort Id, float X, float Y, WeaponKind Weapon, byte Progress);
public sealed record HazardState(ushort Id, float X, float Y, byte Remaining);
public sealed record JoinAccepted(byte ProtocolVersion, string MatchId, ushort SelfNetworkId, IReadOnlyList<PlayerIdentity> Players);
public sealed record Snapshot(byte ProtocolVersion, string MatchId, uint ServerTick, uint LastProcessedSequence, IReadOnlyList<PlayerState> Players,
    IReadOnlyList<ProjectileState> Projectiles, IReadOnlyList<HazardState> Hazards);
public sealed record GameEvent(byte ProtocolVersion, string Kind, Guid PlayerId);
public sealed record ShotTrace(ushort ShooterNetworkId, float StartX, float StartY, float EndX, float EndY,
    ushort HitNetworkId, byte TargetHealth, WeaponKind Weapon);
public sealed record ViewerSnapshot(Guid ViewerId, Snapshot Snapshot);
public sealed record RadarResult(ushort ActiveTicks, ushort CooldownTicks);
public sealed record ImpactEvent(ushort Id, float X, float Y, WeaponKind Weapon, ushort HitNetworkId, byte TargetHealth);
public sealed record AmmoState(WeaponKind Weapon, byte Loaded, byte Reserve, ushort ReloadTicks);
public sealed record KillEvent(Guid? KillerId, string KillerName, Guid VictimId, string VictimName,
    WeaponKind? Weapon, int KillerKills, int VictimDeaths);
public enum ItemKind : byte { HealthKit = 1, RadarCell = 2, AmmoCrate = 3 }
public sealed record WorldItemState(ushort Id, ItemKind Kind, float X, float Y);
public sealed record ItemSnapshot(string MatchId, uint Revision, IReadOnlyList<WorldItemState> Items);
public sealed record PickupResult(bool Accepted, string Code, ushort ItemId, byte Health);
public sealed record ItemPicked(ushort ItemId, Guid PlayerId, ItemKind Kind, byte NewHealth);
public sealed record InventoryState(byte HealthKits, byte RadarCells, byte AmmoCrates);
public sealed record UseItemResult(bool Accepted, string Code, ItemKind Kind, InventoryState Inventory,
    byte Health, RadarResult Radar, IReadOnlyList<AmmoState> Ammo);
public sealed record ZoneState(int PhaseIndex, string Stage, float CenterX, float CenterY,
    float Radius, float TargetX, float TargetY, float TargetRadius, ushort RemainingTicks,
    byte DamagePerSecond, bool Completed);
public sealed record MatchPlayerResult(Guid PlayerId, string Username, int Placement, int Kills, int Deaths);
public sealed record MatchResult(string MatchId, Guid? WinnerId, string? WinnerName,
    DateTimeOffset EndedAt, IReadOnlyList<MatchPlayerResult> Players);
