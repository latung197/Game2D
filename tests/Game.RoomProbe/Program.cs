using Game.Server.Matches;
using Game.Server.Zones;
using Game.Shared.Contracts;

static void Check(bool value, string message)
{
    if (!value) throw new Exception(message);
}

var ids = Enumerable.Range(0, 11).Select(_ => Guid.NewGuid()).ToArray();
var room = new RoomRuntime("room-probe", "Probe", ids[0], "host", false);
Check(room.Start(ids[1]).Error == "not_host", "Only host may start");
for (var index = 1; index < 10; index++)
    Check(room.Join(ids[index], $"guest-{index}").Error is null, "Ten members may join");
Check(room.Join(ids[10], "extra").Error == "room_full", "Eleventh member must be rejected");
Check(room.Summary().PlayerCount == 10, "Room count must stay at ten");
Check(room.Start(ids[0]).Room?.State == "Playing", "Host starts the match");
Check(room.Join(ids[10], "extra").Error == "room_started", "Normal room rejects late join");
Check(room.Connect(ids[1]) is not null, "Member may connect to playing room");
room.Disconnect(ids[1]);
Check(room.RemoveExpired(DateTimeOffset.UtcNow.AddSeconds(31)).SequenceEqual([ids[1]]),
    "Disconnected member expires after grace period");
Check(room.Leave(ids[0]).Error is null && room.HostId == ids[2], "Host transfers on leave");
Check(room.Finish(ids[3]).Error == "not_host", "Only host may finish");
Check(room.Finish(ids[2]).Room?.State == "Finished", "Host finishes match");
room.RemoveExpired(DateTimeOffset.UtcNow.AddSeconds(31));
Check(room.Empty, "Finished room members expire for cleanup");

var quick = new RoomRuntime("quick-probe", "Quick", ids[0], "host", true);
Check(quick.State == RoomState.Playing && quick.IsQuick, "Quick room starts immediately");
Check(quick.Join(ids[1], "guest").Error is null, "Quick room permits late join");
Console.WriteLine("PASS: room cap, host permission/transfer, start, late join policy and reconnect expiry");

var idle = new MatchRuntime("idle-probe", competitive: true);
Check(idle.Join(ids[0], "idle-one") is not null && idle.Join(ids[1], "idle-two") is not null,
    "Idle room players join");
var idleStart = idle.Step();
Check(MathF.Abs(idleStart.Players[0].X - idleStart.Players[1].X) >= 500,
    "Competitive players must not spawn in a point-blank cluster");
for (var tick = 1; tick < 30 * 15; tick++)
    Check(idle.Step().Players.All(player => player.Health == 100),
        "Players inside the starting zone must not lose health without combat");
Console.WriteLine("PASS: idle online room preserves 100 HP for 15 seconds");

var ownBlast = new MatchRuntime("own-blast-probe");
ownBlast.Join(ids[0], "grenadier");
Check(Enum.GetValues<WeaponKind>().Length == 9 &&
    Enum.GetValues<WeaponKind>().All(kind => ownBlast.AmmoFor(ids[0], kind) is not null),
    "All nine weapons must have starting ammunition");
ownBlast.Fire(ids[0], new FireIntent(WeaponKind.Artillery, 80));
for (var tick = 0; tick < 46; tick++) ownBlast.Step();
Check(ownBlast.Step().Players.Single().Health == 100,
    "Own splash damage must not destroy the vehicle near its spawn");
Console.WriteLine("PASS: nine weapon definitions and no self-inflicted blast damage");

var arsenal = new MatchRuntime("arsenal-probe");
arsenal.Join(ids[0], "arsenal");
foreach (var kind in Enum.GetValues<WeaponKind>())
{
    var loaded = arsenal.AmmoFor(ids[0], kind)!.Loaded;
    var shot = arsenal.Fire(ids[0], new FireIntent(kind, 700));
    Check(arsenal.AmmoFor(ids[0], kind)!.Loaded == loaded - 1,
        $"{kind} must fire and spend one round");
    if (shot is not null)
        Check(shot.Weapon == kind && BinaryGameCodec.EncodeShot(shot).Length == 16,
            $"{kind} hitscan packet must identify its weapon");
    for (var tick = 0; tick < 46; tick++) arsenal.Step();
}
Console.WriteLine("PASS: all nine weapons fire with authoritative ammo and v6 shot packets");

