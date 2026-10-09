using System.Buffers.Binary;

namespace Game.Shared.Contracts;

// Version 5 adds client tick, per-viewer input acknowledgement and player velocity.
public static class BinaryGameCodec
{
    public static bool TryDecodeInput(ReadOnlySpan<byte> data, out InputBatch input)
    {
        input = default!;
        if (data.Length != GameProtocol.InputBytes || data[0] != GameProtocol.Version ||
            data[1] != GameProtocol.InputKind || data[13] != 0) return false;
        var x = unchecked((sbyte)data[10]);
        var y = unchecked((sbyte)data[11]);
        if (x == sbyte.MinValue || y == sbyte.MinValue) return false;
        input = new InputBatch(BinaryPrimitives.ReadUInt32LittleEndian(data[2..6]),
            BinaryPrimitives.ReadUInt32LittleEndian(data[6..10]),
            x / 127f, y / 127f, DecodeAngle(data[12]));
        return true;
    }

    public static bool TryDecodeFire(ReadOnlySpan<byte> data, out FireIntent intent)
    {
        intent = default!;
        if (data.Length != 5 || data[0] != GameProtocol.Version || data[1] != 5 ||
            data[2] is < 1 or > 5) return false;
        intent = new FireIntent((WeaponKind)data[2], BinaryPrimitives.ReadUInt16LittleEndian(data[3..5]));
        return true;
    }

