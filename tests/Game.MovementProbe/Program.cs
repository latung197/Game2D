using System.Text.Json;
using Game.Server.Matches;
using Game.Shared.Contracts;

var inputs = JsonSerializer.Deserialize<MovementInput[]>(Console.In.ReadToEnd(), new JsonSerializerOptions
{
    PropertyNameCaseInsensitive = true
}) ?? throw new InvalidOperationException("Movement inputs are required.");
var match = new MatchRuntime("movement-probe");
var playerId = Guid.NewGuid();
var joined = match.Join(playerId, "probe") ?? throw new InvalidOperationException("Cannot join movement probe.");
var networkId = joined.Players.Single().NetworkId;
var states = new List<MovementSample>(inputs.Length + 1);
states.Add(Capture(match.Step().Players.Single(player => player.NetworkId == networkId)));
for (var index = 0; index < inputs.Length; index++)
{
    var input = inputs[index];
    var sequence = (uint)index + 1;
    match.Input(playerId, new InputBatch(sequence, sequence, input.MoveX, input.MoveY, input.AimAngle));
    states.Add(Capture(match.Step().Players.Single(player => player.NetworkId == networkId)));
}
Console.WriteLine(JsonSerializer.Serialize(states));

static MovementSample Capture(PlayerState player) => new(player.X, player.Y,
    player.VelocityX, player.VelocityY, player.Rotation);

internal sealed record MovementInput(float MoveX, float MoveY, float AimAngle);
internal sealed record MovementSample(float X, float Y, float VelocityX, float VelocityY, float Rotation);
