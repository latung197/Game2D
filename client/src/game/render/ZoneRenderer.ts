import Phaser from 'phaser';
import type { ZoneState } from '../../services/realtime/RealtimeClient';
import { MAP } from '../config/map';

export class ZoneRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(13);
  }

  draw(zone: ZoneState | null): void {
    this.graphics.clear();
    if (!zone) return;
    if (zone.radius < 2500) {
      this.graphics.fillStyle(0x641d41, 0.2);
      const rows = 200;
      const height = MAP.height / rows;
      for (let row = 0; row < rows; row++) {
        const y = row * height + height / 2;
        const dy = y - zone.centerY;
        const half = Math.sqrt(Math.max(0, zone.radius * zone.radius - dy * dy));
        const left = Math.max(0, zone.centerX - half);
        const right = Math.min(MAP.width, zone.centerX + half);
        if (Math.abs(dy) >= zone.radius)
          this.graphics.fillRect(0, row * height, MAP.width, height + 1);
        else {
          if (left > 0) this.graphics.fillRect(0, row * height, left, height + 1);
          if (right < MAP.width)
            this.graphics.fillRect(right, row * height, MAP.width - right, height + 1);
        }
      }
    }
    this.graphics.lineStyle(10, 0x66c9ef, 0.9);
    this.graphics.strokeCircle(zone.centerX, zone.centerY, zone.radius);
    if (zone.stage === 'Warning') {
      this.graphics.lineStyle(5, 0xffd37e, 0.7);
      this.graphics.strokeCircle(zone.targetX, zone.targetY, zone.targetRadius);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
