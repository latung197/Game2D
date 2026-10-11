import definitions from '../../../../data/weapons.json' with { type: 'json' };
import type { WeaponKind } from '../network/BinaryGameCodec';

export const WEAPONS = definitions.map((definition) => ({
  ...definition,
  kind: definition.kind as WeaponKind,
}));

const byKind = new Map(WEAPONS.map((weapon) => [weapon.kind, weapon]));

export function weaponFor(kind: WeaponKind): (typeof WEAPONS)[number] {
  const weapon = byKind.get(kind);
  if (!weapon) throw new Error(`Unknown weapon ${kind}`);
  return weapon;
}
