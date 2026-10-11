import Phaser from 'phaser';
import { drawMap } from '../render/MapRenderer';
import { drawLighting } from '../render/LightingRenderer';
import { CombatEffects } from '../render/CombatEffects';
import { WorldItemRenderer } from '../render/WorldItemRenderer';
import { ZoneRenderer } from '../render/ZoneRenderer';
import { createVehicle } from '../render/VehicleRenderer';
import { BUILDINGS, MAP, inBush } from '../config/map';
import { weaponFor } from '../config/weapons';
import type { GameNetworkAdapter } from '../network/GameNetworkAdapter';
import type { PlayerState, WorldItem, ZoneState } from '../../services/realtime/RealtimeClient';
import { WeaponKind } from '../network/BinaryGameCodec';
import {
  interpolateMovement,
  quantizeInput,
  stepMovement,
  type MovementState,
} from '../network/Movement';

export type GameControls = {
  moveX: number;
  moveY: number;
  aimAngle: number;
  touchAim: boolean;
  fire: boolean;
  pickup: boolean;
  weapon: WeaponKind;
  artilleryRange: number;
  lightingMode: 'cycle' | 'day' | 'night';
  headlights: boolean;
};
export type HudState = {
  x: number;
  y: number;
  health: number;
  nearbyItem: WorldItem | null;
  items: WorldItem[];
  zone: ZoneState | null;
  outsideZone: boolean;
  spectating: string | null;
  status: number;
  players: Pick<PlayerState, 'playerId' | 'x' | 'y' | 'username'>[];
  hidden: boolean;
  targetsHit: number;
  lightLevel: number;
  explored: { x: number; y: number }[];
  view: { x: number; y: number; width: number; height: number };
};

export class GameScene extends Phaser.Scene {
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private vehicle!: Phaser.GameObjects.Container;
  private turret!: Phaser.GameObjects.Graphics;
  private nameLabel!: Phaser.GameObjects.Text;
  private movementAccumulator = 0;
  private offlineMovement!: MovementState;
  private previousOfflineMovement!: MovementState;
  private lastHud = 0;
  private lastShot = 0;
  private effects!: CombatEffects;
  private itemRenderer!: WorldItemRenderer;
  private zoneRenderer!: ZoneRenderer;
  private lastItemRevision = -1;
  private lastVisualTick = 0;
  private lastLighting = 0;
  private spectatingId: string | null = null;
  private readonly exploredKeys = new Set<string>();
  private readonly explored: { x: number; y: number }[] = [];
  private targetsHit = 0;
  private targets: { x: number; y: number; health: number; body: Phaser.GameObjects.Container }[] =
    [];
  private remotes = new Map<
    string,
    {
      vehicle: Phaser.GameObjects.Container;
      turret: Phaser.GameObjects.Graphics;
      label: Phaser.GameObjects.Text;
    }
  >();

