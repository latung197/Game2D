using System.Text.Json;

namespace Game.Server.Matches;

internal static class MapData
{
    private static readonly MapFile Definition = Load();

    public static float Width => Definition.Map.Width;
    public static float Height => Definition.Map.Height;

    public static readonly (float X, float Y, float W, float H)[] Buildings =
        Definition.Buildings.Select(b => (b.X, b.Y, b.W, b.H)).ToArray();

    public static readonly (float X, float Y, float R)[] Bushes =
        Definition.Bushes.Select(b => (b.X, b.Y, b.R)).ToArray();

    private static MapFile Load()
    {
        using var stream = typeof(MapData).Assembly.GetManifestResourceStream("Game.Server.MapDefinition.json")
            ?? throw new InvalidOperationException("Embedded map definition is missing.");
        var map = JsonSerializer.Deserialize<MapFile>(stream, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });
        if (map is null || !float.IsFinite(map.Map.Width) || !float.IsFinite(map.Map.Height) ||
            map.Map.Width <= 0 || map.Map.Height <= 0 ||
            map.Buildings is null || map.Bushes is null ||
            map.Buildings.Any(b => !float.IsFinite(b.X) || !float.IsFinite(b.Y) ||
                !float.IsFinite(b.W) || !float.IsFinite(b.H) || b.W <= 0 || b.H <= 0 ||
                b.X < 0 || b.Y < 0 || b.X + b.W > map.Map.Width || b.Y + b.H > map.Map.Height) ||
            map.Bushes.Any(b => !float.IsFinite(b.X) || !float.IsFinite(b.Y) ||
                !float.IsFinite(b.R) || b.R <= 8 || b.X - b.R < 0 || b.Y - b.R < 0 ||
                b.X + b.R > map.Map.Width || b.Y + b.R > map.Map.Height))
            throw new InvalidOperationException("Map definition is invalid.");
        return map;
    }

    private sealed record MapFile(MapBounds Map, Building[] Buildings, Bush[] Bushes);
    private sealed record MapBounds(float Width, float Height);
    private sealed record Building(float X, float Y, float W, float H);
    private sealed record Bush(float X, float Y, float R);
}
