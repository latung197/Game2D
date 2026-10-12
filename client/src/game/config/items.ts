import definitions from '../../../../data/items.json' with { type: 'json' };

const display = {
  HealthKit: {
    id: 1,
    name: 'Túi cứu thương',
    short: 'CỨU THƯƠNG',
    icon: '✚',
    key: 'Q',
    count: 'healthKits',
    description: 'Hồi máu cho xe khi chưa đầy 100 HP.',
    tone: 'health',
  },
  RadarCell: {
    id: 2,
    name: 'Pin radar',
    short: 'PIN RADAR',
    icon: '◎',
    key: 'T',
    count: 'radarCells',
    description: 'Hiện vị trí xe khác trên bản đồ trong 6 giây; radar hồi sau 30 giây.',
    tone: 'radar',
  },
  AmmoCrate: {
    id: 3,
    name: 'Hộp đạn',
    short: 'HỘP ĐẠN',
    icon: '▣',
    key: 'G',
    count: 'ammoCrates',
    description: 'Thêm tối đa một băng vào đạn dự trữ của từng loại súng.',
    tone: 'ammo',
  },
} as const;

export const ITEMS = definitions.map((definition) => ({
  ...definition,
  ...display[definition.kind as keyof typeof display],
}));

export function itemFor(kind: number): (typeof ITEMS)[number] | undefined {
  return ITEMS.find((item) => item.id === kind);
}
