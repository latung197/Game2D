import Phaser from 'phaser';

export function createVehicle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opponent = false,
): {
  body: Phaser.GameObjects.Container;
  turret: Phaser.GameObjects.Graphics;
} {
  const shadow = scene.add.ellipse(5, 11, 67, 45, 0x0d2227, 0.48);
  const chassis = scene.add.graphics();
  const shell = opponent ? 0xb97267 : 0xe8b772;
  const highlight = opponent ? 0xf0aaa1 : 0xffd79a;
  const trim = opponent ? 0x783d44 : 0x67516a;
  chassis.fillStyle(0x1b3038).fillRoundedRect(-34, -25, 68, 50, 11);
  for (const side of [-1, 1]) {
    const top = side < 0 ? -29 : 21;
    chassis.fillStyle(0x17272f).fillRoundedRect(-25, top, 22, 8, 3);
    chassis.fillStyle(0x17272f).fillRoundedRect(8, top, 22, 8, 3);
    chassis.lineStyle(2, 0x6b7975, 0.8).lineBetween(-19, top + 4, -9, top + 4);
    chassis.lineStyle(2, 0x6b7975, 0.8).lineBetween(14, top + 4, 24, top + 4);
  }
  chassis.fillStyle(shell).fillRoundedRect(-29, -21, 58, 42, 10);
  chassis.fillStyle(highlight, 0.82).fillRoundedRect(-20, -17, 41, 34, 8);
  chassis.fillStyle(0x45606a).fillRoundedRect(-13, -15, 22, 30, 5);
  chassis.fillStyle(0x94b8b9).fillRoundedRect(-10, -12, 17, 24, 3);
  chassis.fillStyle(0xd7e6d7, 0.64).fillRect(-7, -10, 4, 20);
  chassis.fillStyle(trim).fillRect(-30, -9, 5, 18);
  chassis.fillStyle(0x273d47).fillRoundedRect(25, -18, 8, 36, 3);
  chassis.fillStyle(0xffe2a4).fillRoundedRect(28, -15, 5, 8, 2);
  chassis.fillStyle(0xffe2a4).fillRoundedRect(28, 7, 5, 8, 2);
  chassis.fillStyle(0xbd5b59).fillRoundedRect(-33, -15, 4, 9, 2);
  chassis.fillStyle(0xbd5b59).fillRoundedRect(-33, 6, 4, 9, 2);
  chassis.lineStyle(2, 0x644b55, 0.9).strokeRoundedRect(-29, -21, 58, 42, 10);
  const turret = scene.add.graphics();
  turret.fillStyle(0x263944).fillRoundedRect(-3, -6, 39, 12, 4);
  turret.fillStyle(0x91a4a5).fillRect(28, -4, 7, 8);
  turret.fillStyle(trim).fillCircle(0, 0, 12);
  turret.fillStyle(0xf5d3a0).fillCircle(0, 0, 6);
  const body = scene.add.container(x, y, [shadow, chassis, turret]).setScale(0.78).setDepth(9);
  return { body, turret };
}
