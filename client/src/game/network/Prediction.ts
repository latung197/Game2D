import {
  interpolateMovement,
  quantizeInput,
  stepMovement,
  type MovementInput,
  type MovementState,
} from './Movement.ts';

type PendingInput = MovementInput & { sequence: number; clientTick: number; sentAt: number };

export class Prediction {
  state: MovementState | null = null;
  private previousState: MovementState | null = null;
  private pending: PendingInput[] = [];
  private visualOffsetX = 0;
  private visualOffsetY = 0;
  private visualOffsetRotation = 0;
  private presentedAt = 0;
  ackLatencyMs = 0;
  correctionUnits = 0;
  hardReset = false;

  predict(sequence: number, clientTick: number, input: MovementInput, now: number): MovementInput {
    const quantized = quantizeInput(input);
    if (!this.state) return quantized;
    this.pending.push({ sequence, clientTick, ...quantized, sentAt: now });
    if (this.pending.length > 120) this.pending.shift();
    this.previousState = this.state;
    this.state = stepMovement(this.state, quantized);
    return quantized;
  }

  reconcile(authoritative: MovementState, acknowledgedSequence: number, now: number): void {
    const before = this.state;
    const acknowledged = this.pending.filter(
      (input) => (acknowledgedSequence - input.sequence) >>> 0 < 0x80000000,
    );
    if (acknowledged.length) {
      const latency = now - acknowledged.at(-1)!.sentAt;
      this.ackLatencyMs = this.ackLatencyMs ? this.ackLatencyMs * 0.8 + latency * 0.2 : latency;
    }
    this.pending = this.pending.filter(
      (input) => (acknowledgedSequence - input.sequence) >>> 0 >= 0x80000000,
    );
    let replayed = { ...authoritative };
    for (const input of this.pending) replayed = stepMovement(replayed, input);
    this.correctionUnits = before ? Math.hypot(before.x - replayed.x, before.y - replayed.y) : 0;
    this.hardReset =
      this.hardReset ||
      !before ||
      before.health !== authoritative.health ||
      this.correctionUnits > 100;
    if (this.hardReset || !before) {
      this.visualOffsetX = 0;
      this.visualOffsetY = 0;
      this.visualOffsetRotation = 0;
    } else {
      this.visualOffsetX += before.x - replayed.x;
      this.visualOffsetY += before.y - replayed.y;
      this.visualOffsetRotation += Math.atan2(
        Math.sin(before.rotation - replayed.rotation),
        Math.cos(before.rotation - replayed.rotation),
      );
    }
    this.previousState = replayed;
    this.state = replayed;
  }

  presentation(alpha: number, now = performance.now()): MovementState | null {
    if (!this.state) return null;
    if (this.presentedAt) {
      const decay = Math.exp(-Math.max(0, Math.min(100, now - this.presentedAt)) / 120);
      this.visualOffsetX *= decay;
      this.visualOffsetY *= decay;
      this.visualOffsetRotation *= decay;
    }
    this.presentedAt = now;
    const base = this.previousState
      ? interpolateMovement(this.previousState, this.state, alpha)
      : this.state;
    return {
      ...base,
      x: base.x + this.visualOffsetX,
      y: base.y + this.visualOffsetY,
      rotation: base.rotation + this.visualOffsetRotation,
    };
  }

  clear(): void {
    this.state = null;
    this.previousState = null;
    this.pending = [];
    this.visualOffsetX = 0;
    this.visualOffsetY = 0;
    this.visualOffsetRotation = 0;
    this.presentedAt = 0;
    this.ackLatencyMs = 0;
    this.correctionUnits = 0;
    this.hardReset = false;
  }
}