var duel = new MatchRuntime("combat-probe");
Check(duel.Join(ids[0], "shooter") is not null && duel.Join(ids[1], "target") is not null,
    "Duel players join");
Check(duel.AmmoFor(ids[0], WeaponKind.Bullet)?.Loaded == 12, "Pistol starts with a full magazine");
var bullet = new FireIntent(WeaponKind.Bullet, 1800);
duel.Fire(ids[0], bullet);
duel.Fire(ids[0], bullet);
Check(duel.AmmoFor(ids[0], WeaponKind.Bullet)?.Loaded == 11,
    "Fire rate rejects a second shot in the same tick");
for (var tick = 0; tick < 7; tick++) duel.Step();
Check(duel.Step().Players.Single(player => player.PlayerId == ids[1]).Health == 75,
    "One projectile applies damage once");
for (var shot = 0; shot < 3; shot++)
{
    duel.Fire(ids[0], bullet);
    for (var tick = 0; tick < 7; tick++) duel.Step();
}
var dead = duel.Step().Players.Single(player => player.PlayerId == ids[1]);
Check(dead.Health == 0 && duel.DrainKills() is [{ KillerId: var killerId, VictimId: var victimId }]
    && killerId == ids[0] && victimId == ids[1], "Fourth hit kills and credits shooter once");
var deadPosition = (dead.X, dead.Y);
duel.Input(ids[1], new InputBatch(1, 1, 1, 0, 0));
duel.Fire(ids[1], bullet);
Check(duel.Reload(ids[1], WeaponKind.Bullet) is null,
    "Dead player cannot fire or reload");
Check(duel.Pickup(ids[1], 1, out _).Code == "dead", "Dead player cannot pick up loot");
duel.Step();
Check(duel.Step().Players.Single(player => player.PlayerId == ids[1]) is { X: var x, Y: var y }
    && (x, y) == deadPosition, "Dead player cannot move");
Check(duel.Reload(ids[0], WeaponKind.Bullet)?.ReloadTicks == 45,
    "Manual reload starts a timed action");
duel.Fire(ids[0], bullet);
Check(duel.AmmoFor(ids[0], WeaponKind.Bullet)?.Loaded == 8,
    "Firing during reload spends no ammo");
for (var tick = 0; tick < 44; tick++) duel.Step();
Check(duel.AmmoFor(ids[0], WeaponKind.Bullet)?.Loaded == 8, "Reload cannot finish early");
duel.Step();
Check(duel.AmmoFor(ids[0], WeaponKind.Bullet) is { Loaded: 12, Reserve: 56, ReloadTicks: 0 },
    "Reload transfers only missing rounds from reserve");
for (var tick = 0; tick < 100; tick++) duel.Step();
Check(duel.Step().Players.Single(player => player.PlayerId == ids[1]).Health == 100,
    "Player respawns after spectator interval");
Check(duel.AmmoFor(ids[1], WeaponKind.Bullet) is { Loaded: 12, Reserve: 60 },
    "Respawn refills ammunition");

var expiry = new MatchRuntime("expiry-probe");
expiry.Join(ids[2], "solo");
expiry.Fire(ids[2], new FireIntent(WeaponKind.Bullet, 80));
for (var tick = 0; tick < 10; tick++) expiry.Step();
Check(expiry.Step().Projectiles.Count == 0, "Projectile expires at range");
Console.WriteLine("PASS: fire rate, hit once, death/kill, dead actions, reload, respawn and projectile expiry");

var loot = new MatchRuntime("loot-probe");
loot.Join(ids[0], "first");
loot.Join(ids[1], "second");
Check(loot.ItemSnapshot().Items.Count == 16, "Three loot types appear in initial item snapshot");
Check(loot.InventoryFor(ids[0]) == new InventoryState(1, 1, 1),
    "Starter pack contains one of each item");
