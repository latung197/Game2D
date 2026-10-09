import assert from 'node:assert/strict';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import {
  decodeSnapshot,
  decodeShot,
  decodeRadar,
  encodeInput,
  encodeFire,
  WeaponKind,
  SNAPSHOT_HEADER_BYTES,
  PLAYER_BYTES,
} from '../src/game/network/BinaryGameCodec.ts';

const base = process.env.GAME_API_URL ?? 'http://127.0.0.1:5080';
const suffix = Date.now().toString(36);

async function register(name) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'binary-test-password' }),
  });
  if (!response.ok) throw new Error(`Register failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function waitFor(predicate, timeout = 4000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for binary snapshot');
}

function rosterOf(value) {
  return value.Players ?? value.players ?? value[3];
}
function field(value, pascal, camel, index) {
  return value[pascal] ?? value[camel] ?? value[index];
}

const accounts = await Promise.all([register(`bin_a_${suffix}`), register(`bin_b_${suffix}`)]);
const connections = [];
const snapshots = [null, null];
const snapshotTimes = [[], []];
const payloadLengths = [];
const shots = [[], []];
let playerIds = [];

try {
  for (let i = 0; i < 2; i++) {
    const connection = new HubConnectionBuilder()
      .withUrl(`${base}/hubs/game`, { accessTokenFactory: () => accounts[i].accessToken })
      .withHubProtocol(new MessagePackHubProtocol())
      .configureLogging(LogLevel.Error)
      .build();
    connection.on('Snapshot', (payload) => {
      snapshots[i] = decodeSnapshot(payload);
      snapshotTimes[i].push(Date.now());
      payloadLengths.push(payload.byteLength);
    });
    connection.on('Shot', (payload) => {
      assert.equal(payload.byteLength, 15);
      const shot = decodeShot(payload);
      if (shot) shots[i].push(shot);
    });
    await connection.start();
    const joined = await connection.invoke('JoinMatch');
    assert.equal(Number(field(joined, 'ProtocolVersion', 'protocolVersion', 0)), 5);
    if (i === 1) {
      const roster = rosterOf(joined);
      playerIds = accounts.map((account) => {
        const player = roster.find((p) => field(p, 'PlayerId', 'playerId', 1) === account.playerId);
        assert.ok(player);
        return Number(field(player, 'NetworkId', 'networkId', 0));
      });
    }
    connections.push(connection);
  }

  await waitFor(() => snapshots.every((snapshot) => snapshot?.players.length === 2));
  const initial = snapshots[0].players.find((player) => player.networkId === playerIds[0]);
  assert.ok(initial);

  await connections[0].send('InputBatch', encodeInput(1, 0, 0, 0));
  await new Promise((resolve) => setTimeout(resolve, 100));
  await connections[0].send('Fire', encodeFire(WeaponKind.Laser, 2800));
  await waitFor(() => shots.every((list) => list.length > 0));
  assert.equal(shots[1][0].hitNetworkId, playerIds[1]);
  await waitFor(() => snapshots[1]?.players.find((p) => p.networkId === playerIds[1])?.health === 75);
  await connections[0].send('Fire', encodeFire(WeaponKind.Laser, 2800));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(snapshots[1].players.find((p) => p.networkId === playerIds[1]).health, 75);
  for (const expected of [50, 25, 0]) {
    await new Promise((resolve) => setTimeout(resolve, 430));
    await connections[0].send('Fire', encodeFire(WeaponKind.Laser, 2800));
    await waitFor(() => snapshots[1]?.players.find((p) => p.networkId === playerIds[1])?.health === expected);
  }
  const beforeDeadMove = snapshots[1].players.find((p) => p.networkId === playerIds[1]).x;
  await connections[1].send('InputBatch', encodeInput(1, 1, 0, Math.PI));
  await connections[1].send('Fire', encodeFire(WeaponKind.Laser, 2800));
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(snapshots[1].players.find((p) => p.networkId === playerIds[1]).x, beforeDeadMove);
  assert.equal(shots[1].length, 4);
  await waitFor(() => snapshots[1]?.players.find((p) => p.networkId === playerIds[1])?.health === 100, 4500);

  const malformed = new Uint8Array([...encodeInput(1, 1, 0, 0), 255]);
  await connections[0].send('InputBatch', malformed);
  for (let sequence = 2; sequence <= 9; sequence++) {
    await connections[0].send('InputBatch', encodeInput(sequence, 1, 0, 0));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await waitFor(
    () => snapshots[1]?.players.find((p) => p.networkId === playerIds[0])?.x > initial.x,
  );
  const moved = snapshots[1].players.find((p) => p.networkId === playerIds[0]);
  const other = snapshots[1].players.find((p) => p.networkId === playerIds[1]);
  assert.ok(moved.x < 1300 && moved.y === 640);
  assert.equal(other.y, 640);

  assert.ok(shots[1][0].endX > shots[1][0].startX);
  assert.ok(shots[1][0].endX <= 3200);

  await connections[0].send('InputBatch', encodeInput(10, 0, 0, 0));
  await new Promise((resolve) => setTimeout(resolve, 350));
  const stoppedX = snapshots[1].players.find((p) => p.networkId === playerIds[0]).x;
  await connections[0].send('InputBatch', encodeInput(9, -1, 0, 0));
  const badAxis = encodeInput(11, 1, 0, 0);
  badAxis[10] = 128;
  await connections[0].send('InputBatch', badAxis);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(snapshots[1].players.find((p) => p.networkId === playerIds[0]).x, stoppedX);
  assert.ok(
    payloadLengths.every(
      (length) =>
        length === SNAPSHOT_HEADER_BYTES + PLAYER_BYTES * 2 ||
        length === SNAPSHOT_HEADER_BYTES + PLAYER_BYTES,
    ),
  );

  const intervals = snapshotTimes[1].slice(1).map((time, index) => time - snapshotTimes[1][index]);
  const averageMs = intervals.reduce((sum, ms) => sum + ms, 0) / intervals.length;
  assert.ok(averageMs >= 60 && averageMs <= 180);

  for (let sequence = 2; sequence <= 6; sequence++) {
    await connections[1].send('InputBatch', encodeInput(sequence, 1, 0, 0));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  for (let sequence = 7; sequence <= 21; sequence++) {
    await connections[1].send('InputBatch', encodeInput(sequence, 0, -1, 0));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await connections[1].send('InputBatch', encodeInput(22, 0, 0, 0));
  let steerSequence = 22;
  for (let attempt = 0; attempt < 20; attempt++) {
    const position = snapshots[1]?.players.find((p) => p.networkId === playerIds[1]);
    assert.ok(position);
    if (Math.hypot(position.x - 1260, position.y - 430) < 25) break;
    const dx = 1260 - position.x;
    const dy = 430 - position.y;
    await connections[1].send('InputBatch', encodeInput(++steerSequence,
      Math.abs(dx) > 15 ? Math.sign(dx) : 0,
      Math.abs(dy) > 15 ? Math.sign(dy) : 0, 0));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  await connections[1].send('InputBatch', encodeInput(++steerSequence, 0, 0, 0));
  await waitFor(() => !snapshots[0]?.players.some((p) => p.networkId === playerIds[1]));
  assert.ok(snapshots[1]?.players.some((p) => p.networkId === playerIds[1]));
  const radar = decodeRadar(await connections[0].invoke('UseRadar'));
  assert.ok(radar?.activeTicks > 0 && radar?.cooldownTicks > radar.activeTicks);
  await waitFor(() => snapshots[0]?.players.some((p) => p.networkId === playerIds[1]));
  const repeatedRadar = decodeRadar(await connections[0].invoke('UseRadar'));
  assert.ok(repeatedRadar.cooldownTicks < radar.cooldownTicks);

  await connections[0].stop();
  await waitFor(() => snapshots[1]?.players.length === 1);
  const reconnected = new HubConnectionBuilder()
    .withUrl(`${base}/hubs/game`, { accessTokenFactory: () => accounts[0].accessToken })
    .withHubProtocol(new MessagePackHubProtocol())
    .configureLogging(LogLevel.Error)
    .build();
  await reconnected.start();
  connections.push(reconnected);
  await reconnected.invoke('JoinMatch');
  const afterReconnectRadar = decodeRadar(await reconnected.invoke('UseRadar'));
  assert.ok(afterReconnectRadar.cooldownTicks < radar.cooldownTicks);
  await waitFor(() => snapshots[1]?.players.length === 2);
  await reconnected.stop();
  await waitFor(() => snapshots[1]?.players.length === 1);
  console.log(
    `PASS: v5 binary ${SNAPSHOT_HEADER_BYTES + PLAYER_BYTES * 2}-byte snapshots, 15-byte laser shots, damage/death/respawn, server stealth/radar, reconnect; ${(1000 / averageMs).toFixed(1)} snapshots/s`,
  );
} finally {
  await Promise.all(connections.map((connection) => connection.stop()));
}
