import { RealtimeClient } from '../../services/realtime/RealtimeClient';
import { ClientWorldState } from './ClientWorldState';
import type { RadarResult, ShotTrace, ImpactEvent, WeaponKind } from './BinaryGameCodec';
import { Prediction } from './Prediction';
import { Interpolation } from './Interpolation';
import type { MovementInput } from './Movement';

export class GameNetworkAdapter {
  readonly world = new ClientWorldState();
  readonly prediction = new Prediction();
  readonly interpolation = new Interpolation();
  private readonly client: RealtimeClient;
  private sequence = 0;
  private clientTick = 0;
  onShot: (shot: ShotTrace) => void = () => {};
  onImpact: (impact: ImpactEvent) => void = () => {};

  constructor(
    readonly playerId: string,
    accessToken: string,
    onStatus: (status: string) => void,
  ) {
    this.client = new RealtimeClient(accessToken);
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
    this.client.onShot = (shot) => this.onShot(shot);
    this.client.onImpact = (impact) => this.onImpact(impact);
    this.client.onStatus = (status) => {
      if (
        status === 'Đang kết nối lại...' ||
        status === 'Mất kết nối máy chủ.' ||
        status === 'Không vào lại được trận.'
      ) {
        this.world.clear();
        this.prediction.clear();
        this.interpolation.clear();
      }
      onStatus(status);
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
    return this.client.stop();
  }

  fire(weapon: WeaponKind, range: number): void {
    this.client.fire(weapon, range);
  }

  useRadar(): Promise<RadarResult> {
    return this.client.useRadar();
  }
}
