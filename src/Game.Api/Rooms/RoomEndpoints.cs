using System.Security.Claims;
using Game.Application.Abstractions;
using Game.Realtime.Connections;
using Game.Realtime.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Game.Api.Rooms;

public static class RoomEndpoints
{
    public static void Map(WebApplication app)
    {
        var rooms = app.MapGroup("/api/rooms").RequireAuthorization();
        rooms.MapGet("/", (IRoomGateway gateway, CancellationToken ct) => gateway.ListRoomsAsync(ct));
        rooms.MapGet("/current", async (ClaimsPrincipal user, IRoomGateway gateway, CancellationToken ct) =>
            await gateway.GetRoomAsync(PlayerId(user), ct) is { } room ? Results.Ok(room) : Results.NoContent());
        rooms.MapPost("/", async (CreateRoomRequest request, ClaimsPrincipal user, IRoomGateway gateway, CancellationToken ct) =>
            MapResult(await gateway.CreateRoomAsync(PlayerId(user), Username(user), request.Name ?? "", request.Capacity ?? 10, ct)));
        rooms.MapPost("/quick", async (ClaimsPrincipal user, IRoomGateway gateway, CancellationToken ct) =>
            MapResult(await gateway.QuickJoinAsync(PlayerId(user), Username(user), ct)));
        rooms.MapPost("/{roomId}/join", async (string roomId, ClaimsPrincipal user, IRoomGateway gateway, CancellationToken ct) =>
            MapResult(await gateway.JoinRoomAsync(PlayerId(user), Username(user), roomId, ct)));
        rooms.MapPost("/{roomId}/start", async (string roomId, ClaimsPrincipal user, IRoomGateway gateway, CancellationToken ct) =>
            MapResult(await gateway.StartRoomAsync(PlayerId(user), roomId, ct)));
        rooms.MapPost("/{roomId}/finish", async (string roomId, ClaimsPrincipal user, IRoomGateway gateway, CancellationToken ct) =>
            MapResult(await gateway.FinishRoomAsync(PlayerId(user), roomId, ct)));
        rooms.MapDelete("/{roomId}", async (string roomId, ClaimsPrincipal user, IRoomGateway gateway,
            ConnectionRegistry connections, IHubContext<GameHub> hub, CancellationToken ct) =>
        {
            var playerId = PlayerId(user);
            var result = await gateway.LeaveRoomAsync(playerId, roomId, ct);
            if (result.Error is not null) return MapResult(result);
            foreach (var connectionId in connections.Detach(playerId, roomId))
            {
                await hub.Groups.RemoveFromGroupAsync(connectionId, roomId, ct);
                await hub.Clients.Client(connectionId).SendAsync("RoomLeft", cancellationToken: ct);
            }
            return Results.Ok(result.Room);
        });
    }

    private static Guid PlayerId(ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private static string Username(ClaimsPrincipal user) => user.Identity?.Name ?? "player";
    private static IResult MapResult(RoomResult result) => result.Error switch
    {
        null => Results.Ok(result.Room),
        "room_not_found" => Results.NotFound(new { error = result.Error }),
        "already_in_room" or "room_full" or "room_started" or "room_not_playing" or "not_host" or "not_member" or "room_limit" =>
            Results.Conflict(new { error = result.Error }),
        _ => Results.BadRequest(new { error = result.Error })
    };
}

public sealed record CreateRoomRequest(string? Name, int? Capacity = null);
