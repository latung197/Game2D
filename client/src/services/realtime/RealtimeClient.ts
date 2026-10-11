import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import {
  decodeRadar,
  decodeImpact,
  decodeShot,
  encodeFire,
  encodeInput,
  PROTOCOL_VERSION,
  type RadarResult,
  type ImpactEvent,
  type ShotTrace,
  type WeaponKind,
} from '../../game/network/BinaryGameCodec';

export type PlayerIdentity = { networkId: number; playerId: string; username: string };
export type AmmoState = {
  weapon: WeaponKind;
  loaded: number;
  reserve: number;
  reloadTicks: number;
};
export type KillEvent = {
  killerId: string | null;
  killerName: string;
  victimId: string;
  victimName: string;
  weapon: WeaponKind | null;
  killerKills: number;
  victimDeaths: number;
};
export type WorldItem = { id: number; kind: number; x: number; y: number };
export type ItemSnapshot = { matchId: string; revision: number; items: WorldItem[] };
export type PickupResult = { accepted: boolean; code: string; itemId: number; health: number };
export type ItemPicked = { itemId: number; playerId: string; kind: number; newHealth: number };
export type InventoryState = { healthKits: number; radarCells: number; ammoCrates: number };
export type UseItemResult = {
  accepted: boolean;
  code: string;
  kind: number;
  inventory: InventoryState;
  health: number;
  radar: RadarResult;
  ammo: AmmoState[];
};
export type ZoneState = {
  phaseIndex: number;
  stage: string;
  centerX: number;
  centerY: number;
  radius: number;
  targetX: number;
  targetY: number;
  targetRadius: number;
  remainingTicks: number;
  damagePerSecond: number;
  completed: boolean;
};
export type MatchPlayerResult = {
  playerId: string;
  username: string;
  placement: number;
  kills: number;
  deaths: number;
};
export type MatchResult = {
  matchId: string;
  winnerId: string | null;
  winnerName: string | null;
  endedAt: string;
  players: MatchPlayerResult[];
};
export type ConnectionStatus =
  'connected' | 'reconnecting' | 'rejoin_failed' | 'disconnected' | 'input_failed' | 'fire_failed';
export type PlayerState = PlayerIdentity & {
  x: number;
  y: number;
  rotation: number;
  aimAngle: number;
  health: number;
  status: number;
  velocityX: number;
  velocityY: number;
};

type MessagePackIdentity = {
  NetworkId?: number;
  networkId?: number;
  PlayerId?: string;
  playerId?: string;
  Username?: string;
  username?: string;
};

function identity(raw: unknown): PlayerIdentity {
  if (Array.isArray(raw)) {
    return { networkId: Number(raw[0]), playerId: String(raw[1]), username: String(raw[2]) };
  }
  const value = raw as MessagePackIdentity;
  return {
    networkId: Number(value.NetworkId ?? value.networkId),
    playerId: String(value.PlayerId ?? value.playerId),
    username: String(value.Username ?? value.username),
  };
}

function field(raw: unknown, index: number, name: string): unknown {
  if (Array.isArray(raw)) return raw[index];
  const object = raw as Record<string, unknown>;
  return object[name] ?? object[name[0].toUpperCase() + name.slice(1)];
}

function weaponKind(raw: unknown): WeaponKind {
  return typeof raw === 'string'
    ? (
        {
          Bullet: 1,
          Laser: 2,
          Rocket: 3,
          Artillery: 4,
          Mud: 5,
          Burst: 6,
          Sniper: 7,
          Grenade: 8,
          Pulse: 9,
        } as Record<string, WeaponKind>
      )[raw]
    : (Number(raw) as WeaponKind);
}

function itemKind(raw: unknown): number {
  return typeof raw === 'string'
    ? ({ HealthKit: 1, RadarCell: 2, AmmoCrate: 3 } as Record<string, number>)[raw]
    : Number(raw);
}

function inventory(raw: unknown): InventoryState {
  return {
    healthKits: Number(field(raw, 0, 'healthKits')),
    radarCells: Number(field(raw, 1, 'radarCells')),
    ammoCrates: Number(field(raw, 2, 'ammoCrates')),
  };
}

