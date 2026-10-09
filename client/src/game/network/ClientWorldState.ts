import type { PlayerIdentity, PlayerState } from '../../services/realtime/RealtimeClient';
import { decodeSnapshot, type ProjectileState, type HazardState } from './BinaryGameCodec';

export class ClientWorldState {
  private players = new Map<string, PlayerState>();
  private identities = new Map<number, PlayerIdentity>();
  serverTick = 0;
  lastProcessedSequence = 0;
  projectiles: ProjectileState[] = [];
  hazards: HazardState[] = [];

  setRoster(players: PlayerIdentity[]): void {
    this.identities = new Map(players.map((player) => [player.networkId, player]));
    this.players.clear();
    this.serverTick = 0;
    this.lastProcessedSequence = 0;
    this.projectiles = [];
    this.hazards = [];
  }

  playerJoined(player: PlayerIdentity): void {
    this.identities.set(player.networkId, player);
  }

  playerLeft(networkId: number): void {
    const identity = this.identities.get(networkId);
    if (identity) this.players.delete(identity.playerId);
    this.identities.delete(networkId);
  }

  apply(payload: Uint8Array | ArrayBuffer): void {
    const snapshot = decodeSnapshot(payload);
    if (!snapshot || snapshot.serverTick <= this.serverTick) return;
    this.serverTick = snapshot.serverTick;
    this.lastProcessedSequence = snapshot.lastProcessedSequence;
    this.projectiles = snapshot.projectiles;
    this.hazards = snapshot.hazards;
    const next = new Map<string, PlayerState>();
    for (const player of snapshot.players) {
      const identity = this.identities.get(player.networkId);
      if (identity) next.set(identity.playerId, { ...identity, ...player });
    }
    this.players = next;
  }

  get(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  all(): Iterable<PlayerState> {
    return this.players.values();
  }

  clear(): void {
    this.players.clear();
    this.identities.clear();
    this.serverTick = 0;
    this.lastProcessedSequence = 0;
    this.projectiles = [];
    this.hazards = [];
  }
}
