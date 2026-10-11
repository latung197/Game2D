import {
  RealtimeClient,
  type AmmoState,
  type KillEvent,
  type ItemPicked,
  type PickupResult,
  type InventoryState,
  type UseItemResult,
  type ZoneState,
  type MatchResult,
  type ConnectionStatus,
} from '../../services/realtime/RealtimeClient';
import { ClientWorldState } from './ClientWorldState';
import type { RadarResult, ShotTrace, ImpactEvent, WeaponKind } from './BinaryGameCodec';
import { Prediction } from './Prediction';
import { Interpolation } from './Interpolation';
import type { MovementInput } from './Movement';
import { GameEventBus } from '../events/GameEventBus';

type GameNetworkEvents = {
  shot: ShotTrace;
  impact: ImpactEvent;
  status: ConnectionStatus;
  ammo: AmmoState;
  kill: KillEvent;
  pickup: ItemPicked;
  pickupResult: PickupResult;
  inventory: InventoryState;
  zone: ZoneState;
  result: MatchResult;
};

export class GameNetworkAdapter {
  readonly world = new ClientWorldState();
  readonly prediction = new Prediction();
  readonly interpolation = new Interpolation();
  readonly events = new GameEventBus<GameNetworkEvents>();
  readonly ammo = new Map<WeaponKind, AmmoState>();
  inventory: InventoryState = { healthKits: 0, radarCells: 0, ammoCrates: 0 };
  private readonly client: RealtimeClient;
  private sequence = 0;
  private clientTick = 0;

  constructor(
    readonly playerId: string,
    accessToken: string,
    roomId?: string,
  ) {
    this.client = new RealtimeClient(accessToken, roomId);
    this.client.onSnapshot = (snapshot) => {
      const previousTick = this.world.serverTick;
      this.world.apply(snapshot);
      if (this.world.serverTick === previousTick) return;
      const now = performance.now();
      const self = this.world.get(this.playerId);
      if (self) this.prediction.reconcile(self, this.world.lastProcessedSequence, now);
      this.interpolation.push(
        this.world.serverTick,
        [...this.world.all()].filter((player) => player.playerId !== this.playerId),
        now,
      );
    };
    this.client.onRoster = (players) => {
      this.world.setRoster(players);
      this.prediction.clear();
      this.interpolation.clear();
    };
    this.client.onPlayerJoined = (player) => this.world.playerJoined(player);
    this.client.onPlayerLeft = (networkId) => this.world.playerLeft(networkId);
    this.client.onShot = (shot) => this.events.emit('shot', shot);
    this.client.onImpact = (impact) => this.events.emit('impact', impact);
    this.client.onAmmo = (ammo) => {
      this.ammo.set(ammo.weapon, ammo);
      this.events.emit('ammo', ammo);
    };
    this.client.onKill = (kill) => this.events.emit('kill', kill);
    this.client.onItems = (snapshot) => this.world.setItems(snapshot);
    this.client.onPickup = (pickup) => this.events.emit('pickup', pickup);
    this.client.onInventory = (inventory) => {
      this.inventory = inventory;
      this.events.emit('inventory', inventory);
    };
    this.client.onZone = (zone) => {
      this.world.zone = zone;
      this.events.emit('zone', zone);
    };
    this.client.onResult = (result) => this.events.emit('result', result);
    this.client.onStatus = (status) => {
      if (status === 'reconnecting' || status === 'disconnected' || status === 'rejoin_failed') {
        this.world.clear();
        this.prediction.clear();
        this.interpolation.clear();
        this.ammo.clear();
        this.inventory = { healthKits: 0, radarCells: 0, ammoCrates: 0 };
      }
      this.events.emit('status', status);
    };
  }

  start(): Promise<void> {
    return this.client.start();
  }

  stepLocal(input: MovementInput): void {
    if (!this.world.get(this.playerId)) return;
    this.sequence = (this.sequence + 1) >>> 0;
    this.clientTick = (this.clientTick + 1) >>> 0;
    const quantized = this.prediction.predict(
      this.sequence,
      this.clientTick,
      input,
      performance.now(),
    );
    this.client.sendInput(
      this.sequence,
      this.clientTick,
      quantized.moveX,
      quantized.moveY,
      quantized.aimAngle,
    );
  }

  stop(): Promise<void> {
    return this.client.stop().finally(() => this.events.clear());
  }

  fire(weapon: WeaponKind, range: number): void {
    const ammo = this.ammo.get(weapon);
    if (ammo && (ammo.reloadTicks > 0 || ammo.loaded === 0)) {
      if (ammo.loaded === 0 && ammo.reloadTicks === 0) this.client.reload(weapon);
      return;
    }
    this.client.fire(weapon, range);
  }

  reload(weapon: WeaponKind): void {
    this.client.reload(weapon);
  }

  async pickup(itemId: number): Promise<PickupResult> {
    const result = await this.client.pickup(itemId).catch(() => ({
      accepted: false,
      code: 'disconnected',
      itemId,
      health: 0,
    }));
    this.events.emit('pickupResult', result);
    return result;
  }

  useRadar(): Promise<RadarResult> {
    return this.client.useRadar();
  }

  async useItem(kind: number): Promise<UseItemResult> {
    const result = await this.client.useItem(kind);
    this.inventory = result.inventory;
    this.events.emit('inventory', result.inventory);
    for (const ammo of result.ammo) {
      this.ammo.set(ammo.weapon, ammo);
      this.events.emit('ammo', ammo);
    }
    return result;
  }

  setHeadlights(enabled: boolean): void {
    this.client.setHeadlights(enabled);
  }
}
