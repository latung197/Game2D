using Game.Shared.Contracts;
using Game.Server.Items;
using Game.Server.Zones;

namespace Game.Server.Matches;

public sealed class MatchRuntime(string id, bool competitive = false, int capacity = 10)
{
    private static readonly (float X, float Y, float W, float H)[] Buildings = MapData.Buildings;
    private static readonly (float X, float Y, float R)[] Bushes = MapData.Bushes;
    private readonly Dictionary<Guid, PlayerRuntime> _players = [];
    private readonly Dictionary<Guid, SavedPlayerState> _saved = [];
    private readonly List<ProjectileRuntime> _projectiles = [];
    private readonly List<MudRuntime> _mud = [];
    private readonly List<ImpactEvent> _impacts = [];
    private readonly List<KillEvent> _kills = [];
    private readonly List<(Guid PlayerId, AmmoState Ammo)> _ammoChanges = [];
    private readonly LootSystem _loot = new();
    private readonly ZoneSystem? _zone = competitive ? new ZoneSystem(id, capacity) : null;
    private readonly MatchLifecycle? _lifecycle = competitive ? new MatchLifecycle(id) : null;
    private bool _itemsChanged;
    private ushort _nextEntityId;
    private uint _tick;
    public long RejectedInputs { get; private set; }
    public string Id { get; } = id;
    public int PlayerCount => _players.Count;
    public MatchResult? Result => _lifecycle?.Result;
    public ZoneState? ZoneState() => _zone?.State();
    public MatchResult? FinishMatch() => _lifecycle?.FinishManually();

    public void RemoveParticipant(Guid playerId)
    {
        _saved.Remove(playerId);
        _lifecycle?.Leave(playerId);
    }

    public JoinAccepted? Join(Guid playerId, string username)
    {
        if (!_players.TryGetValue(playerId, out var player))
        {
            if (_players.Count >= capacity) return null;
            ushort networkId = 1;
            while (_players.Values.Any(p => p.NetworkId == networkId)) networkId++;
            var spawn = SpawnFor(networkId);
            player = new PlayerRuntime(networkId, playerId, username, spawn.X, spawn.Y);
            if (_saved.Remove(playerId, out var saved) && saved.ExpiresAtTick > _tick)
            {
                player.X = saved.X;
                player.Y = saved.Y;
                player.Rotation = saved.Rotation;
                player.AimAngle = saved.AimAngle;
                player.Health = saved.Health;
                player.RespawnAtTick = saved.RespawnAtTick;
                player.RadarUntilTick = saved.RadarUntilTick;
                player.RadarReadyTick = saved.RadarReadyTick;
                player.NextFireTick = saved.NextFireTick;
                player.Kills = saved.Kills;
                player.Deaths = saved.Deaths;
                player.ZoneDamageUnits = saved.ZoneDamageUnits;
                player.HeadlightsOn = saved.HeadlightsOn;
                foreach (var (kind, count) in saved.Inventory) player.Inventory[kind] = count;
                foreach (var (weapon, ammo) in saved.Ammo) player.Ammo[weapon] = ammo.Copy();
            }
            _players.Add(playerId, player);
            _lifecycle?.Join(playerId, username, player.Health);
        }
        return new JoinAccepted(GameProtocol.Version, Id, player.NetworkId,
            _players.Values.Select(p => new PlayerIdentity(p.NetworkId, p.Id, p.Username)).ToArray());
    }

