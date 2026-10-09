namespace Game.Shared.Contracts;

public static class GameProtocol
{
    public const byte Version = 5;
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
public enum WeaponKind : byte { Bullet = 1, Laser = 2, Rocket = 3, Artillery = 4, Mud = 5 }
public sealed record FireIntent(WeaponKind Weapon, ushort Range);
public sealed record PlayerState(ushort NetworkId, Guid PlayerId, string Username, float X, float Y, float Rotation, float AimAngle, byte Health, byte Status, float VelocityX, float VelocityY);
public sealed record ProjectileState(ushort Id, float X, float Y, WeaponKind Weapon, byte Progress);
public sealed record HazardState(ushort Id, float X, float Y, byte Remaining);
public sealed record JoinAccepted(byte ProtocolVersion, string MatchId, ushort SelfNetworkId, IReadOnlyList<PlayerIdentity> Players);
public sealed record Snapshot(byte ProtocolVersion, string MatchId, uint ServerTick, uint LastProcessedSequence, IReadOnlyList<PlayerState> Players,
    IReadOnlyList<ProjectileState> Projectiles, IReadOnlyList<HazardState> Hazards);
public sealed record GameEvent(byte ProtocolVersion, string Kind, Guid PlayerId);
public sealed record ShotTrace(ushort ShooterNetworkId, float StartX, float StartY, float EndX, float EndY, ushort HitNetworkId, byte TargetHealth);
public sealed record ViewerSnapshot(Guid ViewerId, Snapshot Snapshot);
public sealed record RadarResult(ushort ActiveTicks, ushort CooldownTicks);
public sealed record ImpactEvent(ushort Id, float X, float Y, WeaponKind Weapon, ushort HitNetworkId, byte TargetHealth);
