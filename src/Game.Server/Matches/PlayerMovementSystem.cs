namespace Game.Server.Matches;

internal static class PlayerMovementSystem
{
    private const float TickSeconds = 1f / 30f;
    private const float Acceleration = 1000f;
    private const float Braking = 1400f;
    private const float RotationSpeed = 10f;

    public static void Step(PlayerRuntime player, (float X, float Y, float W, float H)[] buildings)
    {
        var maximumSpeed = player.Status == 1 ? 126f : 280f;
        var desiredX = player.MoveX * maximumSpeed;
        var desiredY = player.MoveY * maximumSpeed;
        var changeX = desiredX - player.VelocityX;
        var changeY = desiredY - player.VelocityY;
        var length = MathF.Sqrt(changeX * changeX + changeY * changeY);
        var maximumChange = (player.MoveX == 0 && player.MoveY == 0 ? Braking : Acceleration) * TickSeconds;
        if (length > maximumChange)
        {
            changeX *= maximumChange / length;
            changeY *= maximumChange / length;
        }
        player.VelocityX += changeX;
        player.VelocityY += changeY;

        var nextX = Math.Clamp(player.X + player.VelocityX * TickSeconds, 35, 3165);
        var nextY = Math.Clamp(player.Y + player.VelocityY * TickSeconds, 35, 2165);
        if (Blocked(nextX, player.Y, buildings) || (nextX == player.X && player.VelocityX != 0))
            player.VelocityX = 0;
        else player.X = nextX;
        if (Blocked(player.X, nextY, buildings) || (nextY == player.Y && player.VelocityY != 0))
            player.VelocityY = 0;
        else player.Y = nextY;

        if (player.MoveX == 0 && player.MoveY == 0) return;
        var desiredRotation = MathF.Atan2(player.MoveY, player.MoveX);
        var difference = MathF.Atan2(MathF.Sin(desiredRotation - player.Rotation),
            MathF.Cos(desiredRotation - player.Rotation));
        player.Rotation += Math.Clamp(difference, -RotationSpeed * TickSeconds, RotationSpeed * TickSeconds);
    }

    private static bool Blocked(float x, float y, (float X, float Y, float W, float H)[] buildings)
    {
        foreach (var building in buildings)
            if (x > building.X - 28 && x < building.X + building.W + 28 &&
                y > building.Y - 28 && y < building.Y + building.H + 28) return true;
        return false;
    }
}
