import Phaser from 'phaser';
import type { WorldItem } from '../../services/realtime/RealtimeClient';

export class WorldItemRenderer {
  private readonly nodes = new Map<number, Phaser.GameObjects.Container>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onPickup: (id: number) => void,
  ) {}

  sync(items: WorldItem[]): void {
    const visible = new Set(items.map((item) => item.id));
    for (const [id, node] of this.nodes) {
      if (visible.has(id)) continue;
      node.destroy();
      this.nodes.delete(id);
    }
    for (const item of items) {
      if (this.nodes.has(item.id)) continue;
      const icon = item.kind === 1 ? '+' : item.kind === 2 ? '◉' : '▣';
      const title = item.kind === 1 ? 'CỨU THƯƠNG' : item.kind === 2 ? 'PIN RADAR' : 'HỘP ĐẠN';
      const tint = item.kind === 1 ? 0x70dfbc : item.kind === 2 ? 0x77d7f1 : 0xf5c879;
      const halo = this.scene.add.circle(0, 0, 29, tint, 0.16).setStrokeStyle(2, tint, 0.55);
      const caseBody = this.scene.add.rectangle(0, 0, 35, 29, 0xf7e8be).setStrokeStyle(3, 0x315e58);
      const cross = this.scene.add
        .text(0, -2, icon, {
          fontFamily: 'Arial',
          fontSize: '28px',
          fontStyle: 'bold',
          color: item.kind === 1 ? '#3a987d' : item.kind === 2 ? '#247e9a' : '#9c6530',
        })
        .setOrigin(0.5);
      const label = this.scene.add
        .text(0, 34, title, {
          fontFamily: 'Arial',
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#e8ffe9',
          backgroundColor: '#24443ddd',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5);
      const node = this.scene.add
        .container(item.x, item.y, [halo, caseBody, cross, label])
        .setDepth(14)
        .setSize(58, 66)
        .setInteractive({ useHandCursor: true });
      node.on('pointerdown', () => this.onPickup(item.id));
      this.nodes.set(item.id, node);
    }
  }

  update(time: number): void {
    for (const [id, node] of this.nodes) node.setScale(1 + Math.sin(time / 320 + id) * 0.045);
  }

  destroy(): void {
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
  }
}
