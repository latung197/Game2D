import definition from '../../../../data/map.json' with { type: 'json' };

export const MAP = definition.map;
export const BUILDINGS = definition.buildings;
export const BUSHES = definition.bushes;
export const TREES = definition.trees;
export const STREETLIGHTS = definition.streetlights;

export function inBush(x: number, y: number): boolean {
  return BUSHES.some((b) => Math.hypot(x - b.x, y - b.y) < b.r - 8);
}
