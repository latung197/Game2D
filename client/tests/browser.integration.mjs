import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import { decodeSnapshot } from '../src/game/network/BinaryGameCodec.ts';

const debuggerUrl = process.env.CDP_URL ?? 'http://127.0.0.1:9224';
const site = process.env.GAME_SITE_URL ?? 'http://127.0.0.1:5173/';
const suffix = Date.now().toString(36);
const protocol = new MessagePackHubProtocol();

function snapshotsInFrame(response) {
  if (response.opcode !== 2) return [];
  try {
    const data = Buffer.from(response.payloadData, 'base64');
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return protocol
      .parseMessages(buffer, { log() {} })
      .filter((message) => message.target === 'Snapshot')
      .map((message) => decodeSnapshot(message.arguments[0]))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function register(username) {
  const response = await fetch('http://127.0.0.1:5080/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'phase2-browser-password' }),
  });
  if (!response.ok) throw new Error(`Register failed ${response.status}`);
  return response.json();
}

async function page(url = site) {
  const target = await (
    await fetch(`${debuggerUrl}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  ).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  const frames = [];
  const errors = [];
  const binaryFrameBytes = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Network.webSocketFrameReceived') {
      const response = message.params.response;
      const snapshots = snapshotsInFrame(response);
      frames.push(...snapshots);
      if (snapshots.length)
        binaryFrameBytes.push(Buffer.from(response.payloadData, 'base64').length);
    }
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send('Network.enable');
  await send('Runtime.enable');
  return {
    frames,
    errors,
    binaryFrameBytes,
    cdp: send,
    async eval(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    },
    async screenshot(path) {
      const result = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path, Buffer.from(result.data, 'base64'));
    },
    async close() {
      socket.close();
      await fetch(`${debuggerUrl}/json/close/${target.id}`);
    },
  };
}

async function waitFor(predicate, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for browser game');
}

const users = await Promise.all([register(`b2a_${suffix}`), register(`b2b_${suffix}`)]);
const pages = await Promise.all(users.map(() => page()));
let mobile;
try {
  for (let i = 0; i < 2; i++) {
    await waitFor(async () => (await pages[i].eval('location.origin')) === new URL(site).origin);
    await pages[i].eval(
      `sessionStorage.setItem('scrap-session', ${JSON.stringify(JSON.stringify(users[i]))}); location.reload()`,
    );
    await waitFor(() => pages[i].eval("Boolean(document.querySelector('.room-quick button'))"));
  }
  await pages[0].eval("document.querySelector('.room-card:not(.room-quick) button').click()");
  await waitFor(() => pages[0].eval("Boolean(document.querySelector('.room-current strong'))"));
  const roomCode = await pages[0].eval("document.querySelector('.room-current strong').textContent.trim()");
  await waitFor(() => pages[1].eval(`Boolean([...document.querySelectorAll('.room-row')].find(row => row.textContent.includes('${roomCode}'))?.querySelector('button'))`));
  await pages[1].eval(`[...document.querySelectorAll('.room-row')].find(row => row.textContent.includes('${roomCode}')).querySelector('button').click()`);
  await waitFor(() => pages[1].eval("Boolean(document.querySelector('.room-current'))"));
  await pages[0].eval("document.querySelector('.room-current .primary-button').click()");
  try {
    await waitFor(async () =>
      (
        await Promise.all(
          pages.map((p) => p.eval("[...document.querySelectorAll('[role=status]')].some(node => node.textContent.includes('Đã vào trận thử online'))")),
        )
      ).every(Boolean),
    );
  } catch (error) {
    const status = await Promise.all(
      pages.map((p) => p.eval("({ text: document.body.innerText.slice(0, 800), status: document.querySelector('[role=status]')?.textContent })")),
    );
    throw new Error(`${error.message}: ${JSON.stringify({ status, errors: pages.map((p) => p.errors) })}`);
  }
  await waitFor(() => pages.every((p) => p.frames.some((frame) => frame.players.length === 2)));
  await new Promise((resolve) => setTimeout(resolve, 6000));
  for (const browserPage of pages)
    assert.ok(browserPage.frames.at(-1)?.players.every((player) => player.health === 100),
      'idle players must not lose HP at the beginning of an online match');
  const canvases = await Promise.all(
    pages.map((p) => p.eval('Boolean(document.querySelector(".game-canvas canvas"))')),
  );
  assert.deepEqual(canvases, [true, true]);
  await pages[0].cdp('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await pages[0].cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await pages[0].cdp('Page.bringToFront');
  await waitFor(() => pages[0].eval("getComputedStyle(document.querySelector('.touch-controls')).display === 'flex'"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const inventoryLayout = await pages[0].eval(`(() => {
    const box = (selector) => { const r = document.querySelector(selector).getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; };
    return {inventory:box('.inventory-dock'), weapons:box('.weapon-dock'),
      slots:[...document.querySelectorAll('.inventory-slot')].map((node) => node.textContent)};
  })()`);
  assert.equal(inventoryLayout.slots.length, 3);
  assert.ok(inventoryLayout.inventory.bottom < inventoryLayout.weapons.top,
    JSON.stringify(inventoryLayout));
  const measureFrames = () => pages[0].eval(`new Promise(resolve => {
    const gaps = []; let previous = 0; const started = performance.now();
    const frame = now => {
      if (previous) gaps.push(now - previous);
      previous = now;
      if (now - started < 1800) requestAnimationFrame(frame);
      else {
        gaps.sort((a, b) => a - b);
        resolve({ frames: gaps.length, p50: gaps[Math.floor(gaps.length * .5)],
          p95: gaps[Math.floor(gaps.length * .95)], max: gaps.at(-1) });
      }
    };
    requestAnimationFrame(frame);
  })`);
  const frameTiming = await measureFrames();
  await pages[0].eval("document.querySelector('[aria-label=\"Đổi chế độ sáng tối\"]').click()");
  await pages[0].eval("document.querySelector('[aria-label=\"Đổi chế độ sáng tối\"]').click()");
  const daylightTiming = await measureFrames();
  console.log(`Online mobile frame timing: ${JSON.stringify({ cycle: frameTiming, day: daylightTiming })}`);
  const beforeSteer = await pages[0].eval("Number(document.querySelector('.minimap-svg circle:last-child').getAttribute('cx'))");
  const watchedId = pages[1].frames.at(-1).players
    .reduce((closest, player) => Math.abs(player.x - beforeSteer) < Math.abs(closest.x - beforeSteer) ? player : closest)
    .networkId;
  const onlineMovePoint = await pages[0].eval(`(() => {
    const r = document.querySelector('.move-stick').getBoundingClientRect();
    return {x:r.left+r.width*.8,y:r.top+r.height/2};
  })()`);
  for (const latency of [50, 80, 100]) {
    await pages[0].cdp('Network.emulateNetworkConditions', {
      offline: false, latency, downloadThroughput: -1, uploadThroughput: -1,
    });
    const startX = await pages[0].eval("Number(document.querySelector('.minimap-svg circle:last-child').getAttribute('cx'))");
    await pages[0].cdp('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ ...onlineMovePoint, id: 1 }] });
    try {
      await waitFor(async () =>
        (await pages[0].eval("Number(document.querySelector('.minimap-svg circle:last-child').getAttribute('cx'))")) > startX + 8,
      );
      await waitFor(() => pages[1].frames.at(-1)?.players
        .find((player) => player.networkId === watchedId)?.x > startX + 8);
    } catch (error) {
      console.log(JSON.stringify({ latency, startX, watchedId,
        local: await pages[0].eval("Number(document.querySelector('.minimap-svg circle:last-child').getAttribute('cx'))"),
        localFrame: pages[0].frames.at(-1)?.players,
        localAck: pages[0].frames.at(-1)?.lastProcessedSequence,
        remoteAck: pages[1].frames.at(-1)?.lastProcessedSequence,
        localStatus: await pages[0].eval("document.querySelector('[role=status]')?.textContent"),
        remote: pages[1].frames.at(-1)?.players, frameCount: pages[1].frames.length,
        errors: pages[0].errors }));
      throw error;
    } finally {
      await pages[0].cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  await pages[0].cdp('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  await pages[0].eval("document.querySelector('.radar-button').click()");
  await waitFor(() => pages[0].eval('Boolean(document.querySelector(".radar-overlay"))'));
  await mkdir('../.runtime-test', { recursive: true });
  await pages[0].eval("document.querySelector('.game-frame').scrollIntoView()");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await pages[0].screenshot('../.runtime-test/phase2-browser.png');
  const sample = pages[0].binaryFrameBytes.find((_, i) => pages[0].frames[i]?.players.length === 2);
  console.log(
    `PASS: two browser tabs rendered binary snapshots, local and remote movement at 50/80/100ms simulated latency; two-player WebSocket payload ${sample} bytes`,
  );
  mobile = await page(new URL('?preview', site).href);
  await mobile.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await mobile.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await mobile.cdp('Page.enable');
  await mobile.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Context) continue;
      const original = Context.prototype.getParameter;
      Context.prototype.getParameter = function (parameter) {
        if (parameter === this.MAX_TEXTURE_SIZE) return 2048;
        return original.call(this, parameter);
      };
    }
  ` });
  await mobile.cdp('Page.navigate', { url: new URL('?preview', site).href });
  await waitFor(() => mobile.eval('Boolean(document.querySelector(".fire-button"))'));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const bounds = await mobile.eval(`(() => {
    const box = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; };
    return {width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
      map:box('.minimap-panel'), fire:box('.fire-button'), move:box('.move-stick')};
  })()`);
  assert.ok(bounds.scrollWidth <= bounds.width, JSON.stringify(bounds));
  assert.ok(bounds.map.right <= bounds.width && bounds.fire.right <= bounds.width, JSON.stringify(bounds));
  assert.ok(bounds.move.left >= 0, JSON.stringify(bounds));
  const weaponBounds = await mobile.eval(`(() => {
    const dock = document.querySelector('.weapon-dock').getBoundingClientRect();
    const choices = [...document.querySelectorAll('.weapon-option')];
    return {count: choices.length, left: dock.left, right: dock.right,
      top: dock.top, bottom: dock.bottom, fireTop: document.querySelector('.fire-button').getBoundingClientRect().top};
  })()`);
  assert.equal(weaponBounds.count, 9);
  assert.ok(weaponBounds.left >= 0 && weaponBounds.right <= bounds.width &&
    weaponBounds.top >= 0 && weaponBounds.bottom < weaponBounds.fireTop, JSON.stringify(weaponBounds));
  await mobile.eval("document.querySelectorAll('.weapon-option')[3].click()");
  assert.equal(await mobile.eval("document.querySelector('.weapon-option.selected')?.getAttribute('aria-label')"), 'Pháo');
  assert.ok(await mobile.eval("Boolean(document.querySelector('.artillery-range input[type=range]'))"));
  await mobile.eval("document.querySelectorAll('.weapon-option')[8].click(); document.querySelector('[aria-label=\"Xem thuộc tính vũ khí\"]').click()");
  assert.ok(await mobile.eval("document.querySelector('.weapon-info-panel')?.textContent.includes('15 HP/phát')"));
  await mobile.eval("document.querySelector('[aria-label=\"Đóng thông tin vũ khí\"]').click()");
  const beforeMove = await mobile.eval("Number(document.querySelector('.minimap-svg circle:last-child').getAttribute('cx'))");
  const movePoint = await mobile.eval(`(() => { const r = document.querySelector('.move-stick').getBoundingClientRect(); return {x:r.left+r.width*.8,y:r.top+r.height/2}; })()`);
  await mobile.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...movePoint, id: 1 }] });
  await waitFor(async () =>
    (await mobile.eval("Number(document.querySelector('.minimap-svg circle:last-child').getAttribute('cx'))")) > beforeMove + 8,
  );
  await mobile.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.screenshot('../.runtime-test/arena-mobile-cdp.png');
  await mobile.eval("document.querySelector('.radar-button').click()");
  await waitFor(() => mobile.eval('Boolean(document.querySelector(".radar-overlay"))'));
  await mobile.cdp('Emulation.setDeviceMetricsOverride', {
    width: 844, height: 390, deviceScaleFactor: 1, mobile: true,
  });
  const landscape = await mobile.eval(`(() => {
    const frame = document.querySelector('.game-frame').getBoundingClientRect();
    const fire = document.querySelector('.fire-button').getBoundingClientRect();
    const dock = document.querySelector('.weapon-dock').getBoundingClientRect();
    return {height:innerHeight, frameBottom:frame.bottom, fireRight:fire.right,
      dockLeft:dock.left, dockRight:dock.right, dockBottom:dock.bottom, width:innerWidth};
  })()`);
  assert.ok(landscape.frameBottom <= landscape.height + 1, JSON.stringify(landscape));
  assert.ok(landscape.fireRight <= landscape.width, JSON.stringify(landscape));
  assert.ok(landscape.dockLeft >= 0 && landscape.dockRight <= landscape.width &&
    landscape.dockBottom <= landscape.height, JSON.stringify(landscape));
  for (const browserPage of [...pages, mobile])
    assert.deepEqual(browserPage.errors, [], 'game must not throw in either online or low-texture mobile mode');
  console.log('PASS: portrait/landscape mobile controls and radar remain in view');
} finally {
  if (mobile) await mobile.close();
  await Promise.all(pages.map((p) => p.close()));
}
