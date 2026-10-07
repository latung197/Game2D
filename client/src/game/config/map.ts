export const MAP = { width: 2400, height: 1600, tile: 80 } as const;

export const BUILDINGS = [
  { x: 120, y: 100, w: 430, h: 300, color: 0x8b85a7, label: 'TIỆM BẮP XÀO' },
  { x: 700, y: 80, w: 490, h: 350, color: 0x7695a3, label: 'XƯỞNG XE VUI' },
  { x: 1430, y: 110, w: 520, h: 310, color: 0xa492a6, label: 'KHO PHỤ TÙNG' },
  { x: 150, y: 770, w: 500, h: 350, color: 0x9e98b3, label: 'TRẠM CHỜ' },
  { x: 840, y: 820, w: 380, h: 270, color: 0x7d9aa1, label: 'TIỆM SỬA XE' },
  { x: 1540, y: 780, w: 540, h: 340, color: 0x9a87a0, label: 'NHÀ KHO' },
] as const;