export class RealtimeClient {
  private readonly connection: HubConnection;
  onSnapshot: (payload: Uint8Array | ArrayBuffer) => void = () => {};
  onRoster: (players: PlayerIdentity[]) => void = () => {};
  onPlayerJoined: (player: PlayerIdentity) => void = () => {};
  onPlayerLeft: (networkId: number) => void = () => {};
  onStatus: (status: ConnectionStatus) => void = () => {};
  onShot: (shot: ShotTrace) => void = () => {};
  onImpact: (impact: ImpactEvent) => void = () => {};
  onAmmo: (ammo: AmmoState) => void = () => {};
  onKill: (kill: KillEvent) => void = () => {};
  onItems: (snapshot: ItemSnapshot) => void = () => {};
  onPickup: (pickup: ItemPicked) => void = () => {};
  onInventory: (state: InventoryState) => void = () => {};
  onZone: (zone: ZoneState) => void = () => {};
  onResult: (result: MatchResult) => void = () => {};

  constructor(
    accessToken: string,
    private readonly roomId?: string,
  ) {
    this.connection = new HubConnectionBuilder()
      .withUrl('/hubs/game', { accessTokenFactory: () => accessToken })
      .withHubProtocol(new MessagePackHubProtocol())
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    this.connection.on('Snapshot', (payload: Uint8Array | ArrayBuffer) => this.onSnapshot(payload));
    this.connection.on('PlayerJoined', (raw: unknown) => this.onPlayerJoined(identity(raw)));
    this.connection.on('PlayerLeft', (networkId: number) => this.onPlayerLeft(networkId));
    this.connection.on('Shot', (payload: Uint8Array | ArrayBuffer) => {
      const shot = decodeShot(payload);
      if (shot) this.onShot(shot);
    });
    this.connection.on('Impact', (payload: Uint8Array | ArrayBuffer) => {
      const impact = decodeImpact(payload);
      if (impact) this.onImpact(impact);
    });
    this.connection.on('AmmoChanged', (raw: unknown) =>
      this.onAmmo({
        weapon: weaponKind(field(raw, 0, 'weapon')),
        loaded: Number(field(raw, 1, 'loaded')),
        reserve: Number(field(raw, 2, 'reserve')),
        reloadTicks: Number(field(raw, 3, 'reloadTicks')),
      }),
    );
    this.connection.on('Kill', (raw: unknown) =>
      this.onKill({
        killerId: field(raw, 0, 'killerId') == null ? null : String(field(raw, 0, 'killerId')),
        killerName: String(field(raw, 1, 'killerName')),
        victimId: String(field(raw, 2, 'victimId')),
        victimName: String(field(raw, 3, 'victimName')),
        weapon: field(raw, 4, 'weapon') == null ? null : weaponKind(field(raw, 4, 'weapon')),
        killerKills: Number(field(raw, 5, 'killerKills')),
        victimDeaths: Number(field(raw, 6, 'victimDeaths')),
      }),
    );
    this.connection.on('WorldItems', (raw: unknown) => {
      const items = field(raw, 2, 'items');
      if (!Array.isArray(items)) return;
      this.onItems({
        matchId: String(field(raw, 0, 'matchId')),
        revision: Number(field(raw, 1, 'revision')),
        items: items.map((item) => ({
          id: Number(field(item, 0, 'id')),
          kind: itemKind(field(item, 1, 'kind')),
          x: Number(field(item, 2, 'x')),
          y: Number(field(item, 3, 'y')),
        })),
      });
    });
    this.connection.on('ItemPicked', (raw: unknown) =>
      this.onPickup({
        itemId: Number(field(raw, 0, 'itemId')),
        playerId: String(field(raw, 1, 'playerId')),
        kind: itemKind(field(raw, 2, 'kind')),
        newHealth: Number(field(raw, 3, 'newHealth')),
      }),
    );
    this.connection.on('InventoryChanged', (raw: unknown) => this.onInventory(inventory(raw)));
    this.connection.on('ZoneState', (raw: unknown) =>
      this.onZone({
        phaseIndex: Number(field(raw, 0, 'phaseIndex')),
        stage: String(field(raw, 1, 'stage')),
        centerX: Number(field(raw, 2, 'centerX')),
        centerY: Number(field(raw, 3, 'centerY')),
        radius: Number(field(raw, 4, 'radius')),
        targetX: Number(field(raw, 5, 'targetX')),
        targetY: Number(field(raw, 6, 'targetY')),
        targetRadius: Number(field(raw, 7, 'targetRadius')),
        remainingTicks: Number(field(raw, 8, 'remainingTicks')),
        damagePerSecond: Number(field(raw, 9, 'damagePerSecond')),
        completed: Boolean(field(raw, 10, 'completed')),
      }),
    );
    this.connection.on('MatchEnded', (raw: unknown) => {
      const players = field(raw, 4, 'players');
      if (!Array.isArray(players)) return;
      this.onResult({
        matchId: String(field(raw, 0, 'matchId')),
        winnerId: field(raw, 1, 'winnerId') == null ? null : String(field(raw, 1, 'winnerId')),
        winnerName:
          field(raw, 2, 'winnerName') == null ? null : String(field(raw, 2, 'winnerName')),
        endedAt: String(field(raw, 3, 'endedAt')),
        players: players.map((player) => ({
          playerId: String(field(player, 0, 'playerId')),
          username: String(field(player, 1, 'username')),
          placement: Number(field(player, 2, 'placement')),
          kills: Number(field(player, 3, 'kills')),
          deaths: Number(field(player, 4, 'deaths')),
        })),
      });
    });
    this.connection.onreconnecting(() => this.onStatus('reconnecting'));
    this.connection.onreconnected(
      () => void this.join().catch(() => this.onStatus('rejoin_failed')),
    );
    this.connection.onclose(() => this.onStatus('disconnected'));
  }

