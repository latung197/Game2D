using System.Diagnostics;
using System.Threading.Channels;
using Game.Application.Abstractions;
using Game.Shared.Contracts;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Game.Server.Matches;

public sealed class MatchManager(IGameEventPublisher publisher, ILogger<MatchManager> logger) : BackgroundService, IMatchCommandGateway
{
    private readonly Channel<MatchCommand> _commands = Channel.CreateBounded<MatchCommand>(
        new BoundedChannelOptions(1024) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    private readonly Channel<IReadOnlyList<ViewerSnapshot>> _snapshots = Channel.CreateBounded<IReadOnlyList<ViewerSnapshot>>(
        new BoundedChannelOptions(1) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<ShotTrace> _shots = Channel.CreateBounded<ShotTrace>(
        new BoundedChannelOptions(128) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<ImpactEvent> _impacts = Channel.CreateBounded<ImpactEvent>(
        new BoundedChannelOptions(256) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Dictionary<string, MatchRuntime> _matches = new() { [GameProtocol.DevelopmentMatch] = new MatchRuntime(GameProtocol.DevelopmentMatch) };

    public async Task<JoinAccepted?> JoinAsync(Guid playerId, string username, CancellationToken cancellationToken)
    {
        var reply = new TaskCompletionSource<JoinAccepted?>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_commands.Writer.TryWrite(new JoinCommand(playerId, username, reply))) return null;
        return await reply.Task.WaitAsync(cancellationToken);
    }
    public ValueTask LeaveAsync(Guid playerId, CancellationToken cancellationToken) =>
        _commands.Writer.WriteAsync(new LeaveCommand(playerId), cancellationToken);
    public bool Input(Guid playerId, InputBatch input) => _commands.Writer.TryWrite(new InputCommand(playerId, input));
    public bool Fire(Guid playerId, FireIntent intent) => _commands.Writer.TryWrite(new FireCommand(playerId, intent));
    public async Task<RadarResult> UseRadarAsync(Guid playerId, CancellationToken cancellationToken)
    {
        var reply = new TaskCompletionSource<RadarResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        await _commands.Writer.WriteAsync(new RadarCommand(playerId, reply), cancellationToken);
        return await reply.Task.WaitAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var broadcast = BroadcastAsync(stoppingToken);
        var shotBroadcast = BroadcastShotsAsync(stoppingToken);
        var impactBroadcast = BroadcastImpactsAsync(stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1d / 30));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var started = Stopwatch.GetTimestamp();
                var match = _matches[GameProtocol.DevelopmentMatch];
                for (var processed = 0; processed < 1024 && _commands.Reader.TryRead(out var command); processed++)
                {
                    switch (command)
                    {
                        case JoinCommand join: join.Reply.TrySetResult(match.Join(join.PlayerId, join.Username)); break;
                        case LeaveCommand leave: match.Leave(leave.PlayerId); break;
                        case InputCommand input: match.Input(input.PlayerId, input.Input); break;
                        case FireCommand fire:
                            if (match.Fire(fire.PlayerId, fire.Intent) is { } shot) _shots.Writer.TryWrite(shot);
                            break;
                        case RadarCommand radar: radar.Reply.TrySetResult(match.UseRadar(radar.PlayerId)); break;
                    }
                }
                var snapshot = match.Step();
                foreach (var impact in match.DrainImpacts()) _impacts.Writer.TryWrite(impact);
                if (snapshot.ServerTick % 3 == 0 && match.PlayerCount > 0)
                    _snapshots.Writer.TryWrite(match.VisibleSnapshots(snapshot));
                var elapsed = Stopwatch.GetElapsedTime(started);
                if (elapsed > TimeSpan.FromMilliseconds(33))
                    logger.LogWarning("Match {MatchId} tick {Tick} took {DurationMs} ms", match.Id, snapshot.ServerTick, elapsed.TotalMilliseconds);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally
        {
            _snapshots.Writer.TryComplete(); _shots.Writer.TryComplete(); _impacts.Writer.TryComplete();
            await Task.WhenAll(broadcast, shotBroadcast, impactBroadcast);
        }
    }

    private async Task BroadcastAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var views in _snapshots.Reader.ReadAllAsync(cancellationToken))
            {
                foreach (var view in views)
                {
                    try { await publisher.PublishSnapshotAsync(view, cancellationToken); }
                    catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                    {
                        logger.LogError(ex, "Failed to publish snapshot for {MatchId}", view.Snapshot.MatchId);
                    }
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastShotsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var shot in _shots.Reader.ReadAllAsync(cancellationToken))
            {
                try { await publisher.PublishShotAsync(shot, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                {
                    logger.LogError(ex, "Failed to publish shot for {MatchId}", GameProtocol.DevelopmentMatch);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastImpactsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var impact in _impacts.Reader.ReadAllAsync(cancellationToken))
            {
                try { await publisher.PublishImpactAsync(impact, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                {
                    logger.LogError(ex, "Failed to publish impact for {MatchId}", GameProtocol.DevelopmentMatch);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private abstract record MatchCommand(Guid PlayerId);
    private sealed record JoinCommand(Guid PlayerId, string Username, TaskCompletionSource<JoinAccepted?> Reply) : MatchCommand(PlayerId);
    private sealed record LeaveCommand(Guid PlayerId) : MatchCommand(PlayerId);
    private sealed record InputCommand(Guid PlayerId, InputBatch Input) : MatchCommand(PlayerId);
    private sealed record FireCommand(Guid PlayerId, FireIntent Intent) : MatchCommand(PlayerId);
    private sealed record RadarCommand(Guid PlayerId, TaskCompletionSource<RadarResult> Reply) : MatchCommand(PlayerId);
}
