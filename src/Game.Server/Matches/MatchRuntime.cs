using Game.Shared.Contracts;

namespace Game.Server.Matches;

public sealed class MatchRuntime(string id)
{
    private static readonly (float X, float Y, float W, float H)[] Buildings =
    [ (120, 100, 430, 300), (700, 80, 490, 350), (1430, 110, 520, 310),
      (150, 770, 500, 350), (840, 820, 380, 270), (1540, 780, 540, 340),
      (2410, 170, 450, 330), (2490, 1110, 490, 370), (420, 1570, 530, 340),
      (1290, 1540, 460, 360) ];
    private static readonly (float X, float Y, float R)[] Bushes =
    [ (590, 420, 50), (1260, 430, 54), (2170, 490, 55), (750, 1250, 58),
      (1440, 1290, 55), (2030, 1260, 60), (2740, 740, 64), (2220, 1710, 62),
      (1040, 2000, 56), (3020, 1900, 55) ];
    private readonly Dictionary<Guid, PlayerRuntime> _players = [];
    private readonly Dictionary<Guid, SavedPlayerState> _saved = [];
    private readonly List<ProjectileRuntime> _projectiles = [];
    private readonly List<MudRuntime> _mud = [];
    private readonly List<ImpactEvent> _impacts = [];
    private ushort _nextEntityId;
    private uint _tick;
    public long RejectedInputs { get; private set; }
    public string Id { get; } = id;
    public int PlayerCount => _players.Count;

    public JoinAccepted? Join(Guid playerId, string username)
    {
        if (!_players.TryGetValue(playerId, out var player))
        {
            if (_players.Count >= 10) return null;
            ushort networkId = 1;
            while (_players.Values.Any(p => p.NetworkId == networkId)) networkId++;
            var offset = (networkId - 1) * 100;
            player = new PlayerRuntime(networkId, playerId, username, 1100 + offset, 640);
            if (_saved.Remove(playerId, out var saved) && saved.ExpiresAtTick > _tick)
            {
                player.Health = saved.Health;
                player.RespawnAtTick = saved.RespawnAtTick;
                player.RadarUntilTick = saved.RadarUntilTick;
                player.RadarReadyTick = saved.RadarReadyTick;
                player.NextFireTick = saved.NextFireTick;
            }
            _players.Add(playerId, player);
        }
        return new JoinAccepted(GameProtocol.Version, Id, player.NetworkId,
            _players.Values.Select(p => new PlayerIdentity(p.NetworkId, p.Id, p.Username)).ToArray());
    }

    public void Leave(Guid playerId)
    {
        if (!_players.Remove(playerId, out var player)) return;
        _saved[playerId] = new SavedPlayerState(player.Health, player.RespawnAtTick,
            player.RadarUntilTick, player.RadarReadyTick, player.NextFireTick, _tick + 900);
    }

    public void Input(Guid playerId, InputBatch input)
    {
        if (!_players.TryGetValue(playerId, out var player) ||
            unchecked(input.Sequence - player.LastSequence) is 0 or >= 0x80000000 ||
            unchecked(input.ClientTick - player.LastClientTick) is 0 or >= 0x80000000 ||
            !float.IsFinite(input.MoveX) || !float.IsFinite(input.MoveY) ||
            !float.IsFinite(input.AimAngle) || Math.Abs(input.MoveX) > 1 || Math.Abs(input.MoveY) > 1)
        {
            RejectedInputs++;
            return;
        }
        player.LastSequence = input.Sequence;
        player.LastClientTick = input.ClientTick;
        player.LastInputAtTick = _tick;
        if (player.Health == 0) return;
        var length = MathF.Max(1, MathF.Sqrt(input.MoveX * input.MoveX + input.MoveY * input.MoveY));
        player.MoveX = input.MoveX / length;
        player.MoveY = input.MoveY / length;
        player.AimAngle = input.AimAngle;
    }