  constructor(
    private readonly network: GameNetworkAdapter | null = null,
    private readonly controls: GameControls = {
      moveX: 0,
      moveY: 0,
      aimAngle: 0,
      touchAim: false,
      fire: false,
      pickup: false,
      weapon: WeaponKind.Bullet,
      artilleryRange: 900,
      lightingMode: 'cycle',
      headlights: true,
    },
    private readonly onHud: (state: HudState) => void = () => {},
    private readonly mode: 'roam' | 'practice' = 'roam',
    private readonly lightingCanvas: HTMLCanvasElement | null = null,
  ) {
    super('Game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#252d39');
    this.cameras.main.setBounds(0, 0, MAP.width, MAP.height);
    drawMap(this);
    if (!this.network && this.mode === 'practice') this.createTargets();
    this.effects = new CombatEffects(this, (x, y, weapon) => this.hitTargets(x, y, weapon));
    this.itemRenderer = new WorldItemRenderer(this, (id) => {
      if (this.network) void this.network.pickup(id);
    });
    this.zoneRenderer = new ZoneRenderer(this);
    this.zoneRenderer.draw(this.network?.world.zone ?? null);
    const unsubscribeZone = this.network?.events.on('zone', (zone) => this.zoneRenderer.draw(zone));
    const unsubscribeShot = this.network?.events.on('shot', (shot) => {
      this.effects.drawShot(shot.startX, shot.startY, shot.endX, shot.endY, shot.weapon);
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
    });
    const unsubscribeImpact = this.network?.events.on('impact', (impact) =>
      this.effects.drawImpact(impact),
    );
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
    const selfVehicle = createVehicle(this, 1100, 640);
    this.vehicle = selfVehicle.body;
    this.turret = selfVehicle.turret;
    this.nameLabel = this.add
      .text(1100, 592, 'XE NHẶT SẮT', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#263746bb',
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5);
    this.offlineMovement = {
      x: 1100,
      y: 640,
      rotation: 0,
      aimAngle: 0,
      velocityX: 0,
      velocityY: 0,
      health: 100,
      status: 0,
    };
    this.previousOfflineMovement = this.offlineMovement;
    this.cameras.main.centerOn(this.vehicle.x, this.vehicle.y);
    this.cameras.main.startFollow(this.vehicle, true, 0.09, 0.09);
    this.cameras.main.setZoom(this.scale.width < 650 ? 0.64 : 0.82);
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.cameras.main.setZoom(size.width < 650 ? 0.64 : 0.82);
    });
    this.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
        if (objects.length > 0) return;
        if (!pointer.event || (pointer.event.target as HTMLElement)?.tagName !== 'CANVAS') return;
        if (pointer.event instanceof MouseEvent) this.controls.fire = true;
      },
    );
    this.input.on('pointerup', () => {
      this.controls.fire = false;
    });
    this.events.once('shutdown', () => {
      unsubscribeShot?.();
      unsubscribeImpact?.();
      this.itemRenderer.destroy();
      unsubscribeZone?.();
      this.zoneRenderer.destroy();
      const context = this.lightingCanvas?.getContext('2d');
      context?.clearRect(0, 0, this.lightingCanvas!.width, this.lightingCanvas!.height);
    });
  }

  update(time: number, delta: number): void {
    this.itemRenderer.update(time);
    if (this.network && this.network.world.itemRevision !== this.lastItemRevision) {
      this.lastItemRevision = this.network.world.itemRevision;
      this.itemRenderer.sync(this.network.world.items);
    }
    if (this.controls.pickup) {
      this.controls.pickup = false;
      const nearest = this.network?.world.items.find(
        (item) => Math.hypot(item.x - this.vehicle.x, item.y - this.vehicle.y) <= 80,
      );
      if (nearest && this.network) void this.network.pickup(nearest.id);
    }
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
    const lightLevel =
      this.controls.lightingMode === 'night'
        ? 1
        : this.controls.lightingMode === 'day'
          ? 0
          : (1 - Math.cos((time / 120000) * Math.PI * 2)) / 2;
    if (time - this.lastLighting >= 60) {
      this.lastLighting = time;
      drawLighting(
        this,
        this.lightingCanvas,
        this.spectatingId
          ? (this.remotes.get(this.spectatingId)?.vehicle ?? this.vehicle)
          : this.vehicle,
        lightLevel,
        aimAngle,
        this.controls.headlights,
      );
    }
    this.turret.rotation = aimAngle - this.vehicle.rotation;
    const movementTickMs = 1000 / 30;
    this.movementAccumulator = Math.min(250, this.movementAccumulator + Math.min(delta, 250));
    while (this.movementAccumulator >= movementTickMs) {
      this.movementAccumulator -= movementTickMs;
      const input = { moveX: horizontal, moveY: vertical, aimAngle };
      if (this.network) this.network.stepLocal(input);
      else {
        this.previousOfflineMovement = this.offlineMovement;
        this.offlineMovement = stepMovement(this.offlineMovement, quantizeInput(input));
      }
    }
    const movementAlpha = this.movementAccumulator / movementTickMs;
    const cooldown = weaponFor(this.controls.weapon).cooldownTicks * (1000 / 30);
    if (this.controls.fire && time - this.lastShot >= cooldown) {
      this.lastShot = time;
      this.fire(aimAngle);
    }
    if (time - this.lastHud >= 100) {
      this.lastHud = time;
      const cellX = Math.floor(this.vehicle.x / 170);
      const cellY = Math.floor(this.vehicle.y / 170);
      const key = `${cellX}:${cellY}`;
      if (!this.exploredKeys.has(key)) {
        this.exploredKeys.add(key);
        this.explored.push({ x: this.vehicle.x, y: this.vehicle.y });
      }
      this.onHud({
        x: this.vehicle.x,
        y: this.vehicle.y,
        health: this.network?.world.get(this.network.playerId)?.health ?? 100,
        nearbyItem:
          this.network?.world.items.find(
            (item) => Math.hypot(item.x - this.vehicle.x, item.y - this.vehicle.y) <= 80,
          ) ?? null,
        items: this.network?.world.items ?? [],
        zone: this.network?.world.zone ?? null,
        outsideZone: this.network?.world.zone
          ? Math.hypot(
              this.vehicle.x - this.network.world.zone.centerX,
              this.vehicle.y - this.network.world.zone.centerY,
            ) > this.network.world.zone.radius
          : false,
        spectating: this.spectatingId
          ? (this.network?.world.get(this.spectatingId)?.username ?? null)
          : null,
        status: this.network?.world.get(this.network.playerId)?.status ?? 0,
        players: this.network ? [...this.network.world.all()] : [],
        hidden: inBush(this.vehicle.x, this.vehicle.y),
        targetsHit: this.targetsHit,
        lightLevel,
        explored: this.explored,
        view: {
          x: this.cameras.main.worldView.x,
          y: this.cameras.main.worldView.y,
          width: this.cameras.main.worldView.width,
          height: this.cameras.main.worldView.height,
        },
      });
    }
    if (this.network) {
      if (this.network.world.serverTick !== this.lastVisualTick) {
        this.lastVisualTick = this.network.world.serverTick;
        this.effects.renderWorldEffects(this.network.world.projectiles, this.network.world.hazards);
      }
      const self =
        this.network.prediction.presentation(movementAlpha) ??
        this.network.world.get(this.network.playerId);
      if (self) {
        const difference = Math.hypot(self.x - this.vehicle.x, self.y - this.vehicle.y);
        if (this.network.prediction.hardReset || difference > 100) {
          this.vehicle.setPosition(self.x, self.y).setRotation(self.rotation);
          this.network.prediction.hardReset = false;
        } else {
          const fraction = 1 - Math.exp(-Math.min(delta, 50) / 65);
          this.vehicle.setPosition(
            Phaser.Math.Linear(this.vehicle.x, self.x, fraction),
            Phaser.Math.Linear(this.vehicle.y, self.y, fraction),
          );
          this.vehicle.rotation = Phaser.Math.Angle.RotateTo(
            this.vehicle.rotation,
            self.rotation,
            (Math.min(delta, 50) / 1000) * 10,
          );
        }
        this.vehicle.setAlpha(self.health === 0 ? 0.3 : 1);
        this.turret.rotation = self.aimAngle - self.rotation;
        this.nameLabel.setPosition(this.vehicle.x, this.vehicle.y - 48);
        const selfName = this.network.world.get(this.network.playerId)?.username ?? 'XE NHẶT SẮT';
        if (this.nameLabel.text !== selfName) this.nameLabel.setText(selfName);
      }
      const seen = new Set<string>();
      for (const player of this.network.world.all()) {
        if (player.playerId === this.network.playerId) continue;
        const displayed =
          this.network.interpolation.sample(player.playerId, performance.now()) ?? player;
        seen.add(player.playerId);
        let remote = this.remotes.get(player.playerId);
        if (!remote) {
          const model = createVehicle(this, player.x, player.y, true);
          remote = {
            vehicle: model.body,
            turret: model.turret,
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
        remote.vehicle.setPosition(displayed.x, displayed.y).setRotation(displayed.rotation);
        remote.turret.rotation = displayed.aimAngle - displayed.rotation;
        remote.label.setPosition(displayed.x, displayed.y - 48);
        const remoteName = `${player.username} · ${player.health} HP${player.status ? ' · BÙN' : ''}`;
        if (remote.label.text !== remoteName) remote.label.setText(remoteName);
        remote.vehicle.setAlpha(player.health === 0 ? 0.3 : 1);
        remote.vehicle.setVisible(true);
        remote.label.setVisible(true);
      }
      for (const [id, remote] of this.remotes) {
        if (seen.has(id)) continue;
        remote.vehicle.destroy();
        remote.label.destroy();
        this.remotes.delete(id);
      }
      const selfDead = this.network.world.get(this.network.playerId)?.health === 0;
      const nextSpectator = selfDead
        ? ([...this.network.world.all()].find(
            (player) =>
              player.playerId !== this.network!.playerId &&
              player.health > 0 &&
              this.remotes.get(player.playerId)?.vehicle.visible,
          )?.playerId ?? null)
        : null;
      if (nextSpectator !== this.spectatingId) {
        this.spectatingId = nextSpectator;
        this.cameras.main.startFollow(
          nextSpectator ? this.remotes.get(nextSpectator)!.vehicle : this.vehicle,
          true,
          0.09,
          0.09,
        );
      }
      return;
    }
    const presented = interpolateMovement(
      this.previousOfflineMovement,
      this.offlineMovement,
      movementAlpha,
    );
    this.vehicle.setPosition(presented.x, presented.y).setRotation(presented.rotation);
    this.nameLabel.setPosition(this.vehicle.x, this.vehicle.y - 48);
    this.turret.rotation = aimAngle - this.vehicle.rotation;
  }

  private fire(angle: number): void {
    const weapon = this.controls.weapon;
    const rule = weaponFor(weapon);
    const range = weapon === WeaponKind.Artillery ? this.controls.artilleryRange : rule.range;
    if (this.network && this.network.world.get(this.network.playerId)?.health === 0) return;
    const ammo = this.network?.ammo.get(weapon);
    if (ammo && (ammo.loaded === 0 || ammo.reloadTicks > 0)) {
      if (ammo.loaded === 0 && ammo.reloadTicks === 0) this.network?.reload(weapon);
      return;
    }
    const flash = this.add
      .circle(
        this.vehicle.x + Math.cos(angle) * 41,
        this.vehicle.y + Math.sin(angle) * 41,
        weapon === WeaponKind.Rocket ? 17 : 11,
        rule.behavior === 'Hitscan' ? 0x9df2ff : 0xffd27b,
        0.88,
      )
      .setDepth(21);
    this.tweens.add({
      targets: flash,
      scale: 2.3,
      alpha: 0,
      duration: 110,
      onComplete: () => flash.destroy(),
    });
    if (this.network) {
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
    if (this.mode === 'practice' && rule.behavior !== 'Lob') {
      const available = Math.hypot(endX - startX, endY - startY);
      const target = this.targets
        .map((dummy) => ({
          dummy,
          distance: (dummy.x - startX) * Math.cos(angle) + (dummy.y - startY) * Math.sin(angle),
          offset: Math.abs(
            (dummy.x - startX) * Math.sin(angle) - (dummy.y - startY) * Math.cos(angle),
          ),
        }))
        .filter(
          (candidate) =>
            candidate.distance > 0 && candidate.distance < available && candidate.offset < 31,
        )
        .sort((a, b) => a.distance - b.distance)[0];
      if (target) {
        endX = startX + Math.cos(angle) * target.distance;
        endY = startY + Math.sin(angle) * target.distance;
      }
    }
    if (rule.behavior === 'Hitscan') {
      this.effects.drawShot(startX, startY, endX, endY, weapon);
      this.hitTargets(endX, endY, weapon);
    } else {
      if (rule.behavior === 'Lob') {
        endX = Phaser.Math.Clamp(startX + Math.cos(angle) * range, 0, MAP.width);
        endY = Phaser.Math.Clamp(startY + Math.sin(angle) * range, 0, MAP.height);
      }
      this.effects.previewProjectile(startX, startY, endX, endY, weapon);
    }
  }

  private createTargets(): void {
    for (const [x, y] of [
      [1120, 565],
      [1310, 620],
      [1510, 570],
      [1870, 620],
      [2260, 620],
    ]) {
      const base = this.add.circle(0, 9, 35, 0x17242b, 0.5);
      const outer = this.add.circle(0, 0, 30, 0xffe5ad).setStrokeStyle(5, 0x263747);
      const middle = this.add.circle(0, 0, 20, 0xe48470).setStrokeStyle(3, 0x263747);
      const center = this.add.circle(0, 0, 8, 0xffeac1);
      const body = this.add.container(x, y, [base, outer, middle, center]).setDepth(6);
      this.targets.push({ x, y, health: 100, body });
    }
  }

  private hitTargets(x: number, y: number, weapon: WeaponKind): void {
    if (this.mode !== 'practice') return;
    const rule = weaponFor(weapon);
    const radius = Math.max(35, rule.blastRadius);
    const damage = rule.damage;
    for (const target of this.targets) {
      if (Math.hypot(x - target.x, y - target.y) > radius) continue;
      target.health = Math.max(0, target.health - damage);
      this.tweens.add({ targets: target.body, scale: 1.2, yoyo: true, duration: 100 });
      if (target.health > 0) continue;
      this.targetsHit++;
      target.health = 100;
      target.body.setAlpha(0.2);
      this.tweens.add({ targets: target.body, alpha: 1, duration: 400 });
      const score = this.add
        .text(target.x, target.y - 48, '+1 MỤC TIÊU', {
          fontFamily: 'Arial',
          fontSize: '19px',
          color: '#ffe7a4',
          stroke: '#263747',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(25);
      this.tweens.add({
        targets: score,
        y: score.y - 32,
        alpha: 0,
        duration: 900,
        onComplete: () => score.destroy(),
      });
    }
  }

  private blockedPoint(x: number, y: number): boolean {
    return BUILDINGS.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }
}
