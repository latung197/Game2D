using System.Text.Json;
using System.Text.Json.Serialization;
using Game.Server.Matches;
using Game.Shared.Contracts;

namespace Game.Server.Items;

internal sealed record ItemDefinition(ItemKind Kind, byte Heal, float PickupRadius, uint RespawnTicks,
    byte MaxStack, byte StartingCount);
internal sealed record LootSpawn(ushort Id, ItemKind Kind, float X, float Y);

internal static class ItemCatalog
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public static IReadOnlyDictionary<ItemKind, ItemDefinition> Definitions { get; } = LoadDefinitions();
    public static IReadOnlyList<LootSpawn> Spawns { get; } = LoadSpawns();

    private static IReadOnlyDictionary<ItemKind, ItemDefinition> LoadDefinitions()
    {
        using var stream = typeof(ItemCatalog).Assembly.GetManifestResourceStream("Game.Server.ItemDefinitions.json")
            ?? throw new InvalidOperationException("Missing item definitions.");
        var definitions = JsonSerializer.Deserialize<ItemDefinition[]>(stream, JsonOptions)
            ?? throw new InvalidOperationException("Invalid item definitions.");
        if (definitions.Length == 0 || definitions.Any(item => !Enum.IsDefined(item.Kind) ||
            item.PickupRadius is < 1 or > 200 || item.RespawnTicks < 1 ||
            item.MaxStack is < 1 or > 9 || item.StartingCount > item.MaxStack) ||
            definitions.Select(item => item.Kind).Distinct().Count() != definitions.Length)
            throw new InvalidOperationException("Item definitions are incomplete or invalid.");
        return definitions.ToDictionary(item => item.Kind);
    }

    private static IReadOnlyList<LootSpawn> LoadSpawns()
    {
        using var stream = typeof(ItemCatalog).Assembly.GetManifestResourceStream("Game.Server.LootSpawns.json")
            ?? throw new InvalidOperationException("Missing loot spawns.");
        var spawns = JsonSerializer.Deserialize<LootSpawn[]>(stream, JsonOptions)
            ?? throw new InvalidOperationException("Invalid loot spawns.");
        if (spawns.Length == 0 || spawns.Any(spawn => spawn.Id == 0 ||
            !Definitions.ContainsKey(spawn.Kind) || !float.IsFinite(spawn.X) ||
            !float.IsFinite(spawn.Y) || spawn.X < 35 || spawn.X > MapData.Width - 35 ||
            spawn.Y < 35 || spawn.Y > MapData.Height - 35 || MapData.Buildings.Any(building =>
                spawn.X >= building.X - 28 && spawn.X <= building.X + building.W + 28 &&
                spawn.Y >= building.Y - 28 && spawn.Y <= building.Y + building.H + 28)) ||
            spawns.Select(spawn => spawn.Id).Distinct().Count() != spawns.Length)
            throw new InvalidOperationException("Loot spawns are incomplete or invalid.");
        return spawns;
    }
}
