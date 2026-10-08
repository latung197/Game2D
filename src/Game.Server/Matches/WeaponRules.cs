using Game.Shared.Contracts;

namespace Game.Server.Matches;

internal sealed record WeaponRule(int CooldownTicks, float Speed, float Range, byte Damage,
    float BlastRadius = 0, int FlightTicks = 0);

internal static class WeaponRules
{
    public static WeaponRule For(WeaponKind weapon) => weapon switch
    {
        WeaponKind.Bullet => new(7, 1100, 1800, 25),
        WeaponKind.Laser => new(12, 0, 2800, 25),
        WeaponKind.Rocket => new(30, 520, 2200, 40, 110),
        WeaponKind.Artillery => new(45, 0, 1350, 45, 145, 45),
        WeaponKind.Mud => new(20, 650, 1200, 0, 100),
        _ => throw new ArgumentOutOfRangeException(nameof(weapon))
    };
}
