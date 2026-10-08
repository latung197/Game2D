import Phaser from 'phaser';
import { BUILDINGS, BUSHES, MAP, inBush } from '../config/map';
import type { GameNetworkAdapter } from '../network/GameNetworkAdapter';
import type { PlayerState } from '../../services/realtime/RealtimeClient';
import { WeaponKind, type ImpactEvent, type ProjectileState, type HazardState } from '../network/BinaryGameCodec';

export type GameControls = {
  moveX: number;
  moveY: number;
  aimAngle: number;
  touchAim: boolean;
  fire: boolean;
  weapon: WeaponKind;
  artilleryRange: number;
};
export type HudState = {
  x: number;
  y: number;
  health: number;
  status: number;
  players: Pick<PlayerState, 'playerId' | 'x' | 'y' | 'username'>[];
  hidden: boolean;
  view: { x: number; y: number; width: number; height: number };
};

export class GameScene extends Phaser.Scene {
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private vehicle!: Phaser.GameObjects.Container;
  private turret!: Phaser.GameObjects.Graphics;
  private nameLabel!: Phaser.GameObjects.Text;
  private speed = 280;
  private lastHud = 0;
  private lastShot = 0;
  private shotGraphics!: Phaser.GameObjects.Graphics;
  private lastVisualTick = 0;
  private projectiles = new Map<number, { body: Phaser.GameObjects.Arc; shadow?: Phaser.GameObjects.Arc }>();
  private hazards = new Map<number, Phaser.GameObjects.Arc>();
  private remotes = new Map<
    string,
    { vehicle: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text }
  >();

