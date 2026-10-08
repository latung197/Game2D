export const PROTOCOL_VERSION = 4;
const INPUT_KIND = 1;
const SNAPSHOT_KIND = 2;
export const INPUT_BYTES = 10;
export const SNAPSHOT_HEADER_BYTES = 11;
export const PLAYER_BYTES = 10;
export const PROJECTILE_BYTES = 8;
export const HAZARD_BYTES = 7;
export const WeaponKind = { Bullet: 1, Laser: 2, Rocket: 3, Artillery: 4, Mud: 5 } as const;
export type WeaponKind = (typeof WeaponKind)[keyof typeof WeaponKind];
const TWO_PI = Math.PI * 2;

export type CompactPlayerState = {
  networkId: number;
  x: number;
  y: number;
  rotation: number;
  aimAngle: number;
  health: number;
  status: number;
};

export type ProjectileState = {
  id: number;
  x: number;
  y: number;
  weapon: WeaponKind;
  progress: number;
};
export type HazardState = { id: number; x: number; y: number; remaining: number };
export type CompactSnapshot = {
  serverTick: number;
  players: CompactPlayerState[];
  projectiles: ProjectileState[];
  hazards: HazardState[];
};
export type ImpactEvent = {
  id: number;
  x: number;
  y: number;
  weapon: WeaponKind;
  hitNetworkId: number;
  targetHealth: number;
};
export type ShotTrace = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  shooterNetworkId: number;
  hitNetworkId: number;
  targetHealth: number;
};
export type RadarResult = { activeTicks: number; cooldownTicks: number };

export function encodeFire(weapon: WeaponKind, range: number): Uint8Array {
  const bytes = new Uint8Array(5);
  bytes[0] = PROTOCOL_VERSION;
  bytes[1] = 5;
  bytes[2] = weapon;
  new DataView(bytes.buffer).setUint16(3, Math.round(Math.max(0, Math.min(65535, range))), true);
  return bytes;
}

export function decodeImpact(payload: Uint8Array | ArrayBuffer): ImpactEvent | null {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  if (
    bytes.byteLength !== 12 ||
    bytes[0] !== PROTOCOL_VERSION ||
    bytes[1] !== 6 ||
    bytes[8] < 1 ||
    bytes[8] > 5 ||
    bytes[11] > 100
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    id: view.getUint16(2, true),
    x: view.getUint16(4, true) / 16,
    y: view.getUint16(6, true) / 16,
    weapon: bytes[8] as WeaponKind,
    hitNetworkId: view.getUint16(9, true),
    targetHealth: bytes[11],
  };
}

export function decodeRadar(payload: Uint8Array | ArrayBuffer): RadarResult | null {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  if (bytes.byteLength !== 6 || bytes[0] !== PROTOCOL_VERSION || bytes[1] !== 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { activeTicks: view.getUint16(2, true), cooldownTicks: view.getUint16(4, true) };
}

export function decodeShot(payload: Uint8Array | ArrayBuffer): ShotTrace | null {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  if (bytes.byteLength !== 15 || bytes[0] !== PROTOCOL_VERSION || bytes[1] !== 3) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    startX: view.getUint16(2, true) / 16,
    startY: view.getUint16(4, true) / 16,
    endX: view.getUint16(6, true) / 16,
    endY: view.getUint16(8, true) / 16,
    shooterNetworkId: view.getUint16(10, true),
    hitNetworkId: view.getUint16(12, true),
    targetHealth: view.getUint8(14),
  };
}

export function encodeInput(
  sequence: number,
  moveX: number,
  moveY: number,
  aimAngle: number,
): Uint8Array {
  const bytes = new Uint8Array(INPUT_BYTES);
  const view = new DataView(bytes.buffer);
  bytes[0] = PROTOCOL_VERSION;
  bytes[1] = INPUT_KIND;
  view.setUint32(2, sequence >>> 0, true);
  view.setInt8(6, Math.round(Math.max(-1, Math.min(1, moveX)) * 127));
  view.setInt8(7, Math.round(Math.max(-1, Math.min(1, moveY)) * 127));
  bytes[8] = Math.round(((((aimAngle % TWO_PI) + TWO_PI) % TWO_PI) * 256) / TWO_PI) & 255;
  return bytes;
}

export function decodeSnapshot(payload: Uint8Array | ArrayBuffer): CompactSnapshot | null {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  if (bytes.byteLength < SNAPSHOT_HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint8(6);
  const projectileCount = view.getUint16(7, true);
  const hazardCount = view.getUint16(9, true);
  if (
    view.getUint8(0) !== PROTOCOL_VERSION ||
    view.getUint8(1) !== SNAPSHOT_KIND ||
    bytes.byteLength !==
      SNAPSHOT_HEADER_BYTES +
        count * PLAYER_BYTES +
        projectileCount * PROJECTILE_BYTES +
        hazardCount * HAZARD_BYTES
  )
    return null;
  const players: CompactPlayerState[] = [];
  for (let i = 0; i < count; i++) {
    const offset = SNAPSHOT_HEADER_BYTES + i * PLAYER_BYTES;
    if (view.getUint8(offset + 8) > 100 || view.getUint8(offset + 9) > 1) return null;
    players.push({
      networkId: view.getUint16(offset, true),
      x: view.getUint16(offset + 2, true) / 16,
      y: view.getUint16(offset + 4, true) / 16,
      rotation: (view.getUint8(offset + 6) * TWO_PI) / 256,
      aimAngle: (view.getUint8(offset + 7) * TWO_PI) / 256,
      health: view.getUint8(offset + 8),
      status: view.getUint8(offset + 9),
    });
  }
  const projectiles: ProjectileState[] = [];
  const projectileStart = SNAPSHOT_HEADER_BYTES + count * PLAYER_BYTES;
  for (let i = 0; i < projectileCount; i++) {
    const offset = projectileStart + i * PROJECTILE_BYTES;
    const weapon = view.getUint8(offset + 6);
    if (weapon < 1 || weapon > 5) return null;
    projectiles.push({
      id: view.getUint16(offset, true),
      x: view.getUint16(offset + 2, true) / 16,
      y: view.getUint16(offset + 4, true) / 16,
      weapon: weapon as WeaponKind,
      progress: view.getUint8(offset + 7),
    });
  }
  const hazards: HazardState[] = [];
  const hazardStart = projectileStart + projectileCount * PROJECTILE_BYTES;
  for (let i = 0; i < hazardCount; i++) {
    const offset = hazardStart + i * HAZARD_BYTES;
    hazards.push({
      id: view.getUint16(offset, true),
      x: view.getUint16(offset + 2, true) / 16,
      y: view.getUint16(offset + 4, true) / 16,
      remaining: view.getUint8(offset + 6),
    });
  }
  return { serverTick: view.getUint32(2, true), players, projectiles, hazards };
}
