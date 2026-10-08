export const MAP = { width: 3200, height: 2200, tile: 80 } as const;

export const BUILDINGS = [
  { x: 120, y: 100, w: 430, h: 300, color: 0x8b85a7, label: 'TIỆM BẮP XÀO' },
  { x: 700, y: 80, w: 490, h: 350, color: 0x7695a3, label: 'XƯỞNG XE VUI' },
  { x: 1430, y: 110, w: 520, h: 310, color: 0xa492a6, label: 'KHO PHỤ TÙNG' },
  { x: 150, y: 770, w: 500, h: 350, color: 0x9e98b3, label: 'TRẠM CHỜ' },
  { x: 840, y: 820, w: 380, h: 270, color: 0x7d9aa1, label: 'TIỆM SỬA XE' },
  { x: 1540, y: 780, w: 540, h: 340, color: 0x9a87a0, label: 'NHÀ KHO' },
  { x: 2410, y: 170, w: 450, h: 330, color: 0x8495a4, label: 'BÃI TÀU' },
  { x: 2490, y: 1110, w: 490, h: 370, color: 0xa08ba1, label: 'XƯỞNG SẮT' },
  { x: 420, y: 1570, w: 530, h: 340, color: 0x8a9e9c, label: 'KHO HÀNG' },
  { x: 1290, y: 1540, w: 460, h: 360, color: 0x9b8da6, label: 'GA CŨ' },
] as const;

export const BUSHES = [
  { x: 590, y: 420, r: 50 },
  { x: 1260, y: 430, r: 54 },
  { x: 2170, y: 490, r: 55 },
  { x: 750, y: 1250, r: 58 },
  { x: 1440, y: 1290, r: 55 },
  { x: 2030, y: 1260, r: 60 },
  { x: 2740, y: 740, r: 64 },
  { x: 2220, y: 1710, r: 62 },
  { x: 1040, y: 2000, r: 56 },
  { x: 3020, y: 1900, r: 55 },
] as const;

export function inBush(x: number, y: number): boolean {
  return BUSHES.some((b) => Math.hypot(x - b.x, y - b.y) < b.r - 8);
}
