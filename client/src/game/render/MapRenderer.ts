import Phaser from 'phaser';
import { BUILDINGS, BUSHES, MAP, STREETLIGHTS, TREES } from '../config/map';

export function drawMap(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0x667d69).fillRect(0, 0, MAP.width, MAP.height);
  for (let x = 0; x < MAP.width; x += MAP.tile) {
    for (let y = 0; y < MAP.height; y += MAP.tile) {
      const seed = ((x * 31 + y * 17) >>> 0) % 7;
      g.fillStyle(seed < 3 ? 0x82916e : 0x587569, 0.18).fillRect(x, y, MAP.tile - 2, MAP.tile - 2);
      if (seed < 5) {
        const gx = x + 17 + ((seed * 11) % 38);
        const gy = y + 20 + ((seed * 13) % 38);
        g.lineStyle(2, seed % 2 ? 0x344f43 : 0xa0a777, 0.65)
          .lineBetween(gx, gy + 6, gx - 4, gy - 4)
          .lineBetween(gx, gy + 6, gx + 5, gy - 7)
          .lineBetween(gx, gy + 6, gx, gy - 8);
        if (seed === 2) g.fillStyle(0xf4c387).fillCircle(gx + 5, gy - 6, 3);
      }
    }
  }
  g.fillStyle(0x32434a)
    .fillRect(0, 535, MAP.width, 180)
    .fillRect(0, 1370, MAP.width, 125)
    .fillRect(0, 2740, MAP.width, 140)
    .fillRect(710, 0, 165, MAP.height)
    .fillRect(2110, 0, 160, MAP.height)
    .fillRect(3190, 0, 145, MAP.height);
  g.fillStyle(0xc9b9a7)
    .fillRect(0, 470, MAP.width, 55)
    .fillRect(0, 720, MAP.width, 55)
    .fillRect(0, 1510, MAP.width, 55)
    .fillRect(0, 2170, MAP.width, 55)
    .fillRect(0, 2890, MAP.width, 55)
    .fillRect(650, 0, 65, MAP.height)
    .fillRect(1330, 0, 65, MAP.height)
    .fillRect(2190, 0, 65, MAP.height)
    .fillRect(3325, 0, 65, MAP.height);
  g.lineStyle(5, 0xf7db9c, 0.8);
  for (let x = 20; x < MAP.width; x += 105) g.lineBetween(x, 620, x + 55, 620);
  for (let y = 20; y < MAP.height; y += 105) g.lineBetween(1020, y, 1020, y + 55);
  for (let x = 20; x < MAP.width; x += 105) g.lineBetween(x, 1420, x + 55, 1420);
  for (let x = 20; x < MAP.width; x += 105) g.lineBetween(x, 2810, x + 55, 2810);
  for (let y = 20; y < MAP.height; y += 105) g.lineBetween(2200, y, 2200, y + 55);
  // Crosswalks, curb seams and drainage grates make the roads read at camera scale.
  for (const crossing of [850, 1350, 2180]) {
    for (let i = 0; i < 7; i++)
      g.fillStyle(0xe9dec2, 0.72).fillRect(crossing + i * 20, 555, 12, 75);
  }
  for (let x = 120; x < MAP.width; x += 360) {
    g.fillStyle(0x1d3036).fillRoundedRect(x, 737, 64, 11, 3);
    g.lineStyle(2, 0x82908b).lineBetween(x + 9, 742, x + 55, 742);
  }
  for (const b of BUILDINGS) {
    g.fillStyle(0x18232e, 0.5).fillRoundedRect(b.x + 12, b.y + 15, b.w, b.h, 18);
    g.fillStyle(0x202c38).fillRoundedRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10, 18);
    g.fillStyle(b.color).fillRoundedRect(b.x, b.y, b.w, b.h, 15);
    g.fillStyle(0xd8c6b5).fillRoundedRect(b.x + 24, b.y + 30, b.w - 48, 24, 6);
    g.fillStyle(0x394658).fillRect(b.x + 34, b.y + 87, b.w - 68, b.h - 127);
    g.fillStyle(0xc6c0bb).fillRect(b.x + 40, b.y + 94, b.w - 80, b.h - 140);
    g.fillStyle(0x6a7880, 0.25).fillRect(b.x + 50, b.y + 104, b.w - 100, b.h - 160);
    for (let wx = b.x + 75; wx < b.x + b.w - 55; wx += 90) {
      g.fillStyle(0x2b4450).fillRoundedRect(wx, b.y + 112, 54, 42, 5);
      g.fillStyle(0xb7d5d1, 0.85).fillRoundedRect(wx + 5, b.y + 117, 44, 32, 3);
      g.lineStyle(3, 0x334958).lineBetween(wx + 27, b.y + 117, wx + 27, b.y + 149);
      g.fillStyle(0xe7d7b3, 0.5).fillRect(wx + 8, b.y + 119, 8, 28);
    }
    g.fillStyle(0x44535a).fillRoundedRect(b.x + b.w / 2 - 34, b.y + b.h - 105, 68, 65, 5);
    g.fillStyle(0xa9c3be).fillRoundedRect(b.x + b.w / 2 - 28, b.y + b.h - 100, 56, 50, 3);
    g.lineStyle(3, 0x40505a).lineBetween(
      b.x + b.w / 2,
      b.y + b.h - 100,
      b.x + b.w / 2,
      b.y + b.h - 50,
    );
    for (let awning = 0; awning < 5; awning++)
      g.fillStyle(awning % 2 ? 0xf3ddad : 0xd98f80).fillRect(
        b.x + b.w / 2 - 55 + awning * 22,
        b.y + b.h - 130,
        22,
        16,
      );
    g.fillStyle(0x48534c).fillRoundedRect(b.x + 55, b.y + b.h - 88, 34, 36, 4);
    g.fillStyle(0x79a178).fillCircle(b.x + 72, b.y + b.h - 92, 21);
    g.fillStyle(0x48534c).fillRoundedRect(b.x + b.w - 90, b.y + b.h - 88, 34, 36, 4);
    g.fillStyle(0x79a178).fillCircle(b.x + b.w - 73, b.y + b.h - 92, 21);
    g.lineStyle(3, 0x4c5260, 0.55).lineBetween(
      b.x + 35,
      b.y + b.h - 70,
      b.x + b.w - 35,
      b.y + b.h - 70,
    );
    scene.add
      .text(b.x + b.w / 2, b.y + 44, b.label, {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#513d55',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }
  for (const { x, y, r } of BUSHES) {
    g.fillStyle(0x1a2630, 0.35).fillEllipse(x + 7, y + 12, r * 2, r * 1.5);
    g.fillStyle(0x335d4a).fillCircle(x, y, r);
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      const bx = x + Math.cos(angle) * r * 0.46;
      const by = y + Math.sin(angle) * r * 0.43;
      g.fillStyle(i % 2 ? 0x729a65 : 0x4c8060).fillCircle(bx, by, r * 0.43);
      g.lineStyle(2, 0xa5b778, 0.5).lineBetween(
        bx,
        by,
        bx + Math.cos(angle) * r * 0.25,
        by + Math.sin(angle) * r * 0.25,
      );
    }
    g.fillStyle(0xd7a7a4)
      .fillCircle(x + 10, y - 18, 5)
      .fillCircle(x - 20, y + 8, 5);
  }
  for (const { x, y } of TREES) {
    g.fillStyle(0x1f3430, 0.34).fillEllipse(x + 12, y + 20, 100, 50);
    g.fillStyle(0x594b3e).fillRoundedRect(x - 8, y - 3, 16, 44, 4);
    g.fillStyle(0x315f50).fillCircle(x, y - 14, 42);
    g.fillStyle(0x4f8160)
      .fillCircle(x - 20, y - 32, 29)
      .fillCircle(x + 22, y - 30, 26);
    g.fillStyle(0x81a06b).fillCircle(x - 10, y - 48, 17);
    g.fillStyle(0xc3cf8b, 0.75)
      .fillCircle(x - 24, y - 43, 5)
      .fillCircle(x + 15, y - 48, 4);
  }
  for (const { x, y } of STREETLIGHTS) {
    g.fillStyle(0x1f3036, 0.36).fillEllipse(x + 9, y + 12, 52, 20);
    g.fillStyle(0x334550).fillCircle(x, y, 12);
    g.fillStyle(0xffdc93).fillCircle(x, y, 7);
    g.lineStyle(3, 0xf8e9b5, 0.65).strokeCircle(x, y, 14);
  }
  g.lineStyle(9, 0xe5bf88, 0.6).strokeRect(4, 4, MAP.width - 8, MAP.height - 8);
  const gl =
    scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
      ? scene.game.renderer.gl
      : null;
  const maxTexture = gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : Infinity;
  const rasterScale = [1, 0.5, 0.25].find(
    (scale) => Math.max(MAP.width, MAP.height) * scale <= maxTexture,
  );
  if (rasterScale) {
    // The static map is drawn once. Smaller textures keep older mobile GPUs on
    // the cached path instead of replaying thousands of vector commands/frame.
    g.setScale(rasterScale);
    g.generateTexture('arena-map', MAP.width * rasterScale, MAP.height * rasterScale);
    g.destroy();
    scene.add
      .image(0, 0, 'arena-map')
      .setOrigin(0)
      .setScale(1 / rasterScale)
      .setDepth(-1);
  }
}
