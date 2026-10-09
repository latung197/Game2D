import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const debuggerUrl = process.env.CDP_URL ?? 'http://127.0.0.1:9224';
const site = process.env.GAME_SITE_URL ?? 'http://127.0.0.1:5173/?preview';

async function inspect(width, height, mobile, screenshotName) {
  const target = await (
    await fetch(`${debuggerUrl}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  ).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    await send('Page.navigate', { url: site });
    const until = Date.now() + 10000;
    while (!(await evaluate('Boolean(document.querySelector(".weapon-option"))'))) {
      if (Date.now() > until) throw new Error('Game UI did not appear');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    const b = await evaluate(`(() => {
      const rect = (s) => { const r = document.querySelector(s).getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        scrollHeight:document.documentElement.scrollHeight,
        frame:rect('.game-frame'),map:rect('.minimap-panel'),health:rect('.health-panel'),
        dock:rect('.weapon-dock'),move:rect('.move-stick'),aim:rect('.aim-stick'),
        fire:rect('.fire-button'),touchDisplay:getComputedStyle(document.querySelector('.touch-controls')).display};
    })()`);
    assert.ok(b.scrollWidth <= b.width, JSON.stringify(b));
    assert.ok(b.scrollHeight <= b.height + 1, JSON.stringify(b));
    assert.ok(b.frame.top >= 0 && b.frame.bottom <= b.height + 1, JSON.stringify(b));
    assert.ok(b.map.right <= b.width && b.map.top >= b.frame.top, JSON.stringify(b));
    if (mobile) {
      assert.equal(b.touchDisplay, 'flex');
      assert.ok(b.health.right < b.map.left, JSON.stringify(b));
      assert.ok(b.dock.left >= 0 && b.dock.right <= b.width, JSON.stringify(b));
      const overlaps = (a, c) => a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
      assert.ok(!overlaps(b.dock, b.move) && !overlaps(b.dock, b.aim) && !overlaps(b.dock, b.fire), JSON.stringify(b));
      assert.ok(b.fire.right <= b.width && b.fire.bottom <= b.frame.bottom, JSON.stringify(b));
      assert.ok(b.frame.height >= b.height - 100, JSON.stringify(b));
      if (width > height) assert.ok(b.dock.right < width / 2, JSON.stringify(b));
      await evaluate("document.querySelector('.weapon-option[aria-label=\"Pháo\"]').click()");
      const artillery = await evaluate(`(() => {
        const dock = document.querySelector('.weapon-dock').getBoundingClientRect();
        const slider = document.querySelector('.artillery-range input');
        return {slider:!!slider,left:dock.left,right:dock.right,top:dock.top,bottom:dock.bottom};
      })()`);
      assert.ok(artillery.slider && artillery.left >= 0 && artillery.right <= b.width && artillery.top >= b.frame.top, JSON.stringify(artillery));
    } else {
      assert.equal(b.touchDisplay, 'none');
    }
    if (screenshotName) {
      await mkdir('../.runtime-test', { recursive: true });
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`../.runtime-test/${screenshotName}`, Buffer.from(screenshot.data, 'base64'));
    }
    console.log(`PASS: ${width}×${height} ${mobile ? 'mobile' : 'desktop'} UI fits viewport`);
  } finally {
    socket.close();
    await fetch(`${debuggerUrl}/json/close/${target.id}`);
  }
}

await inspect(320, 568, true, 'layout-320.png');
await inspect(390, 844, true, 'layout-390.png');
await inspect(844, 390, true, 'layout-landscape.png');
await inspect(1366, 768, false, 'layout-desktop.png');