    public ShotTrace? Fire(Guid playerId, FireIntent intent)
    {
        if (!_players.TryGetValue(playerId, out var player) || player.Health == 0 ||
            (byte)intent.Weapon is < 1 or > 5 || _tick < player.NextFireTick) return null;
        var rule = WeaponRules.For(intent.Weapon);
        if (intent.Weapon != WeaponKind.Laser && _projectiles.Count >= 128) return null;
        player.NextFireTick = _tick + (uint)rule.CooldownTicks;
        var cos = MathF.Cos(player.AimAngle);
        var sin = MathF.Sin(player.AimAngle);
        var startX = player.X + cos * 35;
        var startY = player.Y + sin * 35;
        var range = Math.Clamp((float)intent.Range, 80, rule.Range);
        if (intent.Weapon != WeaponKind.Laser)
        {
            var id = ++_nextEntityId;
            _projectiles.Add(new ProjectileRuntime(id, player.Id, intent.Weapon,
                startX, startY, cos, sin, range, rule.FlightTicks));
            return null;
        }
        var endX = startX;
        var endY = startY;
        for (var distance = 0; distance < range; distance += 8)
        {
            var x = startX + cos * distance;
            var y = startY + sin * distance;
            if (x < 0 || x > 3200 || y < 0 || y > 2200 || BlockedPoint(x, y)) break;
            endX = x;
            endY = y;
            foreach (var target in _players.Values)
            {
                var dx = x - target.X;
                var dy = y - target.Y;
                if (target.Id == playerId || target.Health == 0 || dx * dx + dy * dy > 28 * 28) continue;
                Damage(target, rule.Damage);
                return new ShotTrace(player.NetworkId, startX, startY, endX, endY,
                    target.NetworkId, target.Health);
            }
        }
        return new ShotTrace(player.NetworkId, startX, startY, endX, endY, 0, 0);
    }

    public RadarResult UseRadar(Guid playerId)
    {
        if (!_players.TryGetValue(playerId, out var player)) return new RadarResult(0, 0);
        if (_tick >= player.RadarReadyTick)
        {
            player.RadarUntilTick = _tick + 180;
            player.RadarReadyTick = _tick + 900;
        }
        return new RadarResult(
            (ushort)Math.Min(ushort.MaxValue, Math.Max(0, (long)player.RadarUntilTick - _tick)),
            (ushort)Math.Min(ushort.MaxValue, Math.Max(0, (long)player.RadarReadyTick - _tick)));
    }

    public Snapshot Step()
    {
        _tick++;
        _mud.RemoveAll(hazard => hazard.ExpiresAtTick <= _tick);
        if (_tick % 30 == 0)
            foreach (var key in _saved.Where(entry => entry.Value.ExpiresAtTick <= _tick)
                .Select(entry => entry.Key).ToArray()) _saved.Remove(key);
        foreach (var player in _players.Values)
        {
            if (player.Health == 0)
            {
                player.Status = 0;
                if (_tick < player.RespawnAtTick) continue;
                player.Health = 100;
                player.X = player.SpawnX;
                player.Y = 640;
                player.MoveX = player.MoveY = 0;
                player.VelocityX = player.VelocityY = 0;
            }
            player.Status = (byte)(_mud.Any(hazard => DistanceSquared(player.X, player.Y, hazard.X, hazard.Y) <= 100 * 100) ? 1 : 0);
            if (unchecked(_tick - player.LastInputAtTick) > 6)
                player.MoveX = player.MoveY = 0;
            PlayerMovementSystem.Step(player, Buildings);
        }
        for (var i = _projectiles.Count - 1; i >= 0; i--)
            if (AdvanceProjectile(_projectiles[i])) _projectiles.RemoveAt(i);
        return new Snapshot(GameProtocol.Version, Id, _tick, 0,
            _players.Values.Select(p => new PlayerState(p.NetworkId, p.Id, p.Username, p.X, p.Y,
                p.Rotation, p.AimAngle, p.Health, p.Status, p.VelocityX, p.VelocityY)).ToArray(),
            _projectiles.Select(p => new ProjectileState(p.Id, p.X, p.Y, p.Weapon,
                p.FlightTicks == 0 ? (byte)0 : (byte)Math.Clamp(p.AgeTicks * 255 / p.FlightTicks, 0, 255))).ToArray(),
            _mud.Select(h => new HazardState(h.Id, h.X, h.Y,
                (byte)Math.Clamp((long)h.ExpiresAtTick - _tick, 0, 255))).ToArray());
    }

