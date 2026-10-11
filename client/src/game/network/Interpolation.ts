import type { PlayerState } from '../../services/realtime/RealtimeClient';

type Frame = { tick: number; player: PlayerState };

export class Interpolation {
  private frames = new Map<string, Frame[]>();
  private newestTick = 0;
  private presentationTick = 0;
  private sampledAt = 0;

  push(tick: number, players: PlayerState[], receivedAt: number): void {
    if (tick <= this.newestTick) return;
    if (!this.newestTick) {
      this.presentationTick = tick - 3;
      this.sampledAt = receivedAt;
    } else if (this.presentationTick < tick - 24) {
      // A suspended tab cannot replay a long, stale history in real time.
      this.presentationTick = tick - 3;
      this.sampledAt = receivedAt;
    }
    this.newestTick = tick;
    const visible = new Set(players.map((player) => player.playerId));
    for (const id of this.frames.keys()) if (!visible.has(id)) this.frames.delete(id);
    for (const player of players) {
      const history = this.frames.get(player.playerId) ?? [];
      history.push({ tick, player });
      if (history.length > 8) history.shift();
      this.frames.set(player.playerId, history);
    }
  }

  sample(playerId: string, now: number): PlayerState | null {
    const history = this.frames.get(playerId);
    if (!history?.length) return null;
    // The render clock must never move backward when a delayed snapshot arrives.
    const elapsed = Math.max(0, Math.min(250, now - this.sampledAt));
    this.presentationTick = Math.min(
      this.newestTick,
      this.presentationTick + elapsed / (1000 / 30),
    );
    this.sampledAt = now;
    const targetTick = this.presentationTick;
    if (targetTick <= history[0].tick) return history[0].player;
    for (let i = 1; i < history.length; i++) {
      const older = history[i - 1];
      const newer = history[i];
      if (targetTick > newer.tick) continue;
      if (
        Math.hypot(newer.player.x - older.player.x, newer.player.y - older.player.y) > 100 ||
        newer.player.health === 0 ||
        older.player.health === 0
      )
        return newer.player;
      const fraction = (targetTick - older.tick) / (newer.tick - older.tick);
      const difference = Math.atan2(
        Math.sin(newer.player.rotation - older.player.rotation),
        Math.cos(newer.player.rotation - older.player.rotation),
      );
      return {
        ...newer.player,
        x: older.player.x + (newer.player.x - older.player.x) * fraction,
        y: older.player.y + (newer.player.y - older.player.y) * fraction,
        rotation: older.player.rotation + difference * fraction,
      };
    }
    return history.at(-1)!.player;
  }

  clear(): void {
    this.frames.clear();
    this.newestTick = 0;
    this.presentationTick = 0;
    this.sampledAt = 0;
  }
}
