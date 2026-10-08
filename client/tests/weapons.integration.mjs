import assert from 'node:assert/strict';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import { decodeImpact, decodeSnapshot, encodeFire, encodeInput, WeaponKind } from '../src/game/network/BinaryGameCodec.ts';

const base = process.env.GAME_API_URL ?? 'http://127.0.0.1:5080';
const suffix = Date.now().toString(36);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (predicate()) return; await sleep(40); }
  throw new Error('Timed out waiting for weapon state');
}
async function register(name) {
  const response = await fetch(`${base}/api/auth/register`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'weapons-test-password' }) });
  if (!response.ok) throw new Error(`Register failed: ${response.status}`);
  return response.json();
}
function field(value, pascal, camel, index) { return value[pascal] ?? value[camel] ?? value[index]; }

const accounts = await Promise.all([register(`wp_a_${suffix}`), register(`wp_b_${suffix}`)]);
const connections = [];
const latest = [null, null];
const snapshots = [[], []];
const impacts = [[], []];
let ids;
try {
  for (let i = 0; i < 2; i++) {
    const connection = new HubConnectionBuilder()
      .withUrl(`${base}/hubs/game`, { accessTokenFactory: () => accounts[i].accessToken })
      .withHubProtocol(new MessagePackHubProtocol()).configureLogging(LogLevel.Error).build();
    connection.on('Snapshot', (payload) => {
      latest[i] = decodeSnapshot(payload);
      if (latest[i]) snapshots[i].push(latest[i]);
    });
    connection.on('Impact', (payload) => {
      assert.equal(payload.byteLength, 12);
      const impact = decodeImpact(payload);
      if (impact) impacts[i].push(impact);
    });
    await connection.start();
    const joined = await connection.invoke('JoinMatch');
    assert.equal(Number(field(joined, 'ProtocolVersion', 'protocolVersion', 0)), 4);
    if (i === 1) {
      const roster = field(joined, 'Players', 'players', 3);
      ids = accounts.map((account) => Number(field(
        roster.find((player) => field(player, 'PlayerId', 'playerId', 1) === account.playerId),
        'NetworkId', 'networkId', 0)));
    }
    connections.push(connection);
  }
  const health = (viewer, id) => latest[viewer]?.players.find((p) => p.networkId === id)?.health;
  await waitFor(() => latest.every((snapshot) => snapshot?.players.length === 2));
  await connections[0].send('InputBatch', encodeInput(1, 0, 0, 0));
  await sleep(80);
  await connections[0].send('Fire', Uint8Array.of(4, 5, 7, 0, 0));
  await sleep(100);
  assert.equal(impacts[0].length, 0);

  await connections[0].send('Fire', encodeFire(WeaponKind.Bullet, 1800));
  await waitFor(() => impacts[1].some((p) => p.weapon === WeaponKind.Bullet && p.hitNetworkId === ids[1]));
  await waitFor(() => health(1, ids[1]) === 75);

  await connections[0].send('InputBatch', encodeInput(2, 0, 0, Math.PI));
  await sleep(260);
  await connections[0].send('Fire', encodeFire(WeaponKind.Bullet, 1800));
  await waitFor(() => snapshots[0].some((s) => s.projectiles.some((p) => p.weapon === WeaponKind.Bullet && p.x < 1050)));
  await connections[0].send('InputBatch', encodeInput(3, 0, 0, 0));
  await sleep(400);
  await connections[0].send('Fire', encodeFire(WeaponKind.Rocket, 2200));
  await waitFor(() => impacts[1].some((p) => p.weapon === WeaponKind.Rocket));
  await waitFor(() => health(1, ids[1]) === 35 && health(0, ids[0]) === 60);

  await sleep(1030);
  await connections[0].send('Fire', encodeFire(WeaponKind.Artillery, 80));
  await waitFor(() => snapshots[0].some((s) => s.projectiles.some((p) =>
    p.weapon === WeaponKind.Artillery && p.progress > 0 && p.progress < 255)));
  await waitFor(() => impacts[1].some((p) => p.weapon === WeaponKind.Artillery));
  await waitFor(() => health(1, ids[1]) === 0 && health(0, ids[0]) === 15);
  await waitFor(() => health(1, ids[1]) === 100, 4500);

  await connections[0].send('Fire', encodeFire(WeaponKind.Mud, 1200));
  await waitFor(() => impacts[1].some((p) => p.weapon === WeaponKind.Mud));
  await waitFor(() => latest[1]?.hazards.length > 0 &&
    latest[1]?.players.find((p) => p.networkId === ids[1])?.status === 1);
  const beforeSlow = latest[1].players.find((p) => p.networkId === ids[1]).x;
  await connections[1].send('InputBatch', encodeInput(1, 1, 0, 0));
  await sleep(400);
  await connections[1].send('InputBatch', encodeInput(2, 0, 0, 0));
  await sleep(120);
  const afterSlow = latest[1].players.find((p) => p.networkId === ids[1]).x;
  assert.ok(afterSlow - beforeSlow < 80 && afterSlow - beforeSlow > 15);
  await waitFor(() => latest[1]?.hazards.length === 0 &&
    latest[1]?.players.find((p) => p.networkId === ids[1])?.status === 0, 5000);
  await connections[1].send('InputBatch', encodeInput(3, 1, 0, 0));
  await sleep(420);
  await connections[1].send('InputBatch', encodeInput(4, 0, 0, 0));
  await sleep(120);
  const afterNormal = latest[1].players.find((p) => p.networkId === ids[1]).x;
  assert.ok(afterNormal - afterSlow > 80);
  console.log('PASS: bullet trajectory, rocket splash, artillery arc, mud puddle/slow, impact binary and server damage');
} finally {
  await Promise.all(connections.map((connection) => connection.stop()));
}
