using System.Diagnostics;
using System.Threading.Channels;
using Game.Application.Abstractions;
using Game.Shared.Contracts;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Game.Server.Matches;

public sealed class MatchManager(IGameEventPublisher publisher, IServiceScopeFactory scopes,
    ILogger<MatchManager> logger)
    : BackgroundService, IMatchCommandGateway, IRoomGateway
{
    private readonly object _gate = new();
    private readonly MatchRuntime _development = new(GameProtocol.DevelopmentMatch);
    private readonly Dictionary<string, RoomRuntime> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<Guid, string> _membership = [];
    private readonly Channel<MatchCommand> _commands = Channel.CreateBounded<MatchCommand>(
        new BoundedChannelOptions(1024) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    private readonly Channel<ViewerSnapshot> _snapshots = Channel.CreateBounded<ViewerSnapshot>(
        new BoundedChannelOptions(256) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<(string RoomId, ShotTrace Shot)> _shots = Channel.CreateBounded<(string, ShotTrace)>(
        new BoundedChannelOptions(128) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<(string RoomId, ImpactEvent Impact)> _impacts = Channel.CreateBounded<(string, ImpactEvent)>(
        new BoundedChannelOptions(256) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<(string RoomId, Guid PlayerId, AmmoState Ammo)> _ammo = Channel.CreateBounded<(string, Guid, AmmoState)>(
        new BoundedChannelOptions(256) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<(string RoomId, KillEvent Kill)> _kills = Channel.CreateBounded<(string, KillEvent)>(
        new BoundedChannelOptions(128) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<(string RoomId, ItemSnapshot Snapshot)> _itemSnapshots =
        Channel.CreateBounded<(string, ItemSnapshot)>(new BoundedChannelOptions(128)
        { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<(string RoomId, ItemPicked Pickup)> _pickups =
        Channel.CreateBounded<(string, ItemPicked)>(new BoundedChannelOptions(128)
        { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<(string RoomId, ZoneState Zone)> _zones = Channel.CreateBounded<(string, ZoneState)>(
        new BoundedChannelOptions(256) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Channel<MatchResult> _resultEvents = Channel.CreateUnbounded<MatchResult>(
        new UnboundedChannelOptions { SingleReader = true });
    private readonly Channel<MatchResult> _resultPersistence = Channel.CreateUnbounded<MatchResult>(
        new UnboundedChannelOptions { SingleReader = true });
    private long _droppedCommands;
    private uint _tick;

    public Task<IReadOnlyList<RoomSummary>> ListRoomsAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult<IReadOnlyList<RoomSummary>>(
            _rooms.Values.Select(room => room.Summary()).OrderBy(room => room.Name).ToArray());
    }

    public Task<RoomSummary?> GetRoomAsync(Guid playerId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult(_membership.TryGetValue(playerId, out var id) &&
            _rooms.TryGetValue(id, out var room) ? room.Summary() : null);
    }

    public Task<RoomResult> CreateRoomAsync(Guid playerId, string username, string name, int capacity, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (_membership.ContainsKey(playerId)) return Task.FromResult(RoomResult.Failure("already_in_room"));
            name = name.Trim();
            if (name.Length is < 3 or > 40) return Task.FromResult(RoomResult.Failure("room_name_invalid"));
            if (capacity is not (5 or 10 or 20 or 25 or 50))
                return Task.FromResult(RoomResult.Failure("room_capacity_invalid"));
            if (_rooms.Count >= 64) return Task.FromResult(RoomResult.Failure("room_limit"));
            var room = NewRoom(name, playerId, username, false, capacity);
            return Task.FromResult(RoomResult.Success(room.Summary()));
        }
    }

    public Task<RoomResult> JoinRoomAsync(Guid playerId, string username, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (_membership.TryGetValue(playerId, out var current))
                return Task.FromResult(current.Equals(roomId, StringComparison.OrdinalIgnoreCase) &&
                    _rooms.TryGetValue(current, out var existing) ? RoomResult.Success(existing.Summary()) :
                    RoomResult.Failure("already_in_room"));
            if (!_rooms.TryGetValue(roomId, out var room)) return Task.FromResult(RoomResult.Failure("room_not_found"));
            var result = room.Join(playerId, username);
            if (result.Error is null) _membership[playerId] = room.Id;
            return Task.FromResult(result);
        }
    }

    public Task<RoomResult> QuickJoinAsync(Guid playerId, string username, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (_membership.TryGetValue(playerId, out var current) && _rooms.TryGetValue(current, out var existing))
                return Task.FromResult(RoomResult.Success(existing.Summary()));
            var room = _rooms.Values.FirstOrDefault(candidate => candidate.IsQuick &&
                candidate.State == RoomState.Playing && candidate.Summary().PlayerCount < candidate.Capacity);
            if (room is null)
            {
                if (_rooms.Count >= 64) return Task.FromResult(RoomResult.Failure("room_limit"));
                room = NewRoom("Ghép nhanh", playerId, username, true);
            }
            else
            {
                var result = room.Join(playerId, username);
                if (result.Error is not null) return Task.FromResult(result);
                _membership[playerId] = room.Id;
            }
            return Task.FromResult(RoomResult.Success(room.Summary()));
        }
    }

    public Task<RoomResult> StartRoomAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult(_rooms.TryGetValue(roomId, out var room) ?
            room.Start(playerId) : RoomResult.Failure("room_not_found"));
    }

    public Task<RoomResult> FinishRoomAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (!_rooms.TryGetValue(roomId, out var room))
                return Task.FromResult(RoomResult.Failure("room_not_found"));
            var response = room.Finish(playerId);
            if (response.Error is null && room.Match.Result is { } result) QueueResult(result);
            return Task.FromResult(response);
        }
    }

    public Task<RoomResult> LeaveRoomAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (!_rooms.TryGetValue(roomId, out var room) || !_membership.TryGetValue(playerId, out var current) ||
                !current.Equals(roomId, StringComparison.OrdinalIgnoreCase))
                return Task.FromResult(RoomResult.Failure("not_member"));
            var result = room.Leave(playerId);
            _membership.Remove(playerId);
            if (room.Empty)
            {
                if (room.State == RoomState.Playing && room.Match.FinishMatch() is { } ended)
                    QueueResult(ended);
                _rooms.Remove(room.Id);
            }
            return Task.FromResult(result);
        }
    }

    public Task<JoinAccepted?> JoinAsync(Guid playerId, string username, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (roomId == GameProtocol.DevelopmentMatch)
                return Task.FromResult(_development.Join(playerId, username));
            return Task.FromResult(_rooms.TryGetValue(roomId, out var room) &&
                _membership.TryGetValue(playerId, out var current) &&
                current.Equals(roomId, StringComparison.OrdinalIgnoreCase) ? room.Connect(playerId) : null);
        }
    }

    public ValueTask DisconnectAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (roomId == GameProtocol.DevelopmentMatch) _development.Leave(playerId);
            else if (_rooms.TryGetValue(roomId, out var room)) room.Disconnect(playerId);
        }
        return ValueTask.CompletedTask;
    }

    public bool Input(Guid playerId, string roomId, InputBatch input) => Queue(new InputCommand(playerId, roomId, input));
    public bool Fire(Guid playerId, string roomId, FireIntent intent) => Queue(new FireCommand(playerId, roomId, intent));
    public bool Reload(Guid playerId, string roomId, WeaponKind weapon) => Queue(new ReloadCommand(playerId, roomId, weapon));

    public Task<AmmoState[]> GetAmmoAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult(FindActiveMatch(playerId, roomId)?.AmmoFor(playerId) ?? []);
    }

    public Task<ItemSnapshot?> GetItemsAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult(FindActiveMatch(playerId, roomId)?.ItemSnapshot());
    }

    public Task<ZoneState?> GetZoneAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult(FindActiveMatch(playerId, roomId)?.ZoneState());
    }

    public Task<PickupResult> PickupAsync(Guid playerId, string roomId, ushort itemId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            var match = FindActiveMatch(playerId, roomId);
            if (match is null) return Task.FromResult(new PickupResult(false, "not_in_match", itemId, 0));
            var result = match.Pickup(playerId, itemId, out var picked);
            if (picked is not null)
            {
                _pickups.Writer.TryWrite((match.Id, picked));
                _itemSnapshots.Writer.TryWrite((match.Id, match.ItemSnapshot()));
                match.TakeItemsChanged();
            }
            return Task.FromResult(result);
        }
    }

    public Task<RadarResult> UseRadarAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult(FindActiveMatch(playerId, roomId)?.UseRadar(playerId) ?? new RadarResult(0, 0));
    }

    public Task<InventoryState> GetInventoryAsync(Guid playerId, string roomId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult(FindActiveMatch(playerId, roomId)?.InventoryFor(playerId)
            ?? new InventoryState(0, 0, 0));
    }

    public Task<UseItemResult> UseItemAsync(Guid playerId, string roomId, ItemKind kind,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return Task.FromResult(FindActiveMatch(playerId, roomId)?.UseItem(playerId, kind)
            ?? new UseItemResult(false, "not_in_match", kind, new InventoryState(0, 0, 0), 0,
                new RadarResult(0, 0), []));
    }

    public Task SetHeadlightsAsync(Guid playerId, string roomId, bool enabled,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) FindActiveMatch(playerId, roomId)?.SetHeadlights(playerId, enabled);
        return Task.CompletedTask;
    }

    private bool Queue(MatchCommand command)
    {
        if (_commands.Writer.TryWrite(command)) return true;
        Interlocked.Increment(ref _droppedCommands);
        return false;
    }

    private RoomRuntime NewRoom(string name, Guid hostId, string hostName, bool isQuick, int capacity = 10)
    {
        string id;
        do { id = Guid.NewGuid().ToString("N")[..8]; } while (_rooms.ContainsKey(id));
        var room = new RoomRuntime(id, name, hostId, hostName, isQuick, capacity);
        _rooms.Add(id, room);
        _membership[hostId] = id;
        return room;
    }

    private void QueueResult(MatchResult result)
    {
        _resultEvents.Writer.TryWrite(result);
        _resultPersistence.Writer.TryWrite(result);
    }

    private MatchRuntime? FindActiveMatch(Guid playerId, string roomId)
    {
        if (roomId == GameProtocol.DevelopmentMatch) return _development;
        return _membership.TryGetValue(playerId, out var current) &&
            current.Equals(roomId, StringComparison.OrdinalIgnoreCase) &&
            _rooms.TryGetValue(roomId, out var room) && room.State == RoomState.Playing ? room.Match : null;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var broadcasts = Task.WhenAll(BroadcastSnapshotsAsync(stoppingToken),
            BroadcastShotsAsync(stoppingToken), BroadcastImpactsAsync(stoppingToken),
            BroadcastAmmoAsync(stoppingToken), BroadcastKillsAsync(stoppingToken),
            BroadcastItemsAsync(stoppingToken), BroadcastPickupsAsync(stoppingToken),
            BroadcastZonesAsync(stoppingToken), BroadcastResultsAsync(stoppingToken),
            PersistResultsAsync(stoppingToken));
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1d / 30));
        var tickTotalMs = 0d;
        var tickMaximumMs = 0d;
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var started = Stopwatch.GetTimestamp();
                var roomCount = 0;
                lock (_gate)
                {
                    _tick++;
                    for (var count = 0; count < 1024 && _commands.Reader.TryRead(out var command); count++)
                    {
                        var match = FindActiveMatch(command.PlayerId, command.RoomId);
                        if (match is null) continue;
                        switch (command)
                        {
                            case InputCommand input: match.Input(input.PlayerId, input.Input); break;
                            case FireCommand fire:
                                if (match.Fire(fire.PlayerId, fire.Intent) is { } shot)
                                    _shots.Writer.TryWrite((command.RoomId, shot));
                                break;
                            case ReloadCommand reload: match.Reload(reload.PlayerId, reload.Weapon); break;
                        }
                    }
                    StepMatch(_development);
                    foreach (var room in _rooms.Values)
                    {
                        if (room.State != RoomState.Playing) continue;
                        StepMatch(room.Match);
                        if (room.Match.Result is not { } result) continue;
                        room.FinishAutomatically();
                        QueueResult(result);
                    }
                    if (_tick % 30 == 0)
                    {
                        foreach (var room in _rooms.Values.ToArray())
                        {
                            foreach (var expired in room.RemoveExpired(DateTimeOffset.UtcNow)) _membership.Remove(expired);
                            if (room.Empty)
                            {
                                if (room.State == RoomState.Playing && room.Match.FinishMatch() is { } ended)
                                    QueueResult(ended);
                                _rooms.Remove(room.Id);
                            }
                        }
                    }
                    roomCount = _rooms.Count;
                }
                var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
                tickTotalMs += elapsed;
                tickMaximumMs = Math.Max(tickMaximumMs, elapsed);
                if (elapsed > 33) logger.LogWarning("Room tick {Tick} took {DurationMs} ms", _tick, elapsed);
                if (_tick % 900 == 0)
                {
                    logger.LogInformation("Room tick {Tick}: rooms {Rooms}, avg {AverageMs:F2} ms, max {MaximumMs:F2} ms, dropped commands {Dropped}",
                        _tick, roomCount, tickTotalMs / 900, tickMaximumMs, Interlocked.Read(ref _droppedCommands));
                    tickTotalMs = tickMaximumMs = 0;
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally
        {
            _snapshots.Writer.TryComplete(); _shots.Writer.TryComplete(); _impacts.Writer.TryComplete();
            _ammo.Writer.TryComplete(); _kills.Writer.TryComplete();
            _itemSnapshots.Writer.TryComplete(); _pickups.Writer.TryComplete();
            _zones.Writer.TryComplete(); _resultEvents.Writer.TryComplete();
            _resultPersistence.Writer.TryComplete();
            await broadcasts;
        }
    }

    private void StepMatch(MatchRuntime match)
    {
        var snapshot = match.Step();
        foreach (var impact in match.DrainImpacts()) _impacts.Writer.TryWrite((match.Id, impact));
        foreach (var change in match.DrainAmmoChanges()) _ammo.Writer.TryWrite((match.Id, change.PlayerId, change.Ammo));
        foreach (var kill in match.DrainKills()) _kills.Writer.TryWrite((match.Id, kill));
        if (match.TakeItemsChanged()) _itemSnapshots.Writer.TryWrite((match.Id, match.ItemSnapshot()));
        if (snapshot.ServerTick % 3 == 0 && match.PlayerCount > 0 && match.ZoneState() is { } zone)
            _zones.Writer.TryWrite((match.Id, zone));
        if (snapshot.ServerTick % 3 == 0 && match.PlayerCount > 0)
            foreach (var view in match.VisibleSnapshots(snapshot)) _snapshots.Writer.TryWrite(view);
    }

    private async Task BroadcastSnapshotsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var view in _snapshots.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishSnapshotAsync(view, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish snapshot for {MatchId}", view.Snapshot.MatchId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastShotsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var (roomId, shot) in _shots.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishShotAsync(roomId, shot, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish shot for {MatchId}", roomId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastImpactsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var (roomId, impact) in _impacts.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishImpactAsync(roomId, impact, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish impact for {MatchId}", roomId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastAmmoAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var (roomId, playerId, ammo) in _ammo.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishAmmoAsync(roomId, playerId, ammo, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish ammo for {MatchId}", roomId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastKillsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var (roomId, kill) in _kills.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishKillAsync(roomId, kill, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish kill for {MatchId}", roomId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastItemsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var (roomId, snapshot) in _itemSnapshots.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishItemsAsync(roomId, snapshot, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish loot for {MatchId}", roomId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastPickupsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var (roomId, pickup) in _pickups.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishPickupAsync(roomId, pickup, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish pickup for {MatchId}", roomId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastZonesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var (roomId, zone) in _zones.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishZoneAsync(roomId, zone, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish zone for {MatchId}", roomId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task BroadcastResultsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var result in _resultEvents.Reader.ReadAllAsync(cancellationToken))
                try { await publisher.PublishResultAsync(result.MatchId, result, cancellationToken); }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                { logger.LogError(ex, "Failed to publish result for {MatchId}", result.MatchId); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task PersistResultsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var result in _resultPersistence.Reader.ReadAllAsync(cancellationToken))
            {
                try
                {
                    await using var scope = scopes.CreateAsyncScope();
                    var store = scope.ServiceProvider.GetRequiredService<IMatchResultStore>();
                    await store.SaveIfMissingAsync(result, cancellationToken);
                }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                {
                    logger.LogError(ex, "Failed to save result for {MatchId}; retrying", result.MatchId);
                    await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
                    _resultPersistence.Writer.TryWrite(result);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private abstract record MatchCommand(Guid PlayerId, string RoomId);
    private sealed record InputCommand(Guid PlayerId, string RoomId, InputBatch Input) : MatchCommand(PlayerId, RoomId);
    private sealed record FireCommand(Guid PlayerId, string RoomId, FireIntent Intent) : MatchCommand(PlayerId, RoomId);
    private sealed record ReloadCommand(Guid PlayerId, string RoomId, WeaponKind Weapon) : MatchCommand(PlayerId, RoomId);
}
