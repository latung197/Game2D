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

export class RealtimeClient {
  private readonly connection: HubConnection;
  onSnapshot: (payload: Uint8Array | ArrayBuffer) => void = () => {};
  onRoster: (players: PlayerIdentity[]) => void = () => {};
  onPlayerJoined: (player: PlayerIdentity) => void = () => {};
  onPlayerLeft: (networkId: number) => void = () => {};
  onStatus: (status: string) => void = () => {};
  onShot: (shot: ShotTrace) => void = () => {};
  onImpact: (impact: ImpactEvent) => void = () => {};

  constructor(accessToken: string) {
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
    this.connection.onreconnecting(() => this.onStatus('Đang kết nối lại...'));
    this.connection.onreconnected(
      () => void this.join().catch(() => this.onStatus('Không vào lại được trận.')),
    );
    this.connection.onclose(() => this.onStatus('Mất kết nối máy chủ.'));
  }

  async start(): Promise<void> {
    await this.connection.start();
    await this.join();
  }

  private async join(): Promise<void> {
    const raw = await this.connection.invoke<unknown>('JoinMatch');
    const value = raw as Record<string, unknown>;
    const version = Number(
      Array.isArray(raw) ? raw[0] : (value.ProtocolVersion ?? value.protocolVersion),
    );
    const roster = Array.isArray(raw) ? raw[3] : (value.Players ?? value.players);
    if (version !== PROTOCOL_VERSION || !Array.isArray(roster))
      throw new Error('Protocol version mismatch.');
    this.onRoster(roster.map(identity));
    this.onStatus('Đã vào trận thử online.');
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
      .catch(() => this.onStatus('Không gửi được input.'));
  }

  fire(weapon: WeaponKind, range: number): void {
    if (this.connection.state !== 'Connected') return;
    void this.connection
      .send('Fire', encodeFire(weapon, range))
      .catch(() => this.onStatus('Không gửi được phát bắn.'));
  }

  async useRadar(): Promise<RadarResult> {
    const payload = await this.connection.invoke<Uint8Array | ArrayBuffer>('UseRadar');
    const result = decodeRadar(payload);
    if (!result) throw new Error('Radar protocol mismatch.');
    return result;
  }

  async stop(): Promise<void> {
    await this.connection.stop();
  }
}
