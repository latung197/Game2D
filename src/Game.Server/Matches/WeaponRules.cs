using System.Text.Json;
using System.Text.Json.Serialization;
using Game.Shared.Contracts;

namespace Game.Server.Matches;

internal enum WeaponBehavior { Projectile, Hitscan, Lob, Hazard }

internal sealed record WeaponRule(WeaponKind Kind, WeaponBehavior Behavior, int CooldownTicks, float Speed, float Range,
    byte Damage, float BlastRadius, int FlightTicks, byte Magazine, byte Reserve, int ReloadTicks);

internal static class WeaponRules
{
    private static readonly IReadOnlyDictionary<WeaponKind, WeaponRule> Rules = Load();
    public static IEnumerable<WeaponRule> All => Rules.Values;
    public static WeaponRule For(WeaponKind weapon) => Rules[weapon];

    private static IReadOnlyDictionary<WeaponKind, WeaponRule> Load()
    {
        using var stream = typeof(WeaponRules).Assembly.GetManifestResourceStream("Game.Server.WeaponDefinitions.json")
            ?? throw new InvalidOperationException("Missing weapon definitions.");
        var rules = JsonSerializer.Deserialize<WeaponRule[]>(stream,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true,
                Converters = { new JsonStringEnumConverter() } })
            ?? throw new InvalidOperationException("Invalid weapon definitions.");
        if (rules.Length != Enum.GetValues<WeaponKind>().Length ||
            rules.Any(rule => !Enum.IsDefined(rule.Kind) || !Enum.IsDefined(rule.Behavior) ||
                rule.CooldownTicks < 1 || rule.Range <= 0 || rule.Magazine < 1 ||
                rule.ReloadTicks < 1 || (rule.Behavior == WeaponBehavior.Lob && rule.FlightTicks < 1)) ||
            rules.Select(rule => rule.Kind).Distinct().Count() != rules.Length)
            throw new InvalidOperationException("Weapon definitions are incomplete or invalid.");
        return rules.ToDictionary(rule => rule.Kind);
    }
}
