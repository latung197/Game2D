import assert from 'node:assert/strict';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import { decodeSnapshot, encodeFire, WeaponKind } from '../src/game/network/BinaryGameCodec.ts';

const base = process.env.GAME_API_URL ?? 'http://127.0.0.1:5080';
const suffix = Date.now().toString(36);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const field = (value, name, index) => Array.isArray(value) ? value[index] : value[name] ?? value[name[0].toLowerCase() + name.slice(1)];
async function waitFor(predicate, label, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (predicate()) return; await sleep(50); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function request(user, path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${user.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: response.status === 204 || response.status === 404 ? null : await response.json() };
}
async function register(index) {
  const response = await fetch(`${base}/api/auth/register`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: `match_${suffix}_${index}`, password: 'match-test-password' }) });
  assert.equal(response.status, 200);
  return response.json();
}
function connect(user) {
  const connection = new HubConnectionBuilder().withUrl(`${base}/hubs/game`,
    { accessTokenFactory: () => user.accessToken }).withHubProtocol(new MessagePackHubProtocol())
    .configureLogging(LogLevel.Error).build();
  const state = { connection, snapshots: [], zones: [], results: [] };
  connection.on('Snapshot', (payload) => { const snapshot = decodeSnapshot(payload); if (snapshot) state.snapshots.push(snapshot); });
  connection.on('ZoneState', (zone) => { state.zones.push(zone); });
  connection.on('MatchEnded', (result) => { state.results.push(result); });
  return state;
}

const users = await Promise.all([0, 1, 2].map(register));
const clients = users.slice(0, 2).map(connect);
try {
  const created = await request(users[0], '/api/rooms/', 'POST', { name: `Match ${suffix}` });
  assert.equal(created.status, 200);
  const id = created.body.id;
  assert.equal((await request(users[1], `/api/rooms/${id}/join`, 'POST')).status, 200);
  assert.equal((await request(users[0], `/api/rooms/${id}/start`, 'POST')).body.state, 'Playing');
  for (const client of clients) {
    await client.connection.start();
    await client.connection.invoke('JoinMatch', id);
  }
  await waitFor(() => clients.every((client) => client.zones.length > 0 &&
    client.snapshots.at(-1)?.players.length === 2), 'initial zone and players');
  assert.equal(field(clients[0].zones[0], 'Stage', 1), 'Warning');
  for (let shot = 0; shot < 4; shot++) {
    await clients[0].connection.send('Fire', encodeFire(WeaponKind.Laser, 2800));
    await sleep(480);
  }
  await waitFor(() => clients.every((client) => client.results.length === 1), 'match result');
  const result = clients[0].results[0];
  assert.equal(field(result, 'WinnerId', 1), users[0].playerId);
  const players = field(result, 'Players', 4);
  assert.equal(players.length, 2);
  assert.equal(field(players.find((player) => field(player, 'PlayerId', 0) === users[0].playerId), 'Placement', 2), 1);
  let saved;
  for (let attempt = 0; attempt < 40; attempt++) {
    saved = await request(users[0], `/api/matches/${id}`);
    if (saved.status === 200) break;
    await sleep(100);
  }
  assert.equal(saved.status, 200);
  assert.equal(saved.body.winnerId, users[0].playerId);
  assert.equal((await request(users[1], `/api/matches/${id}`)).status, 200);
  assert.equal((await request(users[2], `/api/matches/${id}`)).status, 404);
  assert.equal((await request(users[0], '/api/rooms/current')).body.state, 'Finished');
  await sleep(350);
  assert.ok(clients.every((client) => client.results.length === 1), 'result broadcasts once');
  console.log('PASS: zone broadcast, two-player winner, one result event, persisted history and participant access');
} finally {
  await Promise.all(clients.map(async ({ connection }) => {
    try { await connection.stop(); } catch { /* connection may already be closed */ }
  }));
}
