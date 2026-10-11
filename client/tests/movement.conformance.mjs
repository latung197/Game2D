import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { quantizeInput, stepMovement } from '../src/game/network/Movement.ts';

const inputs = [];
const add = (count, moveX, moveY, aimAngle) => {
  for (let index = 0; index < count; index++)
    inputs.push(quantizeInput({ moveX, moveY, aimAngle }));
};
add(30, 1, 0, 0);
add(35, 0, 1, Math.PI / 2);
add(25, -1, 0, Math.PI);
add(45, 0, -1, -Math.PI / 2);
add(20, 1, 1, Math.PI / 4);
add(12, 0, 0, 0);
add(70, 1, 0, 0);

const project = '../tests/Game.MovementProbe/Game.MovementProbe.csproj';
const cwd = new URL('..', import.meta.url);
const build = spawnSync('dotnet', ['build', project], { encoding: 'utf8', cwd });
assert.equal(build.status, 0, build.stderr || build.stdout);
const run = spawnSync('dotnet', [
  'run', '--no-build', '--no-restore', '--project',
  project,
], { input: JSON.stringify(inputs), encoding: 'utf8', cwd });
assert.equal(run.status, 0, run.stderr || run.stdout);
const serverStates = JSON.parse(run.stdout);
assert.equal(serverStates.length, inputs.length + 1);

let client = {
  x: 1100, y: 640, rotation: 0, aimAngle: 0,
  velocityX: 0, velocityY: 0, health: 100, status: 0,
};
let largestDifference = 0;
let blockedTicks = 0;
for (let index = 0; index < serverStates.length; index++) {
  if (index > 0) client = stepMovement(client, inputs[index - 1]);
  const server = serverStates[index];
  if (index > 0 && ((inputs[index - 1].moveX && server.VelocityX === 0) ||
    (inputs[index - 1].moveY && server.VelocityY === 0))) blockedTicks++;
  for (const [clientKey, serverKey] of [
    ['x', 'X'], ['y', 'Y'], ['velocityX', 'VelocityX'],
    ['velocityY', 'VelocityY'], ['rotation', 'Rotation'],
  ]) {
    const difference = Math.abs(client[clientKey] - server[serverKey]);
    largestDifference = Math.max(largestDifference, difference);
    assert.ok(difference < 0.04,
      `Tick ${index} ${clientKey}: client ${client[clientKey]}, server ${server[serverKey]}`);
  }
}
assert.ok(blockedTicks > 0, 'scenario must include a collision');
console.log(`PASS: ${inputs.length} movement ticks match C# and TypeScript, including ${blockedTicks} blocked ticks; max difference ${largestDifference.toFixed(4)}`);
