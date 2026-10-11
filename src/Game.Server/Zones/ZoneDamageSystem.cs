namespace Game.Server.Zones;

internal static class ZoneDamageSystem
{
    public static byte Accumulate(ref int damageUnits, byte damagePerSecond)
    {
        damageUnits += damagePerSecond;
        var damage = damageUnits / 30;
        damageUnits %= 30;
        return (byte)damage;
    }
}
