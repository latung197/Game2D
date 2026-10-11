import assert from 'node:assert/strict';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import { decodeSnapshot, encodeFire, encodeInput, WeaponKind } from '../src/game/network/BinaryGameCodec.ts';

const base = process.env.GAME_API_URL ?? 'http://127.0.0.1:5080';
const suffix = Date.now().toString(36);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const field = (value, name, index) => Array.isArray(value) ? value[index] : value[name] ?? value[name[0].toLowerCase() + name.slice(1)];
async function waitFor(predicate, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (predicate()) return; await sleep(40); }
  throw new Error('Timed out waiting for loot state');
}
async function register(username) {
  const response = await fetch(`${base}/api/auth/register`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'loot-test-password' }) });
  assert.equal(response.status, 200);
  return response.json();
}

const accounts = await Promise.all([register(`loot_a_${suffix}`), register(`loot_b_${suffix}`)]);
const connections = [];
const items = [[], []];
const pickups = [[], []];
const inventories = [[], []];
const latest = [null, null];
try {
  for (let i = 0; i < 2; i++) {
    const connection = new HubConnectionBuilder()
      .withUrl(`${base}/hubs/game`, { accessTokenFactory: () => accounts[i].accessToken })
      .withHubProtocol(new MessagePackHubProtocol()).configureLogging(LogLevel.Error).build();
    connection.on('WorldItems', (snapshot) => { items[i].push(snapshot); });
    connection.on('ItemPicked', (event) => { pickups[i].push(event); });
    connection.on('InventoryChanged', (event) => { inventories[i].push(event); });
    connection.on('Snapshot', (payload) => { latest[i] = decodeSnapshot(payload); });
    await connection.start();
    await connection.invoke('JoinMatch', 'development');
    connections.push(connection);
  }
  await waitFor(() => items.every((list) => list.length > 0) && inventories.every((list) => list.length > 0) && latest.every((snapshot) => snapshot?.players.length === 2));
  assert.equal(field(items[0][0], 'Items', 2).length, 16);
  assert.equal(Number(field(inventories[0][0], 'HealthKits', 0)), 1);
  const invalid = await connections[0].invoke('Pickup', 999);
  assert.equal(field(invalid, 'Code', 1), 'unknown_item');
  const remote = await connections[0].invoke('Pickup', 6);
  assert.equal(field(remote, 'Code', 1), 'too_far');

  await connections[0].send('Fire', encodeFire(WeaponKind.Laser, 2800));
  await connections[1].send('InputBatch', encodeInput(1, 0, 0, Math.PI));
  await sleep(80);
  await connections[1].send('Fire', encodeFire(WeaponKind.Laser, 2800));
  await waitFor(() => latest.every((snapshot) => snapshot.players.every((player) => player.health === 75)));
  const results = await Promise.all(connections.map((connection) => connection.invoke('Pickup', 1)));
  assert.equal(results.filter((result) => field(result, 'Accepted', 0)).length, 1);
  assert.equal(results.filter((result) => field(result, 'Code', 1) === 'unavailable').length, 1);
  await waitFor(() => items.every((list) => list.some((snapshot) =>
    Number(field(snapshot, 'Revision', 1)) > 1 &&
    !field(snapshot, 'Items', 2).some((item) => Number(field(item, 'Id', 0)) === 1))));
  await waitFor(() => pickups.every((list) => list.length === 1));
  const healed = results.find((result) => field(result, 'Accepted', 0));
  assert.equal(Number(field(healed, 'Health', 3)), 75);
  const winner = results.findIndex((result) => field(result, 'Accepted', 0));
  const used = await connections[winner].invoke('UseItem', 1);
  assert.equal(field(used, 'Accepted', 0), true);
  assert.equal(Number(field(used, 'Health', 4)), 100);
  assert.equal(Number(field(field(used, 'Inventory', 3), 'HealthKits', 0)), 1);
  const radar = await connections[winner].invoke('UseItem', 2);
  assert.equal(field(radar, 'Accepted', 0), true);
  console.log('PASS: three loot types, starter inventory, contested pickup, use-to-heal and radar cell');
} finally {
  await Promise.all(connections.map((connection) => connection.stop()));
}
