import assert from 'node:assert/strict';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import { decodeSnapshot, encodeInput } from '../src/game/network/BinaryGameCodec.ts';

const base = process.env.GAME_API_URL ?? 'http://127.0.0.1:5080';
const suffix = Date.now().toString(36);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 4000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(35);
  }
  throw new Error('Timed out waiting for authoritative movement');
}
const response = await fetch(`${base}/api/auth/register`, { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: `mv_${suffix}`, password: 'movement-test-password' }) });
assert.equal(response.status, 200);
const account = await response.json();
const connection = new HubConnectionBuilder()
  .withUrl(`${base}/hubs/game`, { accessTokenFactory: () => account.accessToken })
  .withHubProtocol(new MessagePackHubProtocol()).configureLogging(LogLevel.Error).build();
const snapshots = [];
connection.on('Snapshot', (payload) => {
  const snapshot = decodeSnapshot(payload);
  if (snapshot) snapshots.push(snapshot);
});
try {
  await connection.start();
  const joined = await connection.invoke('JoinMatch');
  assert.equal(Number(joined.ProtocolVersion ?? joined.protocolVersion ?? joined[0]), 5);
  await waitFor(() => snapshots.length > 0);
  const id = snapshots.at(-1).players[0].networkId;
  const own = () => snapshots.at(-1).players.find((player) => player.networkId === id);
  const startY = own().y;
  for (let sequence = 1; sequence <= 28; sequence++) {
    await connection.send('InputBatch', encodeInput(sequence, 0, 1, Math.PI / 2));
    await sleep(33);
  }
  await waitFor(() => snapshots.at(-1)?.lastProcessedSequence === 28);
  await sleep(350);
  assert.ok(own().y > startY + 80 && own().y <= 792, JSON.stringify(own()));
  assert.ok(Math.hypot(own().velocityX, own().velocityY) <= 281);
  assert.equal(own().velocityY, 0, 'wall cancels velocity');
  const atWall = own().y;
  await connection.send('InputBatch', encodeInput(27, 0, -1, 0));
  const invalid = encodeInput(29, 0, -1, 0);
  invalid[10] = 128;
  await connection.send('InputBatch', invalid);
  await connection.send('InputBatch', encodeInput(30, 0, -1, 0, 1));
  await sleep(300);
  assert.equal(snapshots.at(-1).lastProcessedSequence, 28);
  assert.ok(Math.abs(own().y - atWall) < 0.1);
  await connection.send('InputBatch', encodeInput(29, 0, -1, 0));
  await waitFor(() => snapshots.at(-1)?.lastProcessedSequence === 29);
  await waitFor(() => own().y < atWall - 2);
  await sleep(650);
  assert.equal(own().velocityY, 0, 'stale movement input must brake');
  console.log('PASS: server acceleration/speed, wall collision, stale input braking, sequence/clientTick validation and per-viewer acknowledgement');
} finally {
  await connection.stop();
}
