using Game.Shared.Contracts;

namespace Game.Server.Items;

internal sealed class LootSystem
{
    private readonly Dictionary<ushort, LootItem> _items = ItemCatalog.Spawns.ToDictionary(
        spawn => spawn.Id, spawn => new LootItem(spawn));
    private uint _revision = 1;

    public ItemSnapshot Snapshot(string matchId) => new(matchId, _revision,
        _items.Values.Where(item => item.Available)
            .Select(item => new WorldItemState(item.Spawn.Id, item.Spawn.Kind, item.Spawn.X, item.Spawn.Y))
            .ToArray());

    public PickupResult Pickup(Guid playerId, byte health, float x, float y, ushort itemId, uint tick,
        Func<ItemKind, bool> canStore,
        out ItemPicked? picked)
    {
        picked = null;
        if (health == 0) return new PickupResult(false, "dead", itemId, health);
        if (!_items.TryGetValue(itemId, out var item)) return new PickupResult(false, "unknown_item", itemId, health);
        if (!item.Available) return new PickupResult(false, "unavailable", itemId, health);
        var definition = ItemCatalog.Definitions[item.Spawn.Kind];
        var dx = item.Spawn.X - x;
        var dy = item.Spawn.Y - y;
        if (dx * dx + dy * dy > definition.PickupRadius * definition.PickupRadius)
            return new PickupResult(false, "too_far", itemId, health);
        if (!canStore(item.Spawn.Kind)) return new PickupResult(false, "inventory_full", itemId, health);
        item.Available = false;
        item.RespawnAtTick = tick + definition.RespawnTicks;
        _revision++;
        picked = new ItemPicked(itemId, playerId, item.Spawn.Kind, health);
        return new PickupResult(true, "picked", itemId, health);
    }

    public bool Step(uint tick)
    {
        var changed = false;
        foreach (var item in _items.Values)
        {
            if (item.Available || item.RespawnAtTick > tick) continue;
            item.Available = true;
            changed = true;
        }
        if (changed) _revision++;
        return changed;
    }

    private sealed class LootItem(LootSpawn spawn)
    {
        public LootSpawn Spawn { get; } = spawn;
        public bool Available = true;
        public uint RespawnAtTick;
    }
}
