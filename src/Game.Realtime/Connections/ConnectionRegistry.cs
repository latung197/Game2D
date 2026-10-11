using System.Collections.Concurrent;
using Game.Shared.Contracts;

namespace Game.Realtime.Connections;

public sealed record ConnectionMembership(string RoomId, PlayerIdentity Player);

public sealed class ConnectionRegistry
{
    private readonly ConcurrentDictionary<string, ConnectionMembership> _connections = new();

    public void Add(string connectionId, string roomId, PlayerIdentity player) =>
        _connections[connectionId] = new ConnectionMembership(roomId, player);
    public bool Remove(string connectionId, out ConnectionMembership membership) =>
        _connections.TryRemove(connectionId, out membership!);
    public bool TryGet(string connectionId, out ConnectionMembership membership) =>
        _connections.TryGetValue(connectionId, out membership!);
    public bool Contains(Guid playerId, string roomId) => _connections.Values.Any(connection =>
        connection.Player.PlayerId == playerId && connection.RoomId == roomId);
    public string[] ConnectionIds(Guid playerId, string roomId) => _connections
        .Where(entry => entry.Value.Player.PlayerId == playerId && entry.Value.RoomId == roomId)
        .Select(entry => entry.Key).ToArray();
    public string[] Detach(Guid playerId, string roomId)
    {
        var ids = ConnectionIds(playerId, roomId);
        foreach (var id in ids) _connections.TryRemove(id, out _);
        return ids;
    }
}