    public ImpactEvent[] DrainImpacts()
    {
        var result = _impacts.ToArray();
        _impacts.Clear();
        return result;
    }

    private bool AdvanceProjectile(ProjectileRuntime projectile)
    {
        var rule = WeaponRules.For(projectile.Weapon);
        projectile.AgeTicks++;
        if (projectile.Weapon == WeaponKind.Artillery)
        {
            var progress = Math.Min(1f, projectile.AgeTicks / (float)projectile.FlightTicks);
            projectile.X = Math.Clamp(projectile.StartX + projectile.Cos * projectile.Range * progress, 0, 3200);
            projectile.Y = Math.Clamp(projectile.StartY + projectile.Sin * projectile.Range * progress, 0, 2200);
            if (progress < 1) return false;
            ResolveImpact(projectile, null);
            return true;
        }
        var distanceThisTick = Math.Min(rule.Speed / 30f, projectile.Range - projectile.Travelled);
        var samples = (int)MathF.Ceiling(distanceThisTick / 6f);
        var lastSafeX = projectile.X;
        var lastSafeY = projectile.Y;
        for (var sample = 0; sample <= samples; sample++)
        {
            var distance = Math.Min(distanceThisTick, sample * 6f);
            var x = projectile.X + projectile.Cos * distance;
            var y = projectile.Y + projectile.Sin * distance;
            if (x < 0 || x > 3200 || y < 0 || y > 2200 || BlockedPoint(x, y))
            {
                projectile.X = lastSafeX;
                projectile.Y = lastSafeY;
                ResolveImpact(projectile, null);
                return true;
            }
            var hit = _players.Values.FirstOrDefault(target => target.Id != projectile.OwnerId &&
                target.Health > 0 && DistanceSquared(x, y, target.X, target.Y) <= 28 * 28);
            if (hit is not null)
            {
                projectile.X = x;
                projectile.Y = y;
                ResolveImpact(projectile, hit);
                return true;
            }
            lastSafeX = x;
            lastSafeY = y;
        }
        projectile.X += projectile.Cos * distanceThisTick;
        projectile.Y += projectile.Sin * distanceThisTick;
        projectile.Travelled += distanceThisTick;
        if (projectile.Travelled < projectile.Range) return false;
        ResolveImpact(projectile, null);
        return true;
    }

    private void ResolveImpact(ProjectileRuntime projectile, PlayerRuntime? directTarget)
    {
        var rule = WeaponRules.For(projectile.Weapon);
        ushort hitId = 0;
        byte targetHealth = 0;
        if (projectile.Weapon == WeaponKind.Mud)
        {
            if (_mud.Count >= 32) _mud.RemoveAt(0);
            _mud.Add(new MudRuntime(projectile.Id, projectile.X, projectile.Y, _tick + 120));
        }
        else if (rule.BlastRadius > 0)
        {
            foreach (var target in _players.Values)
            {
                if (target.Health == 0 || DistanceSquared(projectile.X, projectile.Y,
                    target.X, target.Y) > rule.BlastRadius * rule.BlastRadius) continue;
                Damage(target, rule.Damage);
                if (hitId == 0) { hitId = target.NetworkId; targetHealth = target.Health; }
            }
        }
        else if (directTarget is not null)
        {
            Damage(directTarget, rule.Damage);
            hitId = directTarget.NetworkId;
            targetHealth = directTarget.Health;
        }
        _impacts.Add(new ImpactEvent(projectile.Id, projectile.X, projectile.Y,
            projectile.Weapon, hitId, targetHealth));
    }

