import type Phaser from 'phaser';
import { BUILDINGS, MAP, STREETLIGHTS } from '../config/map';

function blockedPoint(x: number, y: number): boolean {
  return BUILDINGS.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

export function drawLighting(
  scene: Phaser.Scene,
  canvas: HTMLCanvasElement | null,
  player: { x: number; y: number },
  level: number,
  aimAngle: number,
  headlights: boolean,
): void {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  const width = Math.max(1, Math.floor(scene.scale.width));
  const height = Math.max(1, Math.floor(scene.scale.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.clearRect(0, 0, width, height);
  if (level < 0.02) return;
  context.fillStyle = `rgba(9, 18, 39, ${0.7 * level})`;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'destination-out';
  const camera = scene.cameras.main;
  const screen = (x: number, y: number) => ({
    x: (x - camera.worldView.x) * camera.zoom,
    y: (y - camera.worldView.y) * camera.zoom,
  });
  const glow = (x: number, y: number, radius: number, strength: number) => {
    if (x < -radius || y < -radius || x > width + radius || y > height + radius) return;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(0,0,0,${strength})`);
    gradient.addColorStop(0.45, `rgba(0,0,0,${strength * 0.65})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  for (const lamp of STREETLIGHTS) {
    const point = screen(lamp.x, lamp.y);
    glow(point.x, point.y, 210 * camera.zoom, 0.85);
  }
  const self = screen(player.x, player.y);
  glow(self.x, self.y, 150 * camera.zoom, 0.8);
  if (headlights) {
    const reach = 570 * camera.zoom;
    context.save();
    context.beginPath();
    context.moveTo(self.x, self.y);
    for (let ray = 0; ray <= 28; ray++) {
      const angle = aimAngle - 0.34 + (ray / 28) * 0.68;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let distance = 0;
      for (let step = 16; step <= 570; step += 16) {
        const x = player.x + cos * step;
        const y = player.y + sin * step;
        if (x < 0 || y < 0 || x > MAP.width || y > MAP.height || blockedPoint(x, y)) break;
        distance = step;
      }
      context.lineTo(self.x + cos * distance * camera.zoom, self.y + sin * distance * camera.zoom);
    }
    context.closePath();
    context.clip();
    const beam = context.createRadialGradient(self.x, self.y, 20, self.x, self.y, reach);
    beam.addColorStop(0, 'rgba(0,0,0,0.95)');
    beam.addColorStop(0.55, 'rgba(0,0,0,0.7)');
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = beam;
    context.fillRect(self.x - reach, self.y - reach, reach * 2, reach * 2);
    context.restore();
  }
  context.globalCompositeOperation = 'source-over';
}
