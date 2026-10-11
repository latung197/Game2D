import assert from 'node:assert/strict';
import { GameEventBus } from '../src/game/events/GameEventBus.ts';

const bus = new GameEventBus();
const received = [];
const first = bus.on('impact', (value) => received.push(`first:${value}`));
bus.on('impact', (value) => received.push(`second:${value}`));
bus.emit('impact', 1);
first();
bus.emit('impact', 2);
assert.deepEqual(received, ['first:1', 'second:1', 'second:2']);

const afterClear = [];
bus.on('status', (value) => afterClear.push(value));
bus.clear();
bus.emit('status', 'should not arrive');
assert.deepEqual(afterClear, []);
console.log('PASS: game events fan out, unsubscribe and clear cleanly');
