using Game.Shared.Contracts;

namespace Game.Server.Matches;

internal sealed class MatchLifecycle(string matchId)
{
    private readonly Dictionary<Guid, Participant> _participants = [];
    public MatchResult? Result { get; private set; }

    public void Join(Guid id, string username, byte health)
    {
        if (!_participants.TryGetValue(id, out var participant))
            _participants[id] = new Participant(id, username) { Health = health };
        else participant.Health = health;
    }

    public void Health(Guid id, byte health)
    {
        if (_participants.TryGetValue(id, out var participant)) participant.Health = health;
    }

    public void Kill(Guid victimId, Guid? killerId)
    {
        if (!_participants.TryGetValue(victimId, out var victim) || victim.Placement != 0) return;
        victim.Placement = _participants.Values.Count(player => player.Placement == 0);
        victim.Health = 0;
        victim.Deaths++;
        if (killerId is { } id && id != victimId && _participants.TryGetValue(id, out var killer))
            killer.Kills++;
    }

    public void Leave(Guid id)
    {
        if (!_participants.TryGetValue(id, out var player) || player.Placement != 0) return;
        player.Placement = _participants.Values.Count(value => value.Placement == 0);
        player.Health = 0;
    }

    public MatchResult? TryFinish(bool zoneCompleted)
    {
        if (Result is not null || _participants.Count < 2) return Result;
        var alive = _participants.Values.Where(player => player.Placement == 0).ToArray();
        if (alive.Length > 1 && !zoneCompleted) return null;
        var winner = alive.OrderByDescending(player => player.Health)
            .ThenByDescending(player => player.Kills).ThenBy(player => player.Id).FirstOrDefault();
        return Complete(winner);
    }

    public MatchResult FinishManually() => Result ?? Complete(null);

    private MatchResult Complete(Participant? winner)
    {
        var remaining = _participants.Values.Where(player => player.Placement == 0)
            .OrderByDescending(player => player == winner).ThenByDescending(player => player.Health)
            .ThenByDescending(player => player.Kills).ThenBy(player => player.Id).ToArray();
        for (var index = 0; index < remaining.Length; index++) remaining[index].Placement = index + 1;
        Result = new MatchResult(matchId, winner?.Id, winner?.Username, DateTimeOffset.UtcNow,
            _participants.Values.OrderBy(player => player.Placement)
                .Select(player => new MatchPlayerResult(player.Id, player.Username,
                    player.Placement, player.Kills, player.Deaths)).ToArray());
        return Result;
    }

    private sealed class Participant(Guid id, string username)
    {
        public Guid Id { get; } = id;
        public string Username { get; } = username;
        public byte Health;
        public int Placement;
        public int Kills;
        public int Deaths;
    }
}
