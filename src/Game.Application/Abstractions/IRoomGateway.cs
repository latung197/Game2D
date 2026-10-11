namespace Game.Application.Abstractions;

public sealed record RoomSummary(string Id, string Name, string State, Guid HostId,
    string HostName, int PlayerCount, int Capacity, bool IsQuick);
public sealed record RoomResult(RoomSummary? Room, string? Error)
{
    public static RoomResult Success(RoomSummary room) => new(room, null);
    public static RoomResult Failure(string error) => new(null, error);
}

public interface IRoomGateway
{
    Task<IReadOnlyList<RoomSummary>> ListRoomsAsync(CancellationToken cancellationToken);
    Task<RoomResult> CreateRoomAsync(Guid playerId, string username, string name, int capacity, CancellationToken cancellationToken);
    Task<RoomResult> JoinRoomAsync(Guid playerId, string username, string roomId, CancellationToken cancellationToken);
    Task<RoomResult> QuickJoinAsync(Guid playerId, string username, CancellationToken cancellationToken);
    Task<RoomResult> StartRoomAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
    Task<RoomResult> FinishRoomAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
    Task<RoomResult> LeaveRoomAsync(Guid playerId, string roomId, CancellationToken cancellationToken);
    Task<RoomSummary?> GetRoomAsync(Guid playerId, CancellationToken cancellationToken);
}
