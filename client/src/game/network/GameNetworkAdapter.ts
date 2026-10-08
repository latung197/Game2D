import { RealtimeClient } from '../../services/realtime/RealtimeClient';
import { ClientWorldState } from './ClientWorldState';
import type { RadarResult, ShotTrace, ImpactEvent, WeaponKind } from './BinaryGameCodec';

export class GameNetworkAdapter {
  readonly world = new ClientWorldState();
  private readonly client: RealtimeClient;
  private sequence = 0;
  private lastSent = 0;
  onShot: (shot: ShotTrace) => void = () => {};
  onImpact: (impact: ImpactEvent) => void = () => {};

  constructor(
    readonly playerId: string,
    accessToken: string,
    onStatus: (status: string) => void,
  ) {
    this.client = new RealtimeClient(accessToken);
    this.client.onSnapshot = (snapshot) => this.world.apply(snapshot);
    this.client.onRoster = (players) => this.world.setRoster(players);
    this.client.onPlayerJoined = (player) => this.world.playerJoined(player);
    this.client.onPlayerLeft = (networkId) => this.world.playerLeft(networkId);
    this.client.onShot = (shot) => this.onShot(shot);
    this.client.onImpact = (impact) => this.onImpact(impact);
    this.client.onStatus = (status) => {
      if (status !== 'Đã vào trận thử online.') this.world.clear();
      onStatus(status);
    };
  }

  start(): Promise<void> {
    return this.client.start();
  }

  sendInput(time: number, moveX: number, moveY: number, aimAngle: number): void {
    if (time - this.lastSent < 50) return;
    this.lastSent = time;
    this.sequence = (this.sequence + 1) >>> 0;
    this.client.sendInput(this.sequence, moveX, moveY, aimAngle);
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