    public void Leave(Guid playerId)
    {
        if (!_players.Remove(playerId, out var player)) return;
        _saved[playerId] = new SavedPlayerState(player.X, player.Y, player.Rotation, player.AimAngle,
            player.Health, player.RespawnAtTick,
            player.RadarUntilTick, player.RadarReadyTick, player.NextFireTick,
            player.Kills, player.Deaths, player.ZoneDamageUnits, player.HeadlightsOn,
            player.Inventory.ToDictionary(entry => entry.Key, entry => entry.Value),
            player.Ammo.ToDictionary(entry => entry.Key, entry => entry.Value.Copy()),
            _tick + 900);
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
            !Enum.IsDefined(intent.Weapon) || _tick < player.NextFireTick) return null;
        var rule = WeaponRules.For(intent.Weapon);
        var ammo = player.Ammo[intent.Weapon];
        if (ammo.ReloadUntilTick > _tick) return null;
        if (ammo.Loaded == 0)
        {
            Reload(playerId, intent.Weapon);
            return null;
        }
        if (rule.Behavior != WeaponBehavior.Hitscan && _projectiles.Count >= 128) return null;
        ammo.Loaded--;
        _ammoChanges.Add((playerId, AmmoFor(playerId, intent.Weapon)!));
        player.NextFireTick = _tick + (uint)rule.CooldownTicks;
        var cos = MathF.Cos(player.AimAngle);
        var sin = MathF.Sin(player.AimAngle);
        var startX = player.X + cos * 35;
        var startY = player.Y + sin * 35;
        var range = Math.Clamp((float)intent.Range, 80, rule.Range);
        if (rule.Behavior != WeaponBehavior.Hitscan)
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
            if (x < 0 || x > MapData.Width || y < 0 || y > MapData.Height || BlockedPoint(x, y)) break;
            endX = x;
            endY = y;
            foreach (var target in _players.Values)
            {
                var dx = x - target.X;
                var dy = y - target.Y;
                if (target.Id == playerId || target.Health == 0 || dx * dx + dy * dy > 28 * 28) continue;
                Damage(target, rule.Damage, player.Id, intent.Weapon);
                return new ShotTrace(player.NetworkId, startX, startY, endX, endY,
                    target.NetworkId, target.Health, intent.Weapon);
            }
        }
        return new ShotTrace(player.NetworkId, startX, startY, endX, endY, 0, 0, intent.Weapon);
    }

    public AmmoState? Reload(Guid playerId, WeaponKind weapon)
    {
        if (!_players.TryGetValue(playerId, out var player) || player.Health == 0 ||
            !Enum.IsDefined(weapon)) return null;
        var rule = WeaponRules.For(weapon);
        var ammo = player.Ammo[weapon];
        if (ammo.ReloadUntilTick > _tick || ammo.Loaded >= rule.Magazine || ammo.Reserve == 0) return null;
        ammo.ReloadUntilTick = _tick + (uint)rule.ReloadTicks;
        var state = AmmoFor(playerId, weapon)!;
        _ammoChanges.Add((playerId, state));
        return state;
    }

    public AmmoState? AmmoFor(Guid playerId, WeaponKind weapon)
    {
        if (!_players.TryGetValue(playerId, out var player) || !player.Ammo.TryGetValue(weapon, out var ammo)) return null;
        return new AmmoState(weapon, ammo.Loaded, ammo.Reserve,
            (ushort)Math.Min(ushort.MaxValue, Math.Max(0, (long)ammo.ReloadUntilTick - _tick)));
    }

    public AmmoState[] AmmoFor(Guid playerId) => WeaponRules.All
        .Select(rule => AmmoFor(playerId, rule.Kind)).OfType<AmmoState>().ToArray();

    public ItemSnapshot ItemSnapshot() => _loot.Snapshot(Id);

    public PickupResult Pickup(Guid playerId, ushort itemId, out ItemPicked? picked)
    {
        picked = null;
        if (!_players.TryGetValue(playerId, out var player))
            return new PickupResult(false, "not_in_match", itemId, 0);
        var result = _loot.Pickup(playerId, player.Health, player.X, player.Y, itemId, _tick,
            kind => player.Inventory[kind] < ItemCatalog.Definitions[kind].MaxStack, out picked);
        if (result.Accepted)
        {
            player.Inventory[picked!.Kind]++;
            _itemsChanged = true;
        }
        return result;
    }

    public InventoryState InventoryFor(Guid playerId) => _players.TryGetValue(playerId, out var player)
        ? InventoryFor(player) : new InventoryState(0, 0, 0);

    private static InventoryState InventoryFor(PlayerRuntime player) => new(
        player.Inventory[ItemKind.HealthKit], player.Inventory[ItemKind.RadarCell],
        player.Inventory[ItemKind.AmmoCrate]);

    public UseItemResult UseItem(Guid playerId, ItemKind kind)
    {
        if (!_players.TryGetValue(playerId, out var player) || player.Health == 0)
            return ItemResult(false, "dead", kind, player);
        if (!player.Inventory.TryGetValue(kind, out var count) || count == 0)
            return ItemResult(false, "empty", kind, player);
        if (kind == ItemKind.HealthKit)
        {
            if (player.Health == 100) return ItemResult(false, "full_health", kind, player);
            player.Health = (byte)Math.Min(100, player.Health + ItemCatalog.Definitions[kind].Heal);
            _lifecycle?.Health(playerId, player.Health);
        }
        else if (kind == ItemKind.RadarCell)
        {
            player.RadarUntilTick = _tick + 180;
            player.RadarReadyTick = _tick + 900;
        }
        else if (kind == ItemKind.AmmoCrate)
        {
            var changed = false;
            foreach (var rule in WeaponRules.All)
            {
                var ammo = player.Ammo[rule.Kind];
                var refill = (byte)Math.Min(rule.Magazine, byte.MaxValue - ammo.Reserve);
                if (refill == 0) continue;
                ammo.Reserve += refill;
                _ammoChanges.Add((playerId, AmmoFor(playerId, rule.Kind)!));
                changed = true;
            }
            if (!changed) return ItemResult(false, "ammo_full", kind, player);
        }
        else return ItemResult(false, "unknown_item", kind, player);
        player.Inventory[kind]--;
        return ItemResult(true, "used", kind, player);
    }

    public void SetHeadlights(Guid playerId, bool enabled)
    {
        if (_players.TryGetValue(playerId, out var player)) player.HeadlightsOn = enabled;
    }

    private UseItemResult ItemResult(bool accepted, string code, ItemKind kind, PlayerRuntime? player) =>
        new(accepted, code, kind, player is null ? new InventoryState(0, 0, 0) : InventoryFor(player),
            player?.Health ?? 0, player is null ? new RadarResult(0, 0) : new RadarResult(
                (ushort)Math.Clamp((long)player.RadarUntilTick - _tick, 0, ushort.MaxValue),
                (ushort)Math.Clamp((long)player.RadarReadyTick - _tick, 0, ushort.MaxValue)),
            player is null ? [] : AmmoFor(player.Id));

    public bool TakeItemsChanged()
    {
        var changed = _itemsChanged;
        _itemsChanged = false;
        return changed;
    }

    public RadarResult UseRadar(Guid playerId)
    {
        if (!_players.TryGetValue(playerId, out var player) || player.Health == 0) return new RadarResult(0, 0);
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
        if (_loot.Step(_tick)) _itemsChanged = true;
        _mud.RemoveAll(hazard => hazard.ExpiresAtTick <= _tick);
        if (_tick % 30 == 0)
            foreach (var key in _saved.Where(entry => entry.Value.ExpiresAtTick <= _tick)
                .Select(entry => entry.Key).ToArray()) _saved.Remove(key);
        foreach (var player in _players.Values)
        {
            if (player.Health == 0)
            {
                player.Status = 0;
                if (competitive || _tick < player.RespawnAtTick) continue;
                player.Health = 100;
                foreach (var rule in WeaponRules.All)
                {
                    player.Ammo[rule.Kind] = new WeaponAmmo(rule.Magazine, rule.Reserve);
                    _ammoChanges.Add((player.Id, AmmoFor(player.Id, rule.Kind)!));
                }
                player.X = player.SpawnX;
                player.Y = player.SpawnY;
                player.MoveX = player.MoveY = 0;
                player.VelocityX = player.VelocityY = 0;
            }
            player.Status = (byte)(_mud.Any(hazard => DistanceSquared(player.X, player.Y, hazard.X, hazard.Y) <= 100 * 100) ? 1 : 0);
            foreach (var rule in WeaponRules.All)
            {
                var ammo = player.Ammo[rule.Kind];
                if (ammo.ReloadUntilTick == 0 || ammo.ReloadUntilTick > _tick) continue;
                var transferred = Math.Min(rule.Magazine - ammo.Loaded, ammo.Reserve);
                ammo.Loaded += (byte)transferred;
                ammo.Reserve -= (byte)transferred;
                ammo.ReloadUntilTick = 0;
                _ammoChanges.Add((player.Id, AmmoFor(player.Id, rule.Kind)!));
            }
            if (unchecked(_tick - player.LastInputAtTick) > 6)
                player.MoveX = player.MoveY = 0;
            PlayerMovementSystem.Step(player, Buildings);
        }
        for (var i = _projectiles.Count - 1; i >= 0; i--)
            if (AdvanceProjectile(_projectiles[i])) _projectiles.RemoveAt(i);
        if (_zone is not null)
        {
            _zone.Step();
            var damage = _zone.State().DamagePerSecond;
            foreach (var player in _players.Values)
            {
                if (player.Health == 0) continue;
                if (!_zone.Outside(player.X, player.Y)) { player.ZoneDamageUnits = 0; continue; }
                var amount = ZoneDamageSystem.Accumulate(ref player.ZoneDamageUnits, damage);
                if (amount == 0) continue;
                Damage(player, amount, Guid.Empty, null);
            }
            _lifecycle?.TryFinish(_zone.Completed);
        }
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

    public KillEvent[] DrainKills()
    {
        var result = _kills.ToArray();
        _kills.Clear();
        return result;
    }

    public (Guid PlayerId, AmmoState Ammo)[] DrainAmmoChanges()
    {
        var result = _ammoChanges.ToArray();
        _ammoChanges.Clear();
        return result;
    }

    private bool AdvanceProjectile(ProjectileRuntime projectile)
    {
        var rule = WeaponRules.For(projectile.Weapon);
        projectile.AgeTicks++;
        if (rule.Behavior == WeaponBehavior.Lob)
        {
            var progress = Math.Min(1f, projectile.AgeTicks / (float)projectile.FlightTicks);
            projectile.X = Math.Clamp(projectile.StartX + projectile.Cos * projectile.Range * progress, 0, MapData.Width);
            projectile.Y = Math.Clamp(projectile.StartY + projectile.Sin * projectile.Range * progress, 0, MapData.Height);
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
            if (x < 0 || x > MapData.Width || y < 0 || y > MapData.Height || BlockedPoint(x, y))
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
        if (rule.Behavior == WeaponBehavior.Hazard)
        {
            if (_mud.Count >= 32) _mud.RemoveAt(0);
            _mud.Add(new MudRuntime(projectile.Id, projectile.X, projectile.Y, _tick + 120));
        }
        else if (rule.BlastRadius > 0)
        {
            foreach (var target in _players.Values)
            {
                if (target.Health == 0 || target.Id == projectile.OwnerId || DistanceSquared(projectile.X, projectile.Y,
                    target.X, target.Y) > rule.BlastRadius * rule.BlastRadius) continue;
                Damage(target, rule.Damage, projectile.OwnerId, projectile.Weapon);
                if (hitId == 0) { hitId = target.NetworkId; targetHealth = target.Health; }
            }
        }
        else if (directTarget is not null)
        {
            Damage(directTarget, rule.Damage, projectile.OwnerId, projectile.Weapon);
            hitId = directTarget.NetworkId;
            targetHealth = directTarget.Health;
        }
        _impacts.Add(new ImpactEvent(projectile.Id, projectile.X, projectile.Y,
            projectile.Weapon, hitId, targetHealth));
    }

    private void Damage(PlayerRuntime player, byte amount, Guid sourceId, WeaponKind? weapon)
    {
        var killed = DamageService.Apply(player, amount, _tick);
        _lifecycle?.Health(player.Id, player.Health);
        if (!killed) return;
        player.Deaths++;
        var killer = sourceId != player.Id && _players.TryGetValue(sourceId, out var source) ? source : null;
        if (killer is not null) killer.Kills++;
        _lifecycle?.Kill(player.Id, killer?.Id);
        _kills.Add(new KillEvent(killer is not null ? sourceId : null,
            killer?.Username ?? (weapon is null ? "Bo thu" : "Vụ nổ"), player.Id, player.Username, weapon,
            killer?.Kills ?? 0, player.Deaths));
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
                     (!InBush(target.X, target.Y) || distanceSquared <= 145 * 145 ||
                      Illuminated(viewer, target.X, target.Y, distanceSquared)));
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

    private static bool Illuminated(PlayerRuntime viewer, float x, float y, float distanceSquared)
    {
        if (!viewer.HeadlightsOn || distanceSquared > 570 * 570) return false;
        var distance = MathF.Sqrt(distanceSquared);
        var dx = (x - viewer.X) / distance;
        var dy = (y - viewer.Y) / distance;
        if (dx * MathF.Cos(viewer.AimAngle) + dy * MathF.Sin(viewer.AimAngle) < MathF.Cos(0.34f)) return false;
        for (var step = 32f; step < distance; step += 32f)
            if (BlockedPoint(viewer.X + dx * step, viewer.Y + dy * step)) return false;
        return true;
    }

    private (float X, float Y) SpawnFor(ushort networkId)
    {
        if (competitive)
        {
            if (_players.Count == 0) return (1100, 640);
            if (_players.Count == 1) return (1700, 640);
            var best = (X: 0f, Y: 0f);
            var bestScore = -1f;
            for (var row = 0; row < 9; row++)
            for (var column = 0; column < 12; column++)
            {
                var x = 160 + column * 320f;
                var y = 180 + row * 340f;
                if (Buildings.Any(b => x > b.X - 28 && x < b.X + b.W + 28 &&
                    y > b.Y - 28 && y < b.Y + b.H + 28)) continue;
                var score = _players.Values.Min(player => DistanceSquared(x, y, player.X, player.Y));
                if (score <= bestScore) continue;
                best = (x, y);
                bestScore = score;
            }
            if (bestScore < 0) throw new InvalidOperationException("Map has no available spawn location.");
            return best;
        }
        if (networkId <= 5) return (1100 + (networkId - 1) * 100, 640);
        var index = 0;
        for (var row = 0; row < 9; row++)
        {
            for (var column = 0; column < 12; column++)
            {
                var x = 160 + column * 320f;
                var y = 180 + row * 340f;
                if (Buildings.Any(b => x > b.X - 28 && x < b.X + b.W + 28 &&
                    y > b.Y - 28 && y < b.Y + b.H + 28)) continue;
                if (index++ == networkId - 6) return (x, y);
            }
        }
        throw new InvalidOperationException("Map has insufficient spawn locations for room capacity.");
    }

    private static bool BlockedPoint(float x, float y)
    {
        foreach (var b in Buildings)
            if (x >= b.X && x <= b.X + b.W && y >= b.Y && y <= b.Y + b.H) return true;
        return false;
    }
}

internal sealed record SavedPlayerState(float X, float Y, float Rotation, float AimAngle,
    byte Health, uint RespawnAtTick, uint RadarUntilTick,
    uint RadarReadyTick, uint NextFireTick, int Kills, int Deaths, int ZoneDamageUnits,
    bool HeadlightsOn, Dictionary<ItemKind, byte> Inventory,
    Dictionary<WeaponKind, WeaponAmmo> Ammo, uint ExpiresAtTick);

internal sealed class WeaponAmmo(byte loaded, byte reserve)
{
    public byte Loaded = loaded;
    public byte Reserve = reserve;
    public uint ReloadUntilTick;
    public WeaponAmmo Copy() => new(Loaded, Reserve) { ReloadUntilTick = ReloadUntilTick };
}

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
    public float SpawnX = x, SpawnY = y;
    public bool HeadlightsOn = true;
    public Dictionary<ItemKind, byte> Inventory = ItemCatalog.Definitions.ToDictionary(
        entry => entry.Key, entry => entry.Value.StartingCount);
    public byte Health = 100;
    public byte Status;
    public uint LastSequence;
    public uint LastClientTick;
    public uint LastInputAtTick;
    public uint NextFireTick;
    public uint RespawnAtTick;
    public uint RadarUntilTick;
    public uint RadarReadyTick;
    public int Kills;
    public int Deaths;
    public int ZoneDamageUnits;
    public Dictionary<WeaponKind, WeaponAmmo> Ammo = WeaponRules.All.ToDictionary(
        rule => rule.Kind, rule => new WeaponAmmo(rule.Magazine, rule.Reserve));
}
