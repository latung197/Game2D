namespace Game.Server.Matches;

internal static class DamageService
{
    public static bool Apply(PlayerRuntime player, byte amount, uint tick)
    {
        if (player.Health == 0 || amount == 0) return false;
        player.Health = (byte)Math.Max(0, player.Health - amount);
        if (player.Health != 0) return false;
        player.MoveX = player.MoveY = 0;
        player.VelocityX = player.VelocityY = 0;
        player.RespawnAtTick = tick + 90;
        return true;
    }
}