  constructor(
    private readonly network: GameNetworkAdapter | null = null,
    private readonly controls: GameControls = {
      moveX: 0,
      moveY: 0,
      aimAngle: 0,
      touchAim: false,
      fire: false,
      weapon: WeaponKind.Bullet,
      artilleryRange: 900,
    },
    private readonly onHud: (state: HudState) => void = () => {},
  ) {
    super('Game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#252d39');
    this.cameras.main.setBounds(0, 0, MAP.width, MAP.height);
    this.drawMap();
    this.shotGraphics = this.add.graphics().setDepth(20);
    if (this.network)
      this.network.onShot = (shot) => {
        this.drawShot(shot.startX, shot.startY, shot.endX, shot.endY);
        if (shot.hitNetworkId) {
          const label = this.add
            .text(
              shot.endX,
              shot.endY - 28,
              shot.targetHealth ? `-25 · ${shot.targetHealth} HP` : 'HẠ GỤC',
              {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#ffe6a2',
                stroke: '#263746',
                strokeThickness: 4,
              },
            )
            .setOrigin(0.5)
            .setDepth(25);
          this.tweens.add({
            targets: label,
            y: label.y - 28,
            alpha: 0,
            duration: 850,
            onComplete: () => label.destroy(),
          });
        }
      };
    if (this.network) this.network.onImpact = (impact) => this.drawImpact(impact);
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
    this.cameras.main.setZoom(0.82);
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.cameras.main.setZoom(size.width < 650 ? 0.78 : 0.82);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.event || (pointer.event.target as HTMLElement)?.tagName !== 'CANVAS') return;
      if (pointer.event instanceof MouseEvent) this.controls.fire = true;
    });
    this.input.on('pointerup', () => {
      this.controls.fire = false;
    });
  }

  update(time: number, delta: number): void {
    const keyHorizontal =
      Number(this.keys.right.isDown || this.arrows.right.isDown) -
      Number(this.keys.left.isDown || this.arrows.left.isDown);
    const keyVertical =
      Number(this.keys.down.isDown || this.arrows.down.isDown) -
      Number(this.keys.up.isDown || this.arrows.up.isDown);
    const horizontal = Math.abs(this.controls.moveX) > 0.01 ? this.controls.moveX : keyHorizontal;
    const vertical = Math.abs(this.controls.moveY) > 0.01 ? this.controls.moveY : keyVertical;
    const pointer = this.input.activePointer;
    const target = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const aimAngle = this.controls.touchAim
      ? this.controls.aimAngle
      : Phaser.Math.Angle.Between(this.vehicle.x, this.vehicle.y, target.x, target.y);
    this.turret.rotation = aimAngle - this.vehicle.rotation;
    const cooldown = this.controls.weapon === WeaponKind.Rocket ? 1000 :
      this.controls.weapon === WeaponKind.Artillery ? 1500 :
      this.controls.weapon === WeaponKind.Mud ? 667 :
      this.controls.weapon === WeaponKind.Laser ? 400 : 234;
    if (this.controls.fire && time - this.lastShot >= cooldown) {
      this.lastShot = time;
      this.fire(aimAngle);
    }
    if (time - this.lastHud >= 100) {
      this.lastHud = time;
      this.onHud({
        x: this.vehicle.x,
        y: this.vehicle.y,
        health: this.network?.world.get(this.network.playerId)?.health ?? 100,
        status: this.network?.world.get(this.network.playerId)?.status ?? 0,
        players: this.network ? [...this.network.world.all()] : [],
        hidden: inBush(this.vehicle.x, this.vehicle.y),
        view: {
          x: this.cameras.main.worldView.x,
          y: this.cameras.main.worldView.y,
          width: this.cameras.main.worldView.width,
          height: this.cameras.main.worldView.height,
        },
      });
    }
    if (this.network) {
      this.network.sendInput(time, horizontal, vertical, aimAngle);
      if (this.network.world.serverTick !== this.lastVisualTick) {
        this.lastVisualTick = this.network.world.serverTick;
        this.renderWorldEffects(this.network.world.projectiles, this.network.world.hazards);
      }
      const self = this.network.world.get(this.network.playerId);
      if (self) {
        this.vehicle.setPosition(self.x, self.y).setRotation(self.rotation);
        this.vehicle.setAlpha(self.health === 0 ? 0.3 : 1);
        this.turret.rotation = self.aimAngle - self.rotation;
        this.nameLabel.setPosition(self.x, self.y - 48).setText(self.username);
      }
      const seen = new Set<string>();
      for (const player of this.network.world.all()) {
        if (player.playerId === this.network.playerId) continue;
        seen.add(player.playerId);
        let remote = this.remotes.get(player.playerId);
        if (!remote) {
          const body = this.add.ellipse(0, 0, 60, 44, 0x87b8a9).setStrokeStyle(4, 0x203642);
          const marker = this.add.star(0, 0, 5, 9, 18, 0xf9db8d);
          remote = {
            vehicle: this.add.container(player.x, player.y, [body, marker]),
            label: this.add
              .text(player.x, player.y - 48, player.username, {
                fontFamily: 'Arial',
                fontSize: '14px',
                color: '#ffffff',
                backgroundColor: '#263746bb',
                padding: { x: 7, y: 3 },
              })
              .setOrigin(0.5),
          };
          this.remotes.set(player.playerId, remote);
        }
        remote.vehicle.setPosition(player.x, player.y).setRotation(player.rotation);
        remote.label
          .setPosition(player.x, player.y - 48)
          .setText(`${player.username} · ${player.health} HP${player.status ? ' · BÙN' : ''}`);
        remote.vehicle.setAlpha(player.health === 0 ? 0.3 : 1);
        const hidden =
          inBush(player.x, player.y) &&
          Math.hypot(player.x - this.vehicle.x, player.y - this.vehicle.y) > 145;
        remote.vehicle.setVisible(!hidden);
        remote.label.setVisible(!hidden);
      }
      for (const [id, remote] of this.remotes) {
        if (seen.has(id)) continue;
        remote.vehicle.destroy();
        remote.label.destroy();
        this.remotes.delete(id);
      }
      return;
    }
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
    this.turret.rotation = aimAngle - this.vehicle.rotation;
  }

  private fire(angle: number): void {
    const weapon = this.controls.weapon;
    const range = weapon === WeaponKind.Artillery ? this.controls.artilleryRange :
      weapon === WeaponKind.Laser ? 2800 : weapon === WeaponKind.Bullet ? 1800 :
      weapon === WeaponKind.Rocket ? 2200 : 1200;
    if (this.network) {
      if (this.network.world.get(this.network.playerId)?.health === 0) return;
      this.network.fire(weapon, range);
      return;
    }
    const startX = this.vehicle.x + Math.cos(angle) * 35;
    const startY = this.vehicle.y + Math.sin(angle) * 35;
    let endX = startX;
    let endY = startY;
    for (let d = 0; d < range; d += 12) {
      const x = startX + Math.cos(angle) * d;
      const y = startY + Math.sin(angle) * d;
      if (x < 0 || y < 0 || x > MAP.width || y > MAP.height || this.blockedPoint(x, y)) break;
      endX = x;
      endY = y;
    }
    if (weapon === WeaponKind.Laser) this.drawShot(startX, startY, endX, endY);
    else {
      if (weapon === WeaponKind.Artillery) {
        endX = Phaser.Math.Clamp(startX + Math.cos(angle) * range, 0, MAP.width);
        endY = Phaser.Math.Clamp(startY + Math.sin(angle) * range, 0, MAP.height);
      }
      this.previewProjectile(startX, startY, endX, endY, weapon);
    }
  }

  private previewProjectile(startX: number, startY: number, endX: number, endY: number,
    weapon: WeaponKind): void {
    const color = weapon === WeaponKind.Rocket ? 0xff864f :
      weapon === WeaponKind.Artillery ? 0xe4a65a :
      weapon === WeaponKind.Mud ? 0x8a6247 : 0xffe09a;
    const radius = weapon === WeaponKind.Rocket ? 13 : weapon === WeaponKind.Artillery ? 15 : 9;
    const body = this.add.circle(startX, startY, radius, color).setDepth(19);
    const duration = weapon === WeaponKind.Artillery ? 1500 :
      Math.max(180, Math.hypot(endX - startX, endY - startY) /
        (weapon === WeaponKind.Bullet ? 1100 : weapon === WeaponKind.Rocket ? 520 : 650) * 1000);
    this.tweens.addCounter({ from: 0, to: 1, duration, onUpdate: (tween) => {
      const p = tween.getValue() ?? 0;
      body.setPosition(startX + (endX - startX) * p,
        startY + (endY - startY) * p -
          (weapon === WeaponKind.Artillery ? Math.sin(p * Math.PI) * 130 : 0));
    }, onComplete: () => {
      body.destroy();
      this.drawImpact({ id: 0, x: endX, y: endY, weapon, hitNetworkId: 0, targetHealth: 0 });
    } });
  }

  private renderWorldEffects(projectiles: ProjectileState[], hazards: HazardState[]): void {
    const seenProjectiles = new Set<number>();
    for (const projectile of projectiles) {
      seenProjectiles.add(projectile.id);
      let visual = this.projectiles.get(projectile.id);
      if (!visual) {
        const color = projectile.weapon === WeaponKind.Rocket ? 0xff8952 :
          projectile.weapon === WeaponKind.Artillery ? 0xe9ae66 :
          projectile.weapon === WeaponKind.Mud ? 0x87634b : 0xffdf8e;
        const radius = projectile.weapon === WeaponKind.Rocket ? 13 :
          projectile.weapon === WeaponKind.Artillery ? 15 : 8;
        const body = this.add.circle(projectile.x, projectile.y, radius, color)
          .setStrokeStyle(3, 0x2d3942).setDepth(18);
        const shadow = projectile.weapon === WeaponKind.Artillery ?
          this.add.circle(projectile.x, projectile.y, 17, 0x111d24, 0.45).setDepth(4) : undefined;
        visual = { body, shadow };
        this.projectiles.set(projectile.id, visual);
      }
      const airborne = projectile.weapon === WeaponKind.Artillery ?
        Math.sin(projectile.progress / 255 * Math.PI) * 130 : 0;
      this.tweens.killTweensOf(visual.body);
      this.tweens.add({ targets: visual.body, x: projectile.x, y: projectile.y - airborne,
        duration: 95, ease: 'Linear' });
      if (visual.shadow) {
        this.tweens.killTweensOf(visual.shadow);
        this.tweens.add({ targets: visual.shadow, x: projectile.x, y: projectile.y,
          duration: 95, ease: 'Linear' });
      }
    }
    for (const [id, visual] of this.projectiles) {
      if (seenProjectiles.has(id)) continue;
      visual.body.destroy(); visual.shadow?.destroy(); this.projectiles.delete(id);
    }
    const seenHazards = new Set<number>();
    for (const hazard of hazards) {
      seenHazards.add(hazard.id);
      let puddle = this.hazards.get(hazard.id);
      if (!puddle) {
        puddle = this.add.circle(hazard.x, hazard.y, 100, 0x684e3c, 0.62)
          .setStrokeStyle(4, 0xa0805e, 0.8).setDepth(3);
        this.hazards.set(hazard.id, puddle);
      }
      puddle.setPosition(hazard.x, hazard.y).setAlpha(Math.min(0.65, hazard.remaining / 45));
    }
    for (const [id, puddle] of this.hazards) {
      if (seenHazards.has(id)) continue;
      puddle.destroy(); this.hazards.delete(id);
    }
  }

  private drawImpact(impact: ImpactEvent): void {
    const radius = impact.weapon === WeaponKind.Rocket ? 110 :
      impact.weapon === WeaponKind.Artillery ? 145 :
      impact.weapon === WeaponKind.Mud ? 95 : 25;
    const color = impact.weapon === WeaponKind.Mud ? 0x785440 :
      impact.weapon === WeaponKind.Bullet ? 0xffe09a : 0xffa45e;
    const blast = this.add.circle(impact.x, impact.y, radius, color, 0.55)
      .setStrokeStyle(5, 0xffe8ae, 0.85).setDepth(17).setScale(0.2);
    this.tweens.add({ targets: blast, scale: 1, alpha: 0, duration: 300,
      onComplete: () => blast.destroy() });
    if (impact.hitNetworkId) {
      const label = this.add.text(impact.x, impact.y - 28,
        impact.targetHealth ? `${impact.targetHealth} HP` : 'HẠ GỤC',
        { fontFamily: 'Arial', fontSize: '19px', color: '#ffe6a2',
          stroke: '#263746', strokeThickness: 4 }).setOrigin(0.5).setDepth(25);
      this.tweens.add({ targets: label, y: label.y - 28, alpha: 0, duration: 850,
        onComplete: () => label.destroy() });
    }
  }

  private drawShot(startX: number, startY: number, endX: number, endY: number): void {
    const beam = this.add.graphics().setDepth(18);
    beam.lineStyle(5, 0xffd885, 0.9).lineBetween(startX, startY, endX, endY);
    beam.lineStyle(2, 0xffffff, 0.9).lineBetween(startX, startY, endX, endY);
    this.tweens.add({ targets: beam, alpha: 0, duration: 180, onComplete: () => beam.destroy() });
    this.shotGraphics.fillStyle(0xffe4a2).fillCircle(endX, endY, 7);
    this.time.delayedCall(150, () => this.shotGraphics.clear());
  }

  private blockedPoint(x: number, y: number): boolean {
    return BUILDINGS.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
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
    g.fillStyle(0xc9b9a7)
      .fillRect(0, 470, MAP.width, 55)
      .fillRect(0, 720, MAP.width, 55)
      .fillRect(0, 1510, MAP.width, 55)
      .fillRect(650, 0, 65, MAP.height)
      .fillRect(1330, 0, 65, MAP.height)
      .fillRect(2190, 0, 65, MAP.height);
    g.lineStyle(4, 0xe9d6a2, 0.55);
    for (let x = 20; x < MAP.width; x += 105) g.lineBetween(x, 620, x + 55, 620);
    for (let y = 20; y < MAP.height; y += 105) g.lineBetween(1020, y, 1020, y + 55);
    for (let x = 20; x < MAP.width; x += 105) g.lineBetween(x, 1420, x + 55, 1420);
    for (let y = 20; y < MAP.height; y += 105) g.lineBetween(2200, y, 2200, y + 55);
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
    for (const { x, y, r } of BUSHES) {
      g.fillStyle(0x1a2630, 0.35).fillCircle(x + 7, y + 9, r);
      g.fillStyle(0x446d5e).fillCircle(x, y, r);
      g.fillStyle(0x648a6e).fillCircle(x - 13, y - 12, r * 0.62);
      g.fillStyle(0x9876a6)
        .fillCircle(x + 10, y - 18, 8)
        .fillCircle(x - 20, y + 8, 7);
    }
    g.lineStyle(9, 0xe5bf88, 0.6).strokeRect(4, 4, MAP.width - 8, MAP.height - 8);
  }
}
