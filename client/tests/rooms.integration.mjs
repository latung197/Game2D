import assert from 'node:assert/strict';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import { decodeSnapshot, encodeFire, encodeInput, WeaponKind } from '../src/game/network/BinaryGameCodec.ts';

const base = process.env.GAME_API_URL ?? 'http://127.0.0.1:5080';
const suffix = Date.now().toString(36);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 5000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error('Timed out waiting for room state');
}
async function register(index) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: `room_${suffix}_${index}`, password: 'room-test-password' }),
  });
  if (response.status !== 200) throw new Error(`Register failed ${response.status}: ${await response.text()}`);
  return response.json();
}
async function api(user, path, method = 'GET', body) {
  const response = await fetch(`${base}/api/rooms${path}`, {
    method,
    headers: { authorization: `Bearer ${user.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
function client(user) {
  const connection = new HubConnectionBuilder()
    .withUrl(`${base}/hubs/game`, { accessTokenFactory: () => user.accessToken })
    .withHubProtocol(new MessagePackHubProtocol()).configureLogging(LogLevel.Error).build();
  const snapshots = [];
  const shots = [];
  connection.on('Snapshot', (payload) => { const snapshot = decodeSnapshot(payload); if (snapshot) snapshots.push(snapshot); });
  connection.on('Shot', (payload) => { shots.push(payload); });
  return { connection, snapshots, shots };
}

const users = await Promise.all([0, 1, 2, 3, 4].map(register));
const clients = users.slice(0, 4).map(client);
try {
  const invalidCapacity = await api(users[4], '/', 'POST', { name: 'Phòng sai cỡ', capacity: 17 });
  assert.equal(invalidCapacity.status, 400);
  const a = await api(users[0], '/', 'POST', { name: 'Phòng lái xe A', capacity: 25 });
  const b = await api(users[2], '/', 'POST', { name: 'Phòng lái xe B', capacity: 5 });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.capacity, 25);
  assert.equal(b.body.capacity, 5);
  assert.notEqual(a.body.id, b.body.id);
  assert.equal(a.body.state, 'Waiting');
  assert.equal((await api(users[1], `/${a.body.id}/join`, 'POST')).status, 200);
  assert.equal((await api(users[3], `/${b.body.id}/join`, 'POST')).status, 200);
  assert.equal((await api(users[1], `/${a.body.id}/start`, 'POST')).status, 409, 'only host can start');
  assert.equal((await api(users[0], `/${a.body.id}/start`, 'POST')).body.state, 'Playing');
  assert.equal((await api(users[2], `/${b.body.id}/start`, 'POST')).body.state, 'Playing');
  assert.equal((await api(users[4], `/${a.body.id}/join`, 'POST')).status, 409, 'normal room rejects late join');

  for (let index = 0; index < 4; index++) {
    await clients[index].connection.start();
    const roomId = index < 2 ? a.body.id : b.body.id;
    const accepted = await clients[index].connection.invoke('JoinMatch', roomId);
    assert.equal(accepted.MatchId ?? accepted.matchId ?? accepted[1], roomId);
  }
  await waitFor(() => clients.every((entry) => entry.snapshots.at(-1)?.players.length === 2));
  await assert.rejects(clients[0].connection.invoke('JoinMatch', b.body.id),
    'a connection must not switch from room A to room B');
  const aIds = new Set((clients[1].snapshots.at(-1).players).map((player) => player.networkId));
  const bIds = new Set((clients[3].snapshots.at(-1).players).map((player) => player.networkId));
  assert.equal(aIds.size, 2);
  assert.equal(bIds.size, 2);

  const bPositions = clients.slice(2).map((entry) => entry.snapshots.at(-1).players.map((player) => [player.x, player.y]));
  for (let sequence = 1; sequence <= 15; sequence++) {
    await clients[0].connection.send('InputBatch', encodeInput(sequence, 1, 0, 0, sequence));
    await sleep(33);
  }
  await waitFor(() => clients[0].snapshots.at(-1)?.lastProcessedSequence === 15);
  for (let index = 2; index < 4; index++) {
    const latest = clients[index].snapshots.at(-1).players.map((player) => [player.x, player.y]);
    assert.deepEqual(latest, bPositions[index - 2], 'room B must not receive room A movement');
  }
  await clients[0].connection.send('Fire', encodeFire(WeaponKind.Laser, 500));
  await waitFor(() => clients[0].shots.length > 0 && clients[1].shots.length > 0);
  await sleep(200);
  assert.equal(clients[2].shots.length, 0, 'room B must not receive room A shot');
  assert.equal(clients[3].shots.length, 0, 'room B must not receive room A shot');
  assert.equal((await api(users[3], `/${b.body.id}/finish`, 'POST')).status, 409);
  assert.equal((await api(users[2], `/${b.body.id}/finish`, 'POST')).body.state, 'Finished');
  assert.equal((await api(users[3], '/current')).body.state, 'Finished');

  await clients[0].connection.stop();
  for (let attempt = 0; attempt < 3; attempt++) {
    const rejoined = client(users[0]);
    await rejoined.connection.start();
    const roster = await rejoined.connection.invoke('JoinMatch', a.body.id);
    assert.equal((roster.Players ?? roster.players ?? roster[3]).length, 2);
    await waitFor(() => rejoined.snapshots.at(-1)?.players.length === 2);
    const restored = rejoined.snapshots.at(-1).players.find((player) => player.networkId === 1);
    assert.ok(restored.x > 1150, 'reconnect should preserve the authoritative position');
    await rejoined.connection.stop();
  }
  const leave = await api(users[0], `/${a.body.id}`, 'DELETE');
  assert.equal(leave.status, 200);
  assert.equal(leave.body.hostId, users[1].playerId, 'host transfers to remaining member');
  assert.equal((await api(users[0], `/${a.body.id}/join`, 'POST')).status, 409);
  const quick = await api(users[4], '/quick', 'POST');
  assert.equal(quick.status, 200);
  assert.equal(quick.body.state, 'Playing');
  assert.equal(quick.body.isQuick, true);
  assert.equal((await api(users[0], `/${quick.body.id}/join`, 'POST')).status, 200);
  console.log('PASS: host control, two isolated rooms, movement/shot routing, finish, reconnect, host transfer and quick join');
} finally {
  await Promise.all(clients.map(async (entry) => {
    try { await entry.connection.stop(); } catch { /* already stopped */ }
  }));
}
