using System.Security.Claims;
using Game.Application.Abstractions;
using Game.Realtime.Connections;
using Game.Shared.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Game.Realtime.Hubs;

[Authorize]
public sealed class GameHub(IMatchCommandGateway gateway, ConnectionRegistry connections) : Hub
{
    public async Task<JoinAccepted> JoinMatch()
    {
        if (!Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var playerId))
            throw new HubException("Invalid identity.");
        var username = Context.User?.Identity?.Name ?? "player";
        var accepted = await gateway.JoinAsync(playerId, username, Context.ConnectionAborted)
            ?? throw new HubException("Match is full or busy.");
        await Groups.AddToGroupAsync(Context.ConnectionId, GameProtocol.DevelopmentMatch);
        var self = accepted.Players.First(player => player.PlayerId == playerId);
        connections.Add(Context.ConnectionId, self);
        await Clients.OthersInGroup(GameProtocol.DevelopmentMatch).SendAsync("PlayerJoined", self);
        return accepted;
    }

    public Task InputBatch(byte[] payload)
    {
        if (!connections.IsJoined(Context.ConnectionId) ||
            !Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var playerId))
            throw new HubException("Join the match first.");
        if (!BinaryGameCodec.TryDecodeInput(payload, out var input)) return Task.CompletedTask;
        if (!gateway.Input(playerId, input)) throw new HubException("Input queue is full.");
        return Task.CompletedTask;
    }

    public Task Fire(byte[] payload)
    {
        if (!connections.IsJoined(Context.ConnectionId) ||
            !Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var playerId))
            throw new HubException("Join the match first.");
        if (!BinaryGameCodec.TryDecodeFire(payload, out var intent)) return Task.CompletedTask;
        if (!gateway.Fire(playerId, intent)) throw new HubException("Input queue is full.");
        return Task.CompletedTask;
    }

    public async Task<byte[]> UseRadar()
    {
        if (!connections.IsJoined(Context.ConnectionId) ||
            !Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var playerId))
            throw new HubException("Join the match first.");
        var result = await gateway.UseRadarAsync(playerId, Context.ConnectionAborted);
        return BinaryGameCodec.EncodeRadar(result);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (connections.Remove(Context.ConnectionId, out var player) && !connections.Contains(player.PlayerId))
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            try { await gateway.LeaveAsync(player.PlayerId, timeout.Token); }
            catch (OperationCanceledException) { }
            await Clients.Group(GameProtocol.DevelopmentMatch).SendAsync("PlayerLeft", player.NetworkId);
        }
        await base.OnDisconnectedAsync(exception);
    }
}