    public static byte[] EncodeSnapshot(Snapshot snapshot)
    {
        if (snapshot.Players.Count > byte.MaxValue) throw new ArgumentOutOfRangeException(nameof(snapshot));
        if (snapshot.Projectiles.Count > ushort.MaxValue || snapshot.Hazards.Count > ushort.MaxValue)
            throw new ArgumentOutOfRangeException(nameof(snapshot));
        var data = new byte[GameProtocol.SnapshotHeaderBytes + snapshot.Players.Count * GameProtocol.PlayerBytes +
            snapshot.Projectiles.Count * GameProtocol.ProjectileBytes + snapshot.Hazards.Count * GameProtocol.HazardBytes];
        data[0] = GameProtocol.Version;
        data[1] = GameProtocol.SnapshotKind;
        BinaryPrimitives.WriteUInt32LittleEndian(data.AsSpan(2, 4), snapshot.ServerTick);
        data[6] = (byte)snapshot.Players.Count;
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(7, 2), (ushort)snapshot.Projectiles.Count);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(9, 2), (ushort)snapshot.Hazards.Count);
        BinaryPrimitives.WriteUInt32LittleEndian(data.AsSpan(11, 4), snapshot.LastProcessedSequence);
        for (var i = 0; i < snapshot.Players.Count; i++)
        {
            var player = snapshot.Players[i];
            var offset = GameProtocol.SnapshotHeaderBytes + i * GameProtocol.PlayerBytes;
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(offset, 2), player.NetworkId);
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(offset + 2, 2), EncodePosition(player.X));
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(offset + 4, 2), EncodePosition(player.Y));
            data[offset + 6] = EncodeAngle(player.Rotation);
            data[offset + 7] = EncodeAngle(player.AimAngle);
            data[offset + 8] = player.Health;
            data[offset + 9] = player.Status;
            BinaryPrimitives.WriteInt16LittleEndian(data.AsSpan(offset + 10, 2), EncodeVelocity(player.VelocityX));
            BinaryPrimitives.WriteInt16LittleEndian(data.AsSpan(offset + 12, 2), EncodeVelocity(player.VelocityY));
        }
        var projectileOffset = GameProtocol.SnapshotHeaderBytes + snapshot.Players.Count * GameProtocol.PlayerBytes;
        foreach (var projectile in snapshot.Projectiles)
        {
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(projectileOffset, 2), projectile.Id);
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(projectileOffset + 2, 2), EncodePosition(projectile.X));
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(projectileOffset + 4, 2), EncodePosition(projectile.Y));
            data[projectileOffset + 6] = (byte)projectile.Weapon;
            data[projectileOffset + 7] = projectile.Progress;
            projectileOffset += GameProtocol.ProjectileBytes;
        }
        foreach (var hazard in snapshot.Hazards)
        {
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(projectileOffset, 2), hazard.Id);
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(projectileOffset + 2, 2), EncodePosition(hazard.X));
            BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(projectileOffset + 4, 2), EncodePosition(hazard.Y));
            data[projectileOffset + 6] = hazard.Remaining;
            projectileOffset += GameProtocol.HazardBytes;
        }
        return data;
    }

    public static byte[] EncodeImpact(ImpactEvent impact)
    {
        var data = new byte[12];
        data[0] = GameProtocol.Version;
        data[1] = 6;
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(2, 2), impact.Id);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(4, 2), EncodePosition(impact.X));
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(6, 2), EncodePosition(impact.Y));
        data[8] = (byte)impact.Weapon;
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(9, 2), impact.HitNetworkId);
        data[11] = impact.TargetHealth;
        return data;
    }

    public static byte[] EncodeShot(ShotTrace shot)
    {
        var data = new byte[15];
        data[0] = GameProtocol.Version;
        data[1] = 3;
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(2, 2), EncodePosition(shot.StartX));
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(4, 2), EncodePosition(shot.StartY));
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(6, 2), EncodePosition(shot.EndX));
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(8, 2), EncodePosition(shot.EndY));
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(10, 2), shot.ShooterNetworkId);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(12, 2), shot.HitNetworkId);
        data[14] = shot.TargetHealth;
        return data;
    }

    public static byte[] EncodeRadar(RadarResult result)
    {
        var data = new byte[6];
        data[0] = GameProtocol.Version;
        data[1] = 4;
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(2, 2), result.ActiveTicks);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(4, 2), result.CooldownTicks);
        return data;
    }

    public static bool TryDecodeSnapshot(ReadOnlySpan<byte> data, out CompactSnapshot snapshot)
    {
        snapshot = default!;
        if (data.Length < GameProtocol.SnapshotHeaderBytes || data[0] != GameProtocol.Version ||
            data[1] != GameProtocol.SnapshotKind)
            return false;
        var projectileCount = BinaryPrimitives.ReadUInt16LittleEndian(data[7..9]);
        var hazardCount = BinaryPrimitives.ReadUInt16LittleEndian(data[9..11]);
        if (data.Length != GameProtocol.SnapshotHeaderBytes + data[6] * GameProtocol.PlayerBytes +
            projectileCount * GameProtocol.ProjectileBytes + hazardCount * GameProtocol.HazardBytes) return false;
        var players = new CompactPlayerState[data[6]];
        for (var i = 0; i < players.Length; i++)
        {
            var offset = GameProtocol.SnapshotHeaderBytes + i * GameProtocol.PlayerBytes;
            if (data[offset + 8] > 100 || data[offset + 9] > 1) return false;
            players[i] = new CompactPlayerState(
                BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset, 2)),
                BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset + 2, 2)) / 16f,
                BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset + 4, 2)) / 16f,
                DecodeAngle(data[offset + 6]), DecodeAngle(data[offset + 7]), data[offset + 8], data[offset + 9],
                BinaryPrimitives.ReadInt16LittleEndian(data.Slice(offset + 10, 2)),
                BinaryPrimitives.ReadInt16LittleEndian(data.Slice(offset + 12, 2)));
        }
        var projectiles = new ProjectileState[projectileCount];
        var offsetAfterPlayers = GameProtocol.SnapshotHeaderBytes + players.Length * GameProtocol.PlayerBytes;
        for (var i = 0; i < projectileCount; i++)
        {
            var offset = offsetAfterPlayers + i * GameProtocol.ProjectileBytes;
            if (data[offset + 6] is < 1 or > 5) return false;
            projectiles[i] = new ProjectileState(BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset, 2)),
                BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset + 2, 2)) / 16f,
                BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset + 4, 2)) / 16f,
                (WeaponKind)data[offset + 6], data[offset + 7]);
        }
        var hazards = new HazardState[hazardCount];
        var offsetAfterProjectiles = offsetAfterPlayers + projectileCount * GameProtocol.ProjectileBytes;
        for (var i = 0; i < hazardCount; i++)
        {
            var offset = offsetAfterProjectiles + i * GameProtocol.HazardBytes;
            hazards[i] = new HazardState(BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset, 2)),
                BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset + 2, 2)) / 16f,
                BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(offset + 4, 2)) / 16f, data[offset + 6]);
        }
        snapshot = new CompactSnapshot(BinaryPrimitives.ReadUInt32LittleEndian(data[2..6]),
            BinaryPrimitives.ReadUInt32LittleEndian(data[11..15]), players, projectiles, hazards);
        return true;
    }

    private static ushort EncodePosition(float value) =>
        (ushort)Math.Clamp((int)MathF.Round(value * 16), 0, ushort.MaxValue);

    private static short EncodeVelocity(float value) =>
        (short)Math.Clamp((int)MathF.Round(value), short.MinValue, short.MaxValue);

    private static byte EncodeAngle(float radians)
    {
        var normalized = ((radians % (2 * MathF.PI)) + 2 * MathF.PI) % (2 * MathF.PI);
        return (byte)((int)MathF.Round(normalized * 256 / (2 * MathF.PI)) & 255);
    }

    private static float DecodeAngle(byte value) => value * (2 * MathF.PI / 256);
}

public sealed record CompactPlayerState(ushort NetworkId, float X, float Y, float Rotation, float AimAngle, byte Health, byte Status, float VelocityX, float VelocityY);
public sealed record CompactSnapshot(uint ServerTick, uint LastProcessedSequence, IReadOnlyList<CompactPlayerState> Players,
    IReadOnlyList<ProjectileState> Projectiles, IReadOnlyList<HazardState> Hazards);
