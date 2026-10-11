import Phaser from 'phaser';
import {
  WeaponKind,
  type ImpactEvent,
  type ProjectileState,
  type HazardState,
} from '../network/BinaryGameCodec';
import { weaponFor } from '../config/weapons';

export class CombatEffects {
  private readonly shotGraphics: Phaser.GameObjects.Graphics;
  private projectiles = new Map<
    number,
    {
      body: Phaser.GameObjects.Arc;
      shadow?: Phaser.GameObjects.Arc;
      trail: Phaser.GameObjects.Graphics;
    }
  >();
  private hazards = new Map<number, Phaser.GameObjects.Arc>();
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onPracticeImpact: (x: number, y: number, weapon: WeaponKind) => void,
  ) {
    this.shotGraphics = scene.add.graphics().setDepth(20);
  }

  previewProjectile(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    weapon: WeaponKind,
  ): void {
    const rule = weaponFor(weapon);
    const color =
      weapon === WeaponKind.Rocket
        ? 0xff864f
        : rule.behavior === 'Lob'
          ? 0xe4a65a
          : weapon === WeaponKind.Mud
            ? 0x8a6247
            : weapon === WeaponKind.Burst
              ? 0xffef9c
              : 0xffe09a;
    const radius = weapon === WeaponKind.Rocket ? 13 : rule.behavior === 'Lob' ? 15 : 9;
    const body = this.scene.add.circle(startX, startY, radius, color).setDepth(19);
    body.setStrokeStyle(3, weapon === WeaponKind.Mud ? 0x443c35 : 0xfff0c3);
    const trail = this.scene.add.graphics().setDepth(18);
    const duration =
      rule.behavior === 'Lob'
        ? rule.flightTicks * (1000 / 30)
        : Math.max(180, (Math.hypot(endX - startX, endY - startY) / rule.speed) * 1000);
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      onUpdate: (tween) => {
        const p = tween.getValue() ?? 0;
        const px = startX + (endX - startX) * p;
        const py =
          startY +
          (endY - startY) * p -
          (rule.behavior === 'Lob' ? Math.sin(p * Math.PI) * 130 : 0);
        body.setPosition(px, py);
        trail
          .clear()
          .lineStyle(
            weapon === WeaponKind.Rocket ? 12 : 5,
            weapon === WeaponKind.Mud ? 0x9c7856 : 0xffba6d,
            0.55,
          );
        trail.lineBetween(
          px - Math.cos(Math.atan2(endY - startY, endX - startX)) * 35,
          py - Math.sin(Math.atan2(endY - startY, endX - startX)) * 35,
          px,
          py,
        );
      },
      onComplete: () => {
        body.destroy();
        trail.destroy();
        this.drawImpact({ id: 0, x: endX, y: endY, weapon, hitNetworkId: 0, targetHealth: 0 });
        this.onPracticeImpact(endX, endY, weapon);
      },
    });
  }

  renderWorldEffects(projectiles: ProjectileState[], hazards: HazardState[]): void {
    const seenProjectiles = new Set<number>();
    for (const projectile of projectiles) {
      seenProjectiles.add(projectile.id);
      let visual = this.projectiles.get(projectile.id);
      if (!visual) {
        const rule = weaponFor(projectile.weapon);
        const color =
          projectile.weapon === WeaponKind.Rocket
            ? 0xff8952
            : rule.behavior === 'Lob'
              ? 0xe9ae66
              : projectile.weapon === WeaponKind.Mud
                ? 0x87634b
                : 0xffdf8e;
        const radius =
          projectile.weapon === WeaponKind.Rocket ? 13 : rule.behavior === 'Lob' ? 15 : 8;
        const body = this.scene.add
          .circle(projectile.x, projectile.y, radius, color)
          .setStrokeStyle(3, 0x2d3942)
          .setDepth(18);
        const shadow =
          rule.behavior === 'Lob'
            ? this.scene.add.circle(projectile.x, projectile.y, 17, 0x111d24, 0.45).setDepth(4)
            : undefined;
        const trail = this.scene.add.graphics().setDepth(17);
        visual = { body, shadow, trail };
        this.projectiles.set(projectile.id, visual);
      }
      const airborne =
        weaponFor(projectile.weapon).behavior === 'Lob'
          ? Math.sin((projectile.progress / 255) * Math.PI) * 130
          : 0;
      visual.trail.clear();
      if (weaponFor(projectile.weapon).behavior !== 'Lob') {
        const vx = projectile.x - visual.body.x;
        const vy = projectile.y - visual.body.y;
        if (Math.hypot(vx, vy) < 160) {
          visual.trail.lineStyle(
            projectile.weapon === WeaponKind.Rocket ? 11 : 4,
            projectile.weapon === WeaponKind.Mud ? 0xa48a68 : 0xffc777,
            0.6,
          );
          visual.trail.lineBetween(visual.body.x, visual.body.y, projectile.x, projectile.y);
        }
      }
      this.scene.tweens.killTweensOf(visual.body);
      this.scene.tweens.add({
        targets: visual.body,
        x: projectile.x,
        y: projectile.y - airborne,
        duration: 95,
        ease: 'Linear',
      });
      if (visual.shadow) {
        this.scene.tweens.killTweensOf(visual.shadow);
        this.scene.tweens.add({
          targets: visual.shadow,
          x: projectile.x,
          y: projectile.y,
          duration: 95,
          ease: 'Linear',
        });
      }
    }
    for (const [id, visual] of this.projectiles) {
      if (seenProjectiles.has(id)) continue;
      visual.body.destroy();
      visual.shadow?.destroy();
      visual.trail.destroy();
      this.projectiles.delete(id);
    }
    const seenHazards = new Set<number>();
    for (const hazard of hazards) {
      seenHazards.add(hazard.id);
      let puddle = this.hazards.get(hazard.id);
      if (!puddle) {
        puddle = this.scene.add
          .circle(hazard.x, hazard.y, 100, 0x684e3c, 0.62)
          .setStrokeStyle(4, 0xa0805e, 0.8)
          .setDepth(3);
        this.hazards.set(hazard.id, puddle);
      }
      puddle.setPosition(hazard.x, hazard.y).setAlpha(Math.min(0.65, hazard.remaining / 45));
    }
    for (const [id, puddle] of this.hazards) {
      if (seenHazards.has(id)) continue;
      puddle.destroy();
      this.hazards.delete(id);
    }
  }

  drawImpact(impact: ImpactEvent): void {
    const radius = Math.max(25, weaponFor(impact.weapon).blastRadius);
    const color =
      impact.weapon === WeaponKind.Mud
        ? 0x785440
        : impact.weapon === WeaponKind.Bullet
          ? 0xffe09a
          : 0xffa45e;
    const blast = this.scene.add
      .circle(impact.x, impact.y, radius, color, 0.55)
      .setStrokeStyle(5, 0xffe8ae, 0.85)
      .setDepth(17)
      .setScale(0.2);
    this.scene.tweens.add({
      targets: blast,
      scale: 1,
      alpha: 0,
      duration: 300,
      onComplete: () => blast.destroy(),
    });
    if (impact.weapon !== WeaponKind.Mud) {
      const sparkCount = impact.weapon === WeaponKind.Burst ? 4 : 9;
      for (let i = 0; i < sparkCount; i++) {
        const angle = (i / sparkCount) * Math.PI * 2;
        const spark = this.scene.add
          .circle(
            impact.x,
            impact.y,
            impact.weapon === WeaponKind.Bullet ? 3 : 6,
            i % 2 ? 0xffe2a2 : 0xff925c,
          )
          .setDepth(19);
        this.scene.tweens.add({
          targets: spark,
          x: impact.x + Math.cos(angle) * radius * 0.8,
          y: impact.y + Math.sin(angle) * radius * 0.8,
          alpha: 0,
          scale: 0.2,
          duration: 250 + (i % 3) * 60,
          onComplete: () => spark.destroy(),
        });
      }
    }
    if (impact.hitNetworkId) {
      const label = this.scene.add
        .text(
          impact.x,
          impact.y - 28,
          impact.targetHealth ? `${impact.targetHealth} HP` : 'HẠ GỤC',
          {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: '#ffe6a2',
            stroke: '#263746',
            strokeThickness: 4,
          },
        )
        .setOrigin(0.5)
        .setDepth(25);
      this.scene.tweens.add({
        targets: label,
        y: label.y - 28,
        alpha: 0,
        duration: 850,
        onComplete: () => label.destroy(),
      });
    }
  }

  drawShot(startX: number, startY: number, endX: number, endY: number, weapon: WeaponKind): void {
    const color =
      weapon === WeaponKind.Sniper ? 0xe0b8ff : weapon === WeaponKind.Pulse ? 0x8bffc4 : 0x9bedff;
    const beam = this.scene.add.graphics().setDepth(18);
    beam.lineStyle(14, color, 0.25).lineBetween(startX, startY, endX, endY);
    beam.lineStyle(6, color, 0.9).lineBetween(startX, startY, endX, endY);
    beam.lineStyle(2, 0xffffff, 1).lineBetween(startX, startY, endX, endY);
    this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 180,
      onComplete: () => beam.destroy(),
    });
    this.shotGraphics.fillStyle(0xffe4a2).fillCircle(endX, endY, 7);
    this.scene.time.delayedCall(150, () => this.shotGraphics.clear());
  }
}