Check(loot.Pickup(ids[0], 999, out _).Code == "unknown_item", "Unknown item ID is rejected");
Check(loot.Pickup(ids[0], 6, out _).Code == "too_far", "Remote pickup is rejected");
loot.Fire(ids[0], new FireIntent(WeaponKind.Laser, 2800));
loot.Input(ids[1], new InputBatch(1, 1, 0, 0, MathF.PI));
loot.Fire(ids[1], new FireIntent(WeaponKind.Laser, 2800));
Check(loot.Pickup(ids[0], 1, out var picked).Accepted && picked is { ItemId: 1, Kind: ItemKind.HealthKit },
    "Health Kit enters the authoritative inventory");
Check(loot.InventoryFor(ids[0]).HealthKits == 2, "Pickup increases stack count");
Check(loot.UseItem(ids[0], ItemKind.HealthKit) is { Accepted: true, Health: 100 },
    "Using a kit heals to at most 100");
Check(loot.InventoryFor(ids[0]).HealthKits == 1, "Using a kit consumes one");
Check(loot.UseItem(ids[0], ItemKind.RadarCell) is { Accepted: true, Radar.ActiveTicks: 180 },
    "Radar item reveals opponents for six seconds");
Check(loot.UseItem(ids[0], ItemKind.AmmoCrate).Code == "used",
    "Ammo crate replenishes reserve after firing");
Check(loot.Pickup(ids[1], 1, out _).Code == "unavailable",
    "Only one of two nearby injured players can take a kit");
Check(!loot.ItemSnapshot().Items.Any(item => item.Id == 1),
    "Picked kit disappears from authoritative item snapshot");
for (var tick = 0; tick < 899; tick++) loot.Step();
Check(!loot.ItemSnapshot().Items.Any(item => item.Id == 1), "Kit stays absent during cooldown");
loot.Step();
Check(loot.ItemSnapshot().Items.Any(item => item.Id == 1), "Kit respawns after configured cooldown");
Console.WriteLine("PASS: starter inventory, three usable items, distance/death checks, contested pickup and respawn");

var zone = new ZoneSystem("zone-probe");
var previous = zone.State();
Check(previous.Stage == "Warning" && previous.PhaseIndex == 1, "Zone starts with a warning");
Check(!zone.Outside(0, 0) && !zone.Outside(4000, 3000),
    "Initial zone covers every map corner");
foreach (var (size, warning) in new[] { (5, 1440), (10, 1800), (20, 2340),
    (25, 2700), (50, 3420) })
    Check(new ZoneSystem($"pace-{size}", size).State().RemainingTicks == warning,
        "Warning duration follows room capacity");
var stages = new HashSet<string>();
for (var tick = 0; tick < 18000 && !zone.Completed; tick++)
{
    var current = zone.State();
    stages.Add(current.Stage);
    Check(current.Radius <= previous.Radius + 0.01f, "Zone radius never grows");
    var offset = MathF.Sqrt(MathF.Pow(current.TargetX - current.CenterX, 2) +
        MathF.Pow(current.TargetY - current.CenterY, 2));
    Check(offset + current.TargetRadius <= current.Radius + 0.02f,
        "Target circle remains within the current zone");
    Check(current.TargetX - current.TargetRadius >= -0.02f &&
        current.TargetX + current.TargetRadius <= MapData.Width + 0.02f &&
        current.TargetY - current.TargetRadius >= -0.02f &&
        current.TargetY + current.TargetRadius <= MapData.Height + 0.02f,
        "Next zone stays inside map bounds");
    previous = current;
    zone.Step();
}
Check(zone.Completed && zone.State().PhaseIndex == 5 &&
    stages.SetEquals(["Warning", "Shrinking", "Stable"]),
    "All five phases and three stages complete");
