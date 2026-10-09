import assert from 'node:assert/strict';
import { stepMovement, quantizeInput } from '../src/game/network/Movement.ts';
import { Prediction } from '../src/game/network/Prediction.ts';
import { Interpolation } from '../src/game/network/Interpolation.ts';

const start = { x: 1100, y: 640, rotation: 0, aimAngle: 0,
  velocityX: 0, velocityY: 0, health: 100, status: 0 };
const right = quantizeInput({ moveX: 1, moveY: 0, aimAngle: 0 });
const first = stepMovement(start, right);
assert.ok(first.x > start.x && first.velocityX > 0 && first.velocityX < 280);
let running = start;
for (let i = 0; i < 20; i++) running = stepMovement(running, right);
assert.ok(running.velocityX <= 280 && running.velocityX > 270);
assert.ok(running.x - start.x < 280 * 20 / 30);
const wallStart = { ...start, x: 800, y: 900, velocityX: 280 };
let wall = wallStart;
for (let i = 0; i < 8; i++) wall = stepMovement(wall, right);
assert.ok(wall.x < 812 && wall.velocityX === 0);
const slowed = stepMovement({ ...start, status: 1, velocityX: 126 }, right);
assert.equal(slowed.velocityX, 126);

const prediction = new Prediction();
prediction.reconcile(start, 0, 100);
prediction.predict(1, 1, right, 110);
prediction.predict(2, 2, right, 143);
assert.ok(prediction.state.x > first.x);
prediction.reconcile(first, 1, 190);
const replayed = stepMovement(first, right);
assert.ok(Math.abs(prediction.state.x - replayed.x) < 0.001);
assert.ok(prediction.ackLatencyMs >= 80);
assert.ok(prediction.correctionUnits < 1);
prediction.reconcile({ ...start, x: 1700 }, 2, 220);
assert.equal(prediction.state.x, 1700);
assert.equal(prediction.hardReset, true);
prediction.clear();
assert.equal(prediction.state, null);

const player = (x, tick) => ({ playerId: 'other', networkId: 2, username: 'other',
  x, y: 640, rotation: tick * .1, aimAngle: 0, health: 100, status: 0,
  velocityX: 100, velocityY: 0 });
const interpolation = new Interpolation();
interpolation.push(100, [player(100, 100)], 1000);
interpolation.push(103, [player(130, 103)], 1100);
assert.equal(interpolation.sample('other', 1100).x, 100);
assert.ok(Math.abs(interpolation.sample('other', 1150).x - 115) < 0.01);
assert.equal(interpolation.sample('other', 1200).x, 130);
interpolation.push(106, [player(500, 106)], 1200);
assert.equal(interpolation.sample('other', 1250).x, 500);
interpolation.push(109, [], 1300);
assert.equal(interpolation.sample('other', 1350), null);
console.log('PASS: fixed-tick acceleration/collision, prediction replay/correction, remote interpolation and visibility');
