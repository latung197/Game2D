import Phaser from 'phaser';
import { BUILDINGS, MAP } from '../config/map';

export class GameScene extends Phaser.Scene {
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private vehicle!: Phaser.GameObjects.Container;
  private turret!: Phaser.GameObjects.Graphics;
  private nameLabel!: Phaser.GameObjects.Text;
  private speed = 280;

  constructor() {
    super('Game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#252d39');
    this.cameras.main.setBounds(0, 0, MAP.width, MAP.height);
    this.drawMap();
    const wasd = this.input.keyboard!.addKeys('W,S,A,D') as Record<
      'W' | 'S' | 'A' | 'D',
      Phaser.Input.Keyboard.Key
    >;
    this.keys = {
      up: wasd.W,
      down: wasd.S,
      left: wasd.A,
      right: wasd.D,
    };
    this.arrows = this.input.keyboard!.createCursorKeys();
    this.vehicle = this.makeVehicle(1100, 640);
    this.cameras.main.centerOn(this.vehicle.x, this.vehicle.y);
    this.cameras.main.startFollow(this.vehicle, true, 0.09, 0.09);
    this.cameras.main.setZoom(1);
  }

  update(_time: number, delta: number): void {
    const horizontal =
      Number(this.keys.right.isDown || this.arrows.right.isDown) -
      Number(this.keys.left.isDown || this.arrows.left.isDown);
    const vertical =
      Number(this.keys.down.isDown || this.arrows.down.isDown) -
      Number(this.keys.up.isDown || this.arrows.up.isDown);
    const length = Math.hypot(horizontal, vertical) || 1;
    const seconds = Math.min(delta, 50) / 1000;
    const nextX = Phaser.Math.Clamp(
      this.vehicle.x + (horizontal / length) * this.speed * seconds,
      35,
      MAP.width - 35,
    );
    const nextY = Phaser.Math.Clamp(
      this.vehicle.y + (vertical / length) * this.speed * seconds,
      35,
      MAP.height - 35,
    );
    if (!this.blocked(nextX, this.vehicle.y)) this.vehicle.x = nextX;
    if (!this.blocked(this.vehicle.x, nextY)) this.vehicle.y = nextY;
    if (horizontal || vertical) {
      const desired = Math.atan2(vertical, horizontal);
      this.vehicle.rotation = Phaser.Math.Angle.RotateTo(
        this.vehicle.rotation,
        desired,
        seconds * 7,
      );
    }
    this.nameLabel.setPosition(this.vehicle.x, this.vehicle.y - 48);
    const pointer = this.input.activePointer;
    const target = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.turret.rotation =
      Phaser.Math.Angle.Between(this.vehicle.x, this.vehicle.y, target.x, target.y) -
      this.vehicle.rotation;
  }

  private blocked(x: number, y: number): boolean {
    return BUILDINGS.some(
      (b) => x > b.x - 28 && x < b.x + b.w + 28 && y > b.y - 28 && y < b.y + b.h + 28,
    );
  }

  private makeVehicle(x: number, y: number): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(5, 10, 63, 42, 0x18232d, 0.45);
    const body = this.add.graphics();
    body.fillStyle(0x23374b).fillRoundedRect(-32, -23, 64, 46, 13);
    body.fillStyle(0xf5bd72).fillRoundedRect(-25, -19, 50, 38, 11);
    body.fillStyle(0xfbe6ae).fillRoundedRect(-10, -14, 27, 28, 6);
    body
      .fillStyle(0x243747)
      .fillCircle(-21, -26, 7)
      .fillCircle(20, -26, 7)
      .fillCircle(-21, 26, 7)
      .fillCircle(20, 26, 7);
    const logo = this.add.text(-20, -10, '★', {
      fontSize: '20px',
      color: '#6b537f',
      fontStyle: 'bold',
    });
    this.turret = this.add.graphics();
    this.turret.fillStyle(0x273a4c).fillRoundedRect(-2, -7, 43, 14, 5);
    this.turret.fillStyle(0x6f577a).fillCircle(0, 0, 12);
    const container = this.add.container(x, y, [shadow, body, logo, this.turret]);
    this.nameLabel = this.add
      .text(x, y - 48, 'XE NHẶT SẮT', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#263746bb',
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5);
    return container;
  }

  private drawMap(): void {
    const g = this.add.graphics();
    g.fillStyle(0x28323c).fillRect(0, 0, MAP.width, MAP.height);
    for (let x = 0; x < MAP.width; x += MAP.tile) {
      for (let y = 0; y < MAP.height; y += MAP.tile) {
        g.fillStyle((x / MAP.tile + y / MAP.tile) % 2 ? 0x303b46 : 0x34404a, 0.35).fillRect(
          x,
          y,
          MAP.tile - 2,
          MAP.tile - 2,
        );
      }
    }
    g.fillStyle(0xc9b9a7).fillRect(0, 470, MAP.width, 55).fillRect(0, 720, MAP.width, 55);
    g.fillStyle(0xc9b9a7).fillRect(650, 0, 65, MAP.height).fillRect(1330, 0, 65, MAP.height);
    g.lineStyle(4, 0xe9d6a2, 0.55);
    for (let x = 20; x < MAP.width; x += 105) g.lineBetween(x, 620, x + 55, 620);
    for (let y = 20; y < MAP.height; y += 105) g.lineBetween(1020, y, 1020, y + 55);
    for (const b of BUILDINGS) {
      g.fillStyle(0x18232e, 0.5).fillRoundedRect(b.x + 12, b.y + 15, b.w, b.h, 18);
      g.fillStyle(0x202c38).fillRoundedRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10, 18);
      g.fillStyle(b.color).fillRoundedRect(b.x, b.y, b.w, b.h, 15);
      g.fillStyle(0xd8c6b5).fillRoundedRect(b.x + 24, b.y + 30, b.w - 48, 24, 6);
      g.fillStyle(0x394658).fillRect(b.x + 34, b.y + 87, b.w - 68, b.h - 127);
      g.fillStyle(0xc6c0bb).fillRect(b.x + 40, b.y + 94, b.w - 80, b.h - 140);
      g.lineStyle(3, 0x4c5260, 0.55).lineBetween(
        b.x + 35,
        b.y + b.h - 70,
        b.x + b.w - 35,
        b.y + b.h - 70,
      );
      this.add
        .text(b.x + b.w / 2, b.y + 44, b.label, {
          fontFamily: 'Arial',
          fontSize: '22px',
          color: '#513d55',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }
    for (const [x, y] of [
      [590, 420],
      [1260, 430],
      [2170, 490],
      [750, 1250],
      [1440, 1290],
      [2030, 1260],
    ]) {
      g.fillStyle(0x1a2630, 0.35).fillCircle(x + 7, y + 9, 47);
      g.fillStyle(0x446d5e).fillCircle(x, y, 47);
      g.fillStyle(0x648a6e).fillCircle(x - 13, y - 12, 29);
      g.fillStyle(0x9876a6)
        .fillCircle(x + 10, y - 18, 8)
        .fillCircle(x - 20, y + 8, 7);
    }
  }
}