  async start(): Promise<void> {
    await this.connection.start();
    await this.join();
  }

  private async join(): Promise<void> {
    const raw = await this.connection.invoke<unknown>('JoinMatch', this.roomId ?? null);
    const value = raw as Record<string, unknown>;
    const version = Number(
      Array.isArray(raw) ? raw[0] : (value.ProtocolVersion ?? value.protocolVersion),
    );
    const roster = Array.isArray(raw) ? raw[3] : (value.Players ?? value.players);
    if (version !== PROTOCOL_VERSION || !Array.isArray(roster))
      throw new Error('Protocol version mismatch.');
    this.onRoster(roster.map(identity));
    this.onStatus('connected');
  }

  sendInput(
    sequence: number,
    clientTick: number,
    moveX: number,
    moveY: number,
    aimAngle: number,
  ): void {
    if (this.connection.state !== 'Connected') return;
    void this.connection
      .send('InputBatch', encodeInput(sequence, moveX, moveY, aimAngle, clientTick))
      .catch(() => this.onStatus('input_failed'));
  }

  fire(weapon: WeaponKind, range: number): void {
    if (this.connection.state !== 'Connected') return;
    void this.connection
      .send('Fire', encodeFire(weapon, range))
      .catch(() => this.onStatus('fire_failed'));
  }

  reload(weapon: WeaponKind): void {
    if (this.connection.state !== 'Connected') return;
    void this.connection.send('Reload', weapon).catch(() => this.onStatus('fire_failed'));
  }

  async pickup(itemId: number): Promise<PickupResult> {
    const raw = await this.connection.invoke<unknown>('Pickup', itemId);
    return {
      accepted: Boolean(field(raw, 0, 'accepted')),
      code: String(field(raw, 1, 'code')),
      itemId: Number(field(raw, 2, 'itemId')),
      health: Number(field(raw, 3, 'health')),
    };
  }

  async useRadar(): Promise<RadarResult> {
    const payload = await this.connection.invoke<Uint8Array | ArrayBuffer>('UseRadar');
    const result = decodeRadar(payload);
    if (!result) throw new Error('Radar protocol mismatch.');
    return result;
  }

  async useItem(kind: number): Promise<UseItemResult> {
    const raw = await this.connection.invoke<unknown>('UseItem', kind);
    const radar = field(raw, 5, 'radar');
    const ammo = field(raw, 6, 'ammo');
    return {
      accepted: Boolean(field(raw, 0, 'accepted')),
      code: String(field(raw, 1, 'code')),
      kind: itemKind(field(raw, 2, 'kind')),
      inventory: inventory(field(raw, 3, 'inventory')),
      health: Number(field(raw, 4, 'health')),
      radar: {
        activeTicks: Number(field(radar, 0, 'activeTicks')),
        cooldownTicks: Number(field(radar, 1, 'cooldownTicks')),
      },
      ammo: Array.isArray(ammo)
        ? ammo.map((entry) => ({
            weapon: weaponKind(field(entry, 0, 'weapon')),
            loaded: Number(field(entry, 1, 'loaded')),
            reserve: Number(field(entry, 2, 'reserve')),
            reloadTicks: Number(field(entry, 3, 'reloadTicks')),
          }))
        : [],
    };
  }

  setHeadlights(enabled: boolean): void {
    if (this.connection.state !== 'Connected') return;
    void this.connection.send('SetHeadlights', enabled).catch(() => this.onStatus('input_failed'));
  }

  async stop(): Promise<void> {
    await this.connection.stop();
  }
}