    private void Damage(PlayerRuntime player, byte amount)
    {
        if (player.Health == 0) return;
        player.Health = (byte)Math.Max(0, player.Health - amount);
        if (player.Health != 0) return;
        player.MoveX = player.MoveY = 0;
        player.VelocityX = player.VelocityY = 0;
        player.RespawnAtTick = _tick + 90;
    }

    private static float DistanceSquared(float ax, float ay, float bx, float by)
    {
        var dx = ax - bx;
        var dy = ay - by;
        return dx * dx + dy * dy;
    }

    public IReadOnlyList<ViewerSnapshot> VisibleSnapshots(Snapshot full)
    {
        var views = new ViewerSnapshot[_players.Count];
        var index = 0;
        foreach (var viewer in _players.Values)
        {
            var radar = _tick < viewer.RadarUntilTick;
            var visible = full.Players.Where(target =>
            {
                var dx = target.X - viewer.X;
                var dy = target.Y - viewer.Y;
                var distanceSquared = dx * dx + dy * dy;
                return target.PlayerId == viewer.Id || radar ||
                    (distanceSquared <= 850 * 850 &&
                     (!InBush(target.X, target.Y) || distanceSquared <= 145 * 145));
            }).ToArray();
            var projectiles = full.Projectiles.Where(p => radar ||
                DistanceSquared(p.X, p.Y, viewer.X, viewer.Y) <= 900 * 900).ToArray();
            var hazards = full.Hazards.Where(h => radar ||
                DistanceSquared(h.X, h.Y, viewer.X, viewer.Y) <= 900 * 900).ToArray();
            views[index++] = new ViewerSnapshot(viewer.Id, full with
            { LastProcessedSequence = viewer.LastSequence, Players = visible,
              Projectiles = projectiles, Hazards = hazards });
        }
        return views;
    }

    private static bool InBush(float x, float y) => Bushes.Any(b =>
    {
        var dx = x - b.X;
        var dy = y - b.Y;
        return dx * dx + dy * dy < (b.R - 8) * (b.R - 8);
    });

    private static bool BlockedPoint(float x, float y)
    {
        foreach (var b in Buildings)
            if (x >= b.X && x <= b.X + b.W && y >= b.Y && y <= b.Y + b.H) return true;
        return false;
    }
}

internal sealed record SavedPlayerState(byte Health, uint RespawnAtTick, uint RadarUntilTick,
    uint RadarReadyTick, uint NextFireTick, uint ExpiresAtTick);

internal sealed class ProjectileRuntime(ushort id, Guid ownerId, WeaponKind weapon,
    float x, float y, float cos, float sin, float range, int flightTicks)
{
    public ushort Id = id;
    public Guid OwnerId = ownerId;
    public WeaponKind Weapon = weapon;
    public float StartX = x, StartY = y, X = x, Y = y, Cos = cos, Sin = sin, Range = range;
    public float Travelled;
    public int AgeTicks;
    public int FlightTicks = flightTicks;
}

internal sealed class MudRuntime(ushort id, float x, float y, uint expiresAtTick)
{
    public ushort Id = id;
    public float X = x, Y = y;
    public uint ExpiresAtTick = expiresAtTick;
}

internal sealed class PlayerRuntime(ushort networkId, Guid id, string username, float x, float y)
{
    public ushort NetworkId { get; } = networkId;
    public Guid Id { get; } = id;
    public string Username { get; } = username;
    public float X = x, Y = y, Rotation, AimAngle, MoveX, MoveY, VelocityX, VelocityY;
    public float SpawnX = x;
    public byte Health = 100;
    public byte Status;
    public uint LastSequence;
    public uint LastClientTick;
    public uint LastInputAtTick;
    public uint NextFireTick;
    public uint RespawnAtTick;
    public uint RadarUntilTick;
    public uint RadarReadyTick;
}
