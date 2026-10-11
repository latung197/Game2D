using Game.Application.Abstractions;
using Game.Shared.Contracts;

namespace Game.Server.Matches;

internal enum RoomState { Waiting, Starting, Playing, Ending, Finished }

internal sealed class RoomRuntime(string id, string name, Guid hostId, string hostName, bool isQuick, int capacity = 10)
{
    private readonly Dictionary<Guid, Member> _members = new()
    {
        [hostId] = new Member(hostName)
    };

    public string Id { get; } = id;
    public string Name { get; } = name;
    public Guid HostId { get; private set; } = hostId;
    public bool IsQuick { get; } = isQuick;
    public int Capacity { get; } = capacity;
    public RoomState State { get; private set; } = isQuick ? RoomState.Playing : RoomState.Waiting;
    public MatchRuntime Match { get; } = new(id, competitive: true, capacity: capacity);
    public bool Empty => _members.Count == 0;
    public bool Contains(Guid playerId) => _members.ContainsKey(playerId);

    public RoomSummary Summary() => new(Id, Name, State.ToString(), HostId,
        _members.TryGetValue(HostId, out var host) ? host.Username : "", _members.Count, Capacity, IsQuick);

    public RoomResult Join(Guid playerId, string username)
    {
        if (_members.ContainsKey(playerId)) return RoomResult.Success(Summary());
        if (State != RoomState.Waiting && !(IsQuick && State == RoomState.Playing))
            return RoomResult.Failure("room_started");
        if (_members.Count >= Capacity) return RoomResult.Failure("room_full");
        _members.Add(playerId, new Member(username));
        return RoomResult.Success(Summary());
    }

    public RoomResult Start(Guid playerId)
    {
        if (HostId != playerId) return RoomResult.Failure("not_host");
        if (State != RoomState.Waiting) return RoomResult.Failure("room_started");
        State = RoomState.Starting;
        State = RoomState.Playing;
        return RoomResult.Success(Summary());
    }

    public RoomResult Finish(Guid playerId)
    {
        if (HostId != playerId) return RoomResult.Failure("not_host");
        if (State != RoomState.Playing) return RoomResult.Failure("room_not_playing");
        Match.FinishMatch();
        FinishAutomatically();
        return RoomResult.Success(Summary());
    }

    public void FinishAutomatically()
    {
        if (State != RoomState.Playing) return;
        State = RoomState.Ending;
        foreach (var (id, member) in _members)
        {
            Match.Leave(id);
            member.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(30);
        }
        State = RoomState.Finished;
    }

    public JoinAccepted? Connect(Guid playerId)
    {
        if (State != RoomState.Playing || !_members.TryGetValue(playerId, out var member)) return null;
        var accepted = Match.Join(playerId, member.Username);
        if (accepted is not null) member.ExpiresAt = null;
        return accepted;
    }

    public void Disconnect(Guid playerId)
    {
        if (!_members.TryGetValue(playerId, out var member)) return;
        Match.Leave(playerId);
        member.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(30);
    }

    public RoomResult Leave(Guid playerId)
    {
        if (!_members.Remove(playerId)) return RoomResult.Failure("not_member");
        Match.Leave(playerId);
        if (State == RoomState.Playing) Match.RemoveParticipant(playerId);
        if (HostId == playerId && _members.Count > 0) HostId = _members.Keys.First();
        return RoomResult.Success(Summary());
    }

    public Guid[] RemoveExpired(DateTimeOffset now)
    {
        var expired = _members.Where(entry => entry.Value.ExpiresAt <= now)
            .Select(entry => entry.Key).ToArray();
        foreach (var playerId in expired) Leave(playerId);
        return expired;
    }

    private sealed class Member(string username)
    {
        public string Username { get; } = username;
        public DateTimeOffset? ExpiresAt { get; set; }
    }
}
