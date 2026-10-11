using System.Security.Claims;
using Game.Application.Abstractions;
using Game.Realtime.Connections;
using Game.Shared.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;

namespace Game.Realtime.Hubs;

[Authorize]
public sealed class GameHub(IMatchCommandGateway gateway, IRoomGateway rooms,
    ConnectionRegistry connections, IHostEnvironment environment) : Hub
{
    public async Task<JoinAccepted> JoinMatch(string? roomId = null)
    {
        if (!Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var playerId))
            throw new HubException("Invalid identity.");
        roomId ??= GameProtocol.DevelopmentMatch;
        if (roomId == GameProtocol.DevelopmentMatch && !environment.IsDevelopment())
            throw new HubException("Choose a room first.");
        if (connections.TryGet(Context.ConnectionId, out var existing) &&
            !existing.RoomId.Equals(roomId, StringComparison.OrdinalIgnoreCase))
            throw new HubException("Leave the current room first.");
        var username = Context.User?.Identity?.Name ?? "player";
        var accepted = await gateway.JoinAsync(playerId, username, roomId, Context.ConnectionAborted)
            ?? throw new HubException("Room is unavailable or you are not a member.");
        var self = accepted.Players.First(player => player.PlayerId == playerId);
        var newlyJoined = !connections.TryGet(Context.ConnectionId, out _);
        connections.Add(Context.ConnectionId, accepted.MatchId, self);
        try
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, accepted.MatchId);
            if (!connections.TryGet(Context.ConnectionId, out var bound) || bound.RoomId != accepted.MatchId)
                throw new HubException("Room changed while joining.");
            if (accepted.MatchId != GameProtocol.DevelopmentMatch)
            {
                var currentRoom = await rooms.GetRoomAsync(playerId, Context.ConnectionAborted);
                if (currentRoom is null || currentRoom.Id != accepted.MatchId || currentRoom.State != "Playing")
                    throw new HubException("Room changed while joining.");
            }
        }
        catch
        {
            connections.Remove(Context.ConnectionId, out _);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, accepted.MatchId);
            if (!connections.Contains(playerId, accepted.MatchId))
                await gateway.DisconnectAsync(playerId, accepted.MatchId, CancellationToken.None);
            throw;
        }
        if (newlyJoined) await Clients.OthersInGroup(accepted.MatchId).SendAsync("PlayerJoined", self);
        var ammo = await gateway.GetAmmoAsync(playerId, accepted.MatchId, Context.ConnectionAborted);
        foreach (var state in ammo) await Clients.Caller.SendAsync("AmmoChanged", state);
        var items = await gateway.GetItemsAsync(playerId, accepted.MatchId, Context.ConnectionAborted);
        if (items is not null) await Clients.Caller.SendAsync("WorldItems", items);
        await Clients.Caller.SendAsync("InventoryChanged",
            await gateway.GetInventoryAsync(playerId, accepted.MatchId, Context.ConnectionAborted));
        var zone = await gateway.GetZoneAsync(playerId, accepted.MatchId, Context.ConnectionAborted);
        if (zone is not null) await Clients.Caller.SendAsync("ZoneState", zone);
        return accepted;
    }

    public Task InputBatch(byte[] payload)
    {
        var membership = CurrentMembership();
        if (!BinaryGameCodec.TryDecodeInput(payload, out var input)) return Task.CompletedTask;
        if (!gateway.Input(membership.Player.PlayerId, membership.RoomId, input))
            throw new HubException("Input queue is full.");
        return Task.CompletedTask;
    }

    public Task Fire(byte[] payload)
    {
        var membership = CurrentMembership();
        if (!BinaryGameCodec.TryDecodeFire(payload, out var intent)) return Task.CompletedTask;
        if (!gateway.Fire(membership.Player.PlayerId, membership.RoomId, intent))
            throw new HubException("Input queue is full.");
        return Task.CompletedTask;
    }

    public Task Reload(byte weapon)
    {
        var membership = CurrentMembership();
        if (!Enum.IsDefined((WeaponKind)weapon)) return Task.CompletedTask;
        if (!gateway.Reload(membership.Player.PlayerId, membership.RoomId, (WeaponKind)weapon))
            throw new HubException("Input queue is full.");
        return Task.CompletedTask;
    }

    public async Task<PickupResult> Pickup(ushort itemId)
    {
        var membership = CurrentMembership();
        var result = await gateway.PickupAsync(membership.Player.PlayerId, membership.RoomId,
            itemId, Context.ConnectionAborted);
        if (result.Accepted) await Clients.Caller.SendAsync("InventoryChanged",
            await gateway.GetInventoryAsync(membership.Player.PlayerId, membership.RoomId,
                Context.ConnectionAborted));
        return result;
    }

    public async Task<UseItemResult> UseItem(byte kind)
    {
        var membership = CurrentMembership();
        var result = await gateway.UseItemAsync(membership.Player.PlayerId, membership.RoomId,
            (ItemKind)kind, Context.ConnectionAborted);
        if (result.Accepted) await Clients.Caller.SendAsync("InventoryChanged", result.Inventory);
        foreach (var ammo in result.Ammo) await Clients.Caller.SendAsync("AmmoChanged", ammo);
        return result;
    }

    public Task SetHeadlights(bool enabled)
    {
        var membership = CurrentMembership();
        return gateway.SetHeadlightsAsync(membership.Player.PlayerId, membership.RoomId,
            enabled, Context.ConnectionAborted);
    }

    public async Task<byte[]> UseRadar()
    {
        var membership = CurrentMembership();
        var result = await gateway.UseRadarAsync(membership.Player.PlayerId, membership.RoomId, Context.ConnectionAborted);
        return BinaryGameCodec.EncodeRadar(result);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (connections.Remove(Context.ConnectionId, out var membership) &&
            !connections.Contains(membership.Player.PlayerId, membership.RoomId))
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            try { await gateway.DisconnectAsync(membership.Player.PlayerId, membership.RoomId, timeout.Token); }
            catch (OperationCanceledException) { }
            var restored = connections.Contains(membership.Player.PlayerId, membership.RoomId) &&
                await gateway.JoinAsync(membership.Player.PlayerId, membership.Player.Username,
                    membership.RoomId, timeout.Token) is not null;
            if (!restored)
                await Clients.Group(membership.RoomId).SendAsync("PlayerLeft", membership.Player.NetworkId);
        }
        await base.OnDisconnectedAsync(exception);
    }

    private ConnectionMembership CurrentMembership()
    {
        if (!connections.TryGet(Context.ConnectionId, out var membership) ||
            !Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var playerId) ||
            membership.Player.PlayerId != playerId)
            throw new HubException("Join the room first.");
        return membership;
    }
}
