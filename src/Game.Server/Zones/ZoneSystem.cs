using System.Text.Json;
using Game.Server.Matches;
using Game.Shared.Contracts;

namespace Game.Server.Zones;

internal sealed record ZonePhase(int WarningTicks, int ShrinkTicks, int StableTicks,
    float TargetRadius, byte DamagePerSecond);
internal sealed record GameRules(float InitialCenterX, float InitialCenterY, float InitialRadius,
    int TickRate, ZonePhase[] Phases);

internal static class RuleCatalog
{
    public static GameRules Current { get; } = Load();

    private static GameRules Load()
    {
        using var stream = typeof(RuleCatalog).Assembly.GetManifestResourceStream("Game.Server.GameRules.json")
            ?? throw new InvalidOperationException("Missing game rules.");
        var rules = JsonSerializer.Deserialize<GameRules>(stream,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("Invalid game rules.");
        if (rules.TickRate != 30 || rules.Phases is null || rules.Phases.Length == 0 ||
            rules.InitialRadius < MathF.Sqrt(MapData.Width * MapData.Width + MapData.Height * MapData.Height) / 2 ||
            rules.InitialCenterX != MapData.Width / 2 || rules.InitialCenterY != MapData.Height / 2 ||
            rules.Phases.Any(phase => phase.WarningTicks < 1 || phase.ShrinkTicks < 1 ||
                phase.StableTicks < 1 || phase.TargetRadius < 1 || phase.DamagePerSecond < 1) ||
            rules.Phases.Zip(rules.Phases.Skip(1)).Any(pair => pair.Second.TargetRadius >= pair.First.TargetRadius) ||
            rules.Phases[0].TargetRadius >= rules.InitialRadius)
            throw new InvalidOperationException("Game rules are invalid.");
        return rules;
    }
}

internal sealed class ZoneSystem
{
    private readonly GameRules _rules = RuleCatalog.Current;
    private readonly Random _random;
    private readonly float _durationScale;
    private int _phaseIndex;
    private int _stageTick;
    private string _stage = "Warning";
    private float _startX, _startY, _startRadius;
    private float _targetX, _targetY, _targetRadius;
    private float _centerX, _centerY, _radius;
    public bool Completed { get; private set; }

    public ZoneSystem(string matchId, int capacity = 10)
    {
        _durationScale = capacity switch { 5 => .8f, 10 => 1f, 20 => 1.3f,
            25 => 1.5f, 50 => 1.9f, _ => 1f };
        var seed = 2166136261u;
        foreach (var character in matchId) seed = (seed ^ character) * 16777619u;
        _random = new Random(unchecked((int)seed));
        _centerX = _rules.InitialCenterX;
        _centerY = _rules.InitialCenterY;
        _radius = _rules.InitialRadius;
        ChooseTarget();
    }

    public ZoneState State()
    {
        var phase = _rules.Phases[_phaseIndex];
        var duration = _stage switch
        {
            "Warning" => Duration(phase.WarningTicks),
            "Shrinking" => Duration(phase.ShrinkTicks),
            _ => Duration(phase.StableTicks)
        };
        return new ZoneState(_phaseIndex + 1, _stage, _centerX, _centerY, _radius,
            _targetX, _targetY, _targetRadius,
            (ushort)Math.Clamp(Completed ? 0 : duration - _stageTick, 0, ushort.MaxValue),
            phase.DamagePerSecond, Completed);
    }

    public void Step()
    {
        if (Completed) return;
        var phase = _rules.Phases[_phaseIndex];
        _stageTick++;
        if (_stage == "Warning")
        {
            if (_stageTick >= Duration(phase.WarningTicks)) { _stage = "Shrinking"; _stageTick = 0; }
            return;
        }
        if (_stage == "Shrinking")
        {
            var progress = Math.Min(1f, _stageTick / (float)Duration(phase.ShrinkTicks));
            _centerX = _startX + (_targetX - _startX) * progress;
            _centerY = _startY + (_targetY - _startY) * progress;
            _radius = _startRadius + (_targetRadius - _startRadius) * progress;
            if (progress >= 1) { _stage = "Stable"; _stageTick = 0; }
            return;
        }
        if (_stageTick < Duration(phase.StableTicks)) return;
        if (_phaseIndex == _rules.Phases.Length - 1)
        {
            Completed = true;
            _stageTick = Duration(phase.StableTicks);
            return;
        }
        _phaseIndex++;
        _stage = "Warning";
        _stageTick = 0;
        ChooseTarget();
    }

    public bool Outside(float x, float y)
    {
        var dx = x - _centerX;
        var dy = y - _centerY;
        return dx * dx + dy * dy > _radius * _radius;
    }

    private int Duration(int ticks) => Math.Max(1, (int)MathF.Round(ticks * _durationScale));

    private void ChooseTarget()
    {
        _startX = _centerX;
        _startY = _centerY;
        _startRadius = _radius;
        _targetRadius = _rules.Phases[_phaseIndex].TargetRadius;
        var maxOffset = _radius - _targetRadius;
        for (var attempt = 0; attempt < 64; attempt++)
        {
            var angle = _random.NextSingle() * MathF.PI * 2;
            var distance = MathF.Sqrt(_random.NextSingle()) * maxOffset;
            var x = _centerX + MathF.Cos(angle) * distance;
            var y = _centerY + MathF.Sin(angle) * distance;
            if (x < _targetRadius || y < _targetRadius ||
                x > MapData.Width - _targetRadius || y > MapData.Height - _targetRadius) continue;
            _targetX = x;
            _targetY = y;
            return;
        }
        _targetX = Math.Clamp(_centerX, _targetRadius, MapData.Width - _targetRadius);
        _targetY = Math.Clamp(_centerY, _targetRadius, MapData.Height - _targetRadius);
    }
}