foreach (byte rate in new byte[] { 1, 2, 4, 7, 12 })
{
    var units = 0;
    var total = 0;
    for (var tick = 0; tick < 30; tick++) total += ZoneDamageSystem.Accumulate(ref units, rate);
    Check(total == rate && units == 0, "Zone damage is exact over one second");
}
Console.WriteLine("PASS: five zone phases, map containment, stages and exact damage rates");

var crowd = new MatchRuntime("crowd-probe", competitive: true, capacity: 50);
var crowdIds = Enumerable.Range(0, 50).Select(_ => Guid.NewGuid()).ToArray();
foreach (var (id, index) in crowdIds.Select((id, index) => (id, index)))
    Check(crowd.Join(id, $"driver-{index}") is not null, "50 players can join");
Check(crowd.Join(Guid.NewGuid(), "extra") is null, "51st player is rejected");
var positions = crowd.Step().Players;
Check(positions.Count == 50 && positions.All(player => player.X >= 0 && player.X <= MapData.Width &&
    player.Y >= 0 && player.Y <= MapData.Height), "All 50 players spawn on map");
Check(positions.Select(player => (player.X, player.Y)).Distinct().Count() == 50,
    "50 players receive distinct spawn positions");
Console.WriteLine("PASS: 50-player capacity and spawn positions");

var sight = new MatchRuntime("light-probe");
sight.Join(ids[0], "viewer");
sight.Join(ids[1], "hidden");
Snapshot sightSnapshot = sight.Step();
for (uint sequence = 1; sequence <= 80; sequence++)
{
    var target = sightSnapshot.Players.Single(player => player.PlayerId == ids[1]);
    var dx = 1260 - target.X;
    var dy = 430 - target.Y;
    var distance = MathF.Sqrt(dx * dx + dy * dy);
    sight.Input(ids[1], new InputBatch(sequence, sequence,
        distance < 20 ? 0 : dx / distance, distance < 20 ? 0 : dy / distance, 0));
    sightSnapshot = sight.Step();
}
var hidden = sightSnapshot.Players.Single(player => player.PlayerId == ids[1]);
Check(MathF.Sqrt((hidden.X - 1260) * (hidden.X - 1260) + (hidden.Y - 430) * (hidden.Y - 430)) < 46,
    "Target enters a bush for headlight visibility probe");
var aim = MathF.Atan2(hidden.Y - 640, hidden.X - 1100);
sight.Input(ids[0], new InputBatch(1, 1, 0, 0, aim));
sightSnapshot = sight.Step();
Check(sight.VisibleSnapshots(sightSnapshot).Single(view => view.ViewerId == ids[0]).Snapshot.Players.Count == 2,
    "Headlights reveal a target in a bush");
sight.SetHeadlights(ids[0], false);
Check(sight.VisibleSnapshots(sightSnapshot).Single(view => view.ViewerId == ids[0]).Snapshot.Players.Count == 1,
    "Turning off headlights conceals the bush target");
Console.WriteLine("PASS: server-side headlight detection through bush visibility");

var lifecycle = new MatchLifecycle("lifecycle-probe");
lifecycle.Join(ids[0], "first", 100);
lifecycle.Join(ids[1], "second", 100);
lifecycle.Join(ids[2], "third", 100);
lifecycle.Kill(ids[2], ids[0]);
Check(lifecycle.TryFinish(false) is null, "Match continues with two survivors");
lifecycle.Kill(ids[1], ids[0]);
var outcome = lifecycle.TryFinish(false);
Check(outcome is { WinnerId: var winner } && winner == ids[0] &&
    outcome.Players.Single(player => player.PlayerId == ids[0]).Placement == 1 &&
    outcome.Players.Single(player => player.PlayerId == ids[1]).Placement == 2 &&
    outcome.Players.Single(player => player.PlayerId == ids[2]).Placement == 3 &&
    outcome.Players.Single(player => player.PlayerId == ids[0]).Kills == 2,
    "Winner, placements and kills are recorded");
Check(ReferenceEquals(outcome, lifecycle.TryFinish(true)), "Match result is produced once");
Console.WriteLine("PASS: winner, placement, kill count and single final result");
