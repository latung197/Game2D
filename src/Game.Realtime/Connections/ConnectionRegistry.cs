using System.Collections.Concurrent;
using Game.Shared.Contracts;

namespace Game.Realtime.Connections;

public sealed class ConnectionRegistry
{
    private readonly ConcurrentDictionary<string, PlayerIdentity> _connections = new();

    public void Add(string connectionId, PlayerIdentity player) => _connections[connectionId] = player;
    public bool Remove(string connectionId, out PlayerIdentity player) => _connections.TryRemove(connectionId, out player!);
    public bool Contains(Guid playerId) => _connections.Values.Any(player => player.PlayerId == playerId);
    public bool IsJoined(string connectionId) => _connections.ContainsKey(connectionId);
    public string[] ConnectionIds(Guid playerId) => _connections
        .Where(entry => entry.Value.PlayerId == playerId)
        .Select(entry => entry.Key).ToArray();
}
