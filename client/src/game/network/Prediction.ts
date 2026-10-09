import { quantizeInput, stepMovement, type MovementInput, type MovementState } from './Movement.ts';

type PendingInput = MovementInput & { sequence: number; clientTick: number; sentAt: number };

export class Prediction {
  state: MovementState | null = null;
  private pending: PendingInput[] = [];
  ackLatencyMs = 0;
  correctionUnits = 0;
  hardReset = false;

  predict(sequence: number, clientTick: number, input: MovementInput, now: number): MovementInput {
    const quantized = quantizeInput(input);
    if (!this.state) return quantized;
    this.pending.push({ sequence, clientTick, ...quantized, sentAt: now });
    if (this.pending.length > 120) this.pending.shift();
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
      !before || before.health !== authoritative.health || this.correctionUnits > 100;
    this.state = replayed;
  }

  clear(): void {
    this.state = null;
    this.pending = [];
    this.ackLatencyMs = 0;
    this.correctionUnits = 0;
    this.hardReset = false;
  }
}
