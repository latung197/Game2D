import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import Phaser from 'phaser';
import { GameScene, type GameControls, type HudState } from './scenes/GameScene';
import { BUILDINGS, BUSHES, MAP, TREES } from './config/map';
import type { Session } from '../services/api/auth';
import type { ConnectionStatus } from '../services/realtime/RealtimeClient';
import type { AmmoState, KillEvent, InventoryState } from '../services/realtime/RealtimeClient';
import type { MatchResult } from '../services/realtime/RealtimeClient';
import { GameNetworkAdapter } from './network/GameNetworkAdapter';
import { WeaponKind } from './network/BinaryGameCodec';
import { WEAPONS, weaponFor } from './config/weapons';
import { ITEMS, itemFor } from './config/items';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: 'Đã vào trận thử online.',
  reconnecting: 'Đang kết nối lại...',
  rejoin_failed: 'Không vào lại được trận.',
  disconnected: 'Mất kết nối máy chủ.',
  input_failed: 'Không gửi được input.',
  fire_failed: 'Không gửi được phát bắn.',
};

const emptyHud: HudState = {
  x: 1100,
  y: 640,
  health: 100,
  nearbyItem: null,
  items: [],
  zone: null,
  outsideZone: false,
  spectating: null,
  status: 0,
  players: [],
  hidden: false,
  targetsHit: 0,
  lightLevel: 0,
  explored: [{ x: 1100, y: 640 }],
  view: { x: 600, y: 300, width: 1000, height: 700 },
};

function MiniMap({ hud, radar }: { hud: HudState; radar: boolean }): React.JSX.Element {
  const fogId = useId();
  return (
    <svg
      className="minimap-svg"
      viewBox={`0 0 ${MAP.width} ${MAP.height}`}
      role="img"
      aria-label="Bản đồ nhỏ"
    >
      <rect width={MAP.width} height={MAP.height} fill="#243842" />
      <path
        d={`M0 470H${MAP.width} M0 720H${MAP.width} M650 0V${MAP.height} M1330 0V${MAP.height} M0 1510H${MAP.width} M2190 0V${MAP.height} M0 2180H${MAP.width} M0 2820H${MAP.width} M3200 0V${MAP.height}`}
        stroke="#a5a29a"
        strokeWidth="65"
        opacity=".65"
      />
      {BUILDINGS.map((b) => (
        <rect
          key={b.label}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx="24"
          fill="#9d8e9a"
          stroke="#e0d5bb"
          strokeWidth="13"
        />
      ))}
      {BUSHES.map((b) => (
        <circle key={`${b.x}-${b.y}`} cx={b.x} cy={b.y} r={b.r} fill="#558977" />
      ))}
      {TREES.map((tree) => (
        <circle key={`${tree.x}-${tree.y}`} cx={tree.x} cy={tree.y} r="27" fill="#416c56" />
      ))}
      {hud.items.map((item) => (
        <g key={item.id} transform={`translate(${item.x} ${item.y})`}>
          <circle
            r="28"
            fill={item.kind === 1 ? '#d7f5b5' : item.kind === 2 ? '#a5e7f7' : '#ffe0a3'}
            stroke="#1b4550"
            strokeWidth="10"
          />
          <text textAnchor="middle" dominantBaseline="middle" fontSize="34" fill="#174755">
            {itemFor(item.kind)?.icon}
          </text>
        </g>
      ))}
      {!radar && (
        <>
          <defs>
            <mask id={fogId}>
              <rect width={MAP.width} height={MAP.height} fill="white" />
              {hud.explored.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r="380" fill="black" />
              ))}
              <circle cx={hud.x} cy={hud.y} r="380" fill="black" />
            </mask>
          </defs>
          <rect
            width={MAP.width}
            height={MAP.height}
            fill="#081720"
            opacity=".88"
            mask={`url(#${fogId})`}
          />
        </>
      )}
      {hud.zone && (
        <>
          <defs>
            <mask id={`${fogId}-zone`}>
              <rect width={MAP.width} height={MAP.height} fill="white" />
              <circle
                cx={hud.zone.centerX}
                cy={hud.zone.centerY}
                r={hud.zone.radius}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width={MAP.width}
            height={MAP.height}
            fill="#a6335a"
            opacity=".55"
            mask={`url(#${fogId}-zone)`}
          />
          <circle
            cx={hud.zone.centerX}
            cy={hud.zone.centerY}
            r={hud.zone.radius}
            fill="none"
            stroke="#74d7f4"
            strokeWidth="15"
          />
          {hud.zone.stage === 'Warning' && (
            <circle
              cx={hud.zone.targetX}
              cy={hud.zone.targetY}
              r={hud.zone.targetRadius}
              fill="none"
              stroke="#ffd681"
              strokeWidth="10"
              strokeDasharray="36 24"
            />
          )}
        </>
      )}
      <rect
        x={hud.view.x}
        y={hud.view.y}
        width={hud.view.width}
        height={hud.view.height}
        fill="none"
        stroke="#f5d993"
        strokeWidth="20"
        rx="20"
      />
      {(radar || hud.players.length > 1) &&
        hud.players
          .filter((p) => Math.hypot(p.x - hud.x, p.y - hud.y) > 1)
          .map((p) => (
            <circle
              key={p.playerId}
              cx={p.x}
              cy={p.y}
              r="43"
              fill="#fb7f78"
              stroke="#fff3dc"
              strokeWidth="11"
            />
          ))}
      <circle cx={hud.x} cy={hud.y} r="51" fill="#ffcf78" stroke="#ffffff" strokeWidth="14" />
    </svg>
  );
}

export function PhaserGame({
  session,
  roomId,
  mode = 'roam',
  onMatchEnd,
}: {
  session: Session | null;
  roomId?: string;
  mode?: 'roam' | 'practice';
  onMatchEnd?: (result: MatchResult) => void;
}): React.JSX.Element {
  const mount = useRef<HTMLDivElement>(null);
  const lightingCanvas = useRef<HTMLCanvasElement>(null);
  const weaponList = useRef<HTMLDivElement>(null);
  const stickPointers = useRef<{ move: number | null; aim: number | null }>({
    move: null,
    aim: null,
  });
  const adapterRef = useRef<GameNetworkAdapter | null>(null);
  const onMatchEndRef = useRef(onMatchEnd);
  onMatchEndRef.current = onMatchEnd;
  const controls = useRef<GameControls>({
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    touchAim: window.matchMedia('(pointer: coarse)').matches,
    fire: false,
    pickup: false,
    weapon: WeaponKind.Bullet,
    artilleryRange: 900,
    lightingMode: new URLSearchParams(window.location.search).has('night') ? 'night' : 'cycle',
    headlights: true,
  });
  const [lightingMode, setLightingMode] = useState<'cycle' | 'day' | 'night'>(
    controls.current.lightingMode,
  );
  const [headlights, setHeadlights] = useState(true);
  const [weapon, setWeapon] = useState<WeaponKind>(WeaponKind.Bullet);
  const [weaponInfoOpen, setWeaponInfoOpen] = useState(false);
  const [itemInfoOpen, setItemInfoOpen] = useState(false);
  const [artilleryRange, setArtilleryRange] = useState(900);
  const [status, setStatus] = useState('Đang kết nối...');
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [radarUntil, setRadarUntil] = useState(0);
  const [radarReady, setRadarReady] = useState(0);
  const [radarBusy, setRadarBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [ammo, setAmmo] = useState<Partial<Record<WeaponKind, AmmoState & { receivedAt: number }>>>(
    {},
  );
  const [kills, setKills] = useState<KillEvent[]>([]);
  const [lootNotice, setLootNotice] = useState<{ text: string; until: number } | null>(null);
  const [inventory, setInventory] = useState<InventoryState>({
    healthKits: 0,
    radarCells: 0,
    ammoCrates: 0,
  });
  const radar = now < radarUntil;
  const cooldown = Math.max(0, Math.ceil((radarReady - now) / 1000));
  const selectedWeapon = weaponFor(weapon);

  useEffect(() => {
    const list = weaponList.current;
    const selected = list?.querySelector<HTMLElement>('.weapon-option.selected');
    if (!list || !selected) return;
    const listBounds = list.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    list.scrollBy({
      left:
        selectedBounds.left + selectedBounds.width / 2 - (listBounds.left + listBounds.width / 2),
      behavior: 'smooth',
    });
  }, [weapon]);

  async function useInventoryItem(kind: number): Promise<void> {
    const adapter = adapterRef.current;
    if (!adapter) return;
    try {
      const result = await adapter.useItem(kind);
      if (!result.accepted) {
        const messages: Record<string, string> = {
          empty: 'Không còn vật phẩm này.',
          full_health: 'Máu đã đầy.',
          ammo_full: 'Đạn dự trữ đã đầy.',
          dead: 'Xe đã hỏng.',
        };
        setLootNotice({
          text: messages[result.code] ?? 'Không dùng được vật phẩm.',
          until: Date.now() + 2200,
        });
        return;
      }
      if (kind === 2) {
        const time = Date.now();
        setRadarUntil(time + result.radar.activeTicks * (1000 / 30));
        setRadarReady(time + result.radar.cooldownTicks * (1000 / 30));
      }
      setInventory(result.inventory);
      setAmmo((current) => {
        const next = { ...current };
        for (const state of result.ammo) next[state.weapon] = { ...state, receivedAt: Date.now() };
        return next;
      });
      setLootNotice({
        text: `${itemFor(kind)?.name ?? 'Vật phẩm'} đã dùng.`,
        until: Date.now() + 2400,
      });
    } catch {
      setLootNotice({ text: 'Mất kết nối với túi đồ.', until: Date.now() + 2200 });
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWeaponInfoOpen(false);
        setItemInfoOpen(false);
        return;
      }
      if (event.target instanceof HTMLInputElement || weaponInfoOpen || itemInfoOpen) return;
      if (event.key.toLowerCase() === 'n') {
        const next =
          controls.current.lightingMode === 'cycle'
            ? 'night'
            : controls.current.lightingMode === 'night'
              ? 'day'
              : 'cycle';
        controls.current.lightingMode = next;
        setLightingMode(next);
        return;
      }
      if (event.key.toLowerCase() === 'l') {
        controls.current.headlights = !controls.current.headlights;
        setHeadlights(controls.current.headlights);
        adapterRef.current?.setHeadlights(controls.current.headlights);
        return;
      }
      const itemKey = ITEMS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (itemKey) {
        void useInventoryItem(itemKey.id);
        return;
      }
      if (event.key.toLowerCase() === 'r') {
        adapterRef.current?.reload(controls.current.weapon);
        return;
      }
      if (event.key.toLowerCase() === 'e') {
        controls.current.pickup = true;
        return;
      }
      const selected = Number(event.key);
      if (selected < 1 || selected > WEAPONS.length) return;
      controls.current.weapon = selected as WeaponKind;
      setWeapon(selected as WeaponKind);
      setWeaponInfoOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [weaponInfoOpen, itemInfoOpen]);

  useEffect(() => {
    if (!mount.current) return;
    const adapter = session
      ? new GameNetworkAdapter(session.playerId, session.accessToken, roomId)
      : null;
    adapterRef.current = adapter;
    const unsubscribeStatus = adapter?.events.on('status', (code) => {
      setStatus(STATUS_LABEL[code]);
      if (code === 'connected') adapter.setHeadlights(controls.current.headlights);
      if (code === 'disconnected' || code === 'reconnecting')
        setInventory({ healthKits: 0, radarCells: 0, ammoCrates: 0 });
    });
    const unsubscribeAmmo = adapter?.events.on('ammo', (state) =>
      setAmmo((current) => ({ ...current, [state.weapon]: { ...state, receivedAt: Date.now() } })),
    );
    const unsubscribeKill = adapter?.events.on('kill', (kill) =>
      setKills((current) => [kill, ...current].slice(0, 4)),
    );
    const unsubscribePickup = adapter?.events.on('pickup', (pickup) => {
      if (pickup.playerId === session?.playerId)
        setLootNotice({
          text: `Đã nhặt ${itemFor(pickup.kind)?.name ?? 'vật phẩm'} vào túi`,
          until: Date.now() + 2800,
        });
    });
    const unsubscribeInventory = adapter?.events.on('inventory', setInventory);
    const unsubscribePickupResult = adapter?.events.on('pickupResult', (result) => {
      if (result.accepted) return;
      const message: Record<string, string> = {
        too_far: 'Lại gần vật phẩm hơn.',
        unavailable: 'Vật phẩm đã được nhặt.',
        inventory_full: 'Túi đồ đã đầy cho loại này.',
        full_health: 'Máu đã đầy.',
        dead: 'Không thể nhặt khi xe đã hỏng.',
      };
      setLootNotice({
        text: message[result.code] ?? 'Không nhặt được vật phẩm.',
        until: Date.now() + 2200,
      });
    });
    const unsubscribeResult = adapter?.events.on('result', (result) =>
      onMatchEndRef.current?.(result),
    );
    if (adapter) void adapter.start().catch(() => setStatus('Không kết nối được trận online.'));
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount.current,
      width: 1100,
      height: 700,
      backgroundColor: '#28323c',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new GameScene(adapter, controls.current, setHud, mode, lightingCanvas.current)],
      audio: { noAudio: true },
      render: { antialias: true },
    });
    return () => {
      adapterRef.current = null;
      unsubscribeStatus?.();
      unsubscribeAmmo?.();
      unsubscribeKill?.();
      unsubscribePickup?.();
      unsubscribeInventory?.();
      unsubscribePickupResult?.();
      unsubscribeResult?.();
      game.destroy(true);
      if (adapter) void adapter.stop();
    };
  }, [session, roomId, mode]);

  async function useRadar(): Promise<void> {
    if (radarBusy || cooldown > 0) return;
    if (!adapterRef.current) {
      const time = Date.now();
      setRadarUntil(time + 6000);
      setRadarReady(time + 30000);
      return;
    }
    setRadarBusy(true);
    try {
      const result = await adapterRef.current.useRadar();
      const time = Date.now();
      setRadarUntil(time + result.activeTicks * (1000 / 30));
      setRadarReady(time + result.cooldownTicks * (1000 / 30));
    } catch {
      setStatus('Không dùng được radar.');
    } finally {
      setRadarBusy(false);
    }
  }

  function moveStick(event: PointerEvent<HTMLDivElement>, aim: boolean): void {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.38);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.38);
    const distance = Math.hypot(x, y);
    const length = Math.max(1, distance);
    if (aim) {
      if (distance > 0.12) controls.current.aimAngle = Math.atan2(y, x);
      controls.current.touchAim = true;
    } else {
      // A press on the center means drive forward; dragging picks a direction.
      controls.current.moveX = distance <= 0.12 ? Math.cos(controls.current.aimAngle) : x / length;
      controls.current.moveY = distance <= 0.12 ? Math.sin(controls.current.aimAngle) : y / length;
    }
    const knobX = aim ? x / length : controls.current.moveX;
    const knobY = aim ? y / length : controls.current.moveY;
    event.currentTarget.style.setProperty('--stick-x', `${Math.round(knobX * 21)}px`);
    event.currentTarget.style.setProperty('--stick-y', `${Math.round(knobY * 21)}px`);
  }

  function finishStick(event: PointerEvent<HTMLDivElement>, aim: boolean): void {
    const key = aim ? 'aim' : 'move';
    if (stickPointers.current[key] !== event.pointerId) return;
    stickPointers.current[key] = null;
    event.currentTarget.style.setProperty('--stick-x', '0px');
    event.currentTarget.style.setProperty('--stick-y', '0px');
    if (!aim) {
      controls.current.moveX = 0;
      controls.current.moveY = 0;
    }
  }

  function stick(aim: boolean): React.JSX.Element {
    return (
      <div
        className={`touch-stick ${aim ? 'aim-stick' : 'move-stick'}`}
        aria-label={aim ? 'Kéo để ngắm' : 'Giữ để tiến, kéo để đổi hướng'}
        onPointerDown={(e) => {
          const key = aim ? 'aim' : 'move';
          if (stickPointers.current[key] !== null) return;
          stickPointers.current[key] = e.pointerId;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // A touch ending during capture can still be released by pointerup/cancel.
          }
          moveStick(e, aim);
        }}
        onPointerMove={(e) => {
          if (stickPointers.current[aim ? 'aim' : 'move'] === e.pointerId) moveStick(e, aim);
        }}
        onPointerUp={(e) => {
          finishStick(e, aim);
          if (
            typeof e.currentTarget.hasPointerCapture === 'function' &&
            e.currentTarget.hasPointerCapture(e.pointerId)
          ) {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              // Pointer cancel may have released capture already.
            }
          }
        }}
        onPointerCancel={(e) => finishStick(e, aim)}
        onLostPointerCapture={(e) => finishStick(e, aim)}
      >
        <span className="stick-knob">{aim ? '◎' : '✦'}</span>
        <small>{aim ? 'NGẮM' : 'LÁI · GIỮ'}</small>
      </div>
    );
  }

  return (
    <div className="game-viewport">
      <div ref={mount} className="game-canvas" />
      <canvas ref={lightingCanvas} className="lighting-canvas" aria-hidden="true" />
      <div className="game-top-hud">
        <div className="arena-pill">
          <span className="live-dot" />{' '}
          {session ? 'TRẬN ONLINE' : mode === 'practice' ? 'TẬP BẮN' : 'KHÁM PHÁ'} <b>·</b> PHỐ PHẾ
          LIỆU
        </div>
        <div className="coordinates">
          {mode === 'practice' && !session
            ? `◎ ${hud.targetsHit} MỤC TIÊU`
            : `${Math.round(hud.x)} / ${Math.round(hud.y)}`}
        </div>
      </div>
      <div className="health-panel" aria-label={`Máu ${hud.health} trên 100`}>
        <span>HP</span>
        <div className="health-track">
          <i style={{ width: `${hud.health}%` }} />
        </div>
        <strong>{hud.health}</strong>
      </div>
      {hud.zone && (
        <div className={`zone-panel ${hud.outsideZone ? 'outside' : ''}`} role="status">
          <strong>
            BO {hud.zone.phaseIndex}/5 ·{' '}
            {hud.zone.stage === 'Warning'
              ? 'SẮP THU'
              : hud.zone.stage === 'Shrinking'
                ? 'ĐANG THU'
                : 'ỔN ĐỊNH'}
          </strong>
          <span>
            {Math.ceil(hud.zone.remainingTicks / 30)}s · ngoài bo mất {hud.zone.damagePerSecond}{' '}
            HP/s
          </span>
        </div>
      )}
      {session && hud.nearbyItem && (
        <button
          className="pickup-button"
          type="button"
          disabled={hud.health === 0}
          onClick={() => {
            controls.current.pickup = true;
          }}
        >
          ✚ NHẶT {itemFor(hud.nearbyItem?.kind ?? 0)?.name.toUpperCase() ?? 'VẬT PHẨM'} · E
        </button>
      )}
      {session && (
        <div className="inventory-dock" aria-label="Túi vật phẩm">
          <div className="inventory-heading">
            <span>TÚI ĐỒ</span>
            <button
              type="button"
              aria-label="Xem thuộc tính vật phẩm"
              aria-expanded={itemInfoOpen}
              onClick={() => {
                setWeaponInfoOpen(false);
                setItemInfoOpen((open) => !open);
              }}
            >
              CHI TIẾT ⓘ
            </button>
          </div>
          <div className="inventory-slots">
            {ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inventory-slot tone-${item.tone}`}
                disabled={hud.health === 0 || inventory[item.count] === 0}
                onClick={() => void useInventoryItem(item.id)}
                aria-label={`Dùng ${item.name}, còn ${inventory[item.count]}`}
                title={`${item.name}: ${item.description}`}
              >
                <kbd>{item.key}</kbd>
                <strong>{item.icon}</strong>
                <span>{item.short}</span>
                <b>×{inventory[item.count]}</b>
              </button>
            ))}
          </div>
        </div>
      )}
      {lootNotice && now < lootNotice.until && (
        <div className="loot-notice" role="status">
          {lootNotice.text}
        </div>
      )}
      {session && (
        <div className="kill-feed" aria-live="polite">
          {kills.map((kill) => (
            <div key={`${kill.victimId}-${kill.victimDeaths}`}>
              <strong>{kill.killerName}</strong> hạ <strong>{kill.victimName}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="weapon-dock" aria-label="Chọn vũ khí">
        <div className="weapon-title">
          <span>VŨ KHÍ</span> <small>1–9 ĐỂ ĐỔI · VUỐT ĐỂ XEM THÊM</small>
        </div>
        <div ref={weaponList} className="weapon-list">
          {WEAPONS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={`weapon-option tone-weapon-${item.kind} ${weapon === item.kind ? 'selected' : ''}`}
              aria-label={item.name}
              aria-pressed={weapon === item.kind}
              title={`${item.name} · ${item.damage} HP/phát · ${item.special}`}
              onClick={() => {
                controls.current.weapon = item.kind;
                setWeapon(item.kind);
              }}
            >
              <span className="weapon-index">{item.kind}</span>
              <strong>{item.icon}</strong>
              <small>{item.short}</small>
              {session && <em>{ammo[item.kind]?.loaded ?? '–'}</em>}
            </button>
          ))}
        </div>
        <div className="weapon-summary">
          <div>
            <strong>{selectedWeapon.name}</strong>
            <span>{selectedWeapon.special}</span>
          </div>
          <b>{selectedWeapon.damage === 0 ? 'HỖ TRỢ' : `${selectedWeapon.damage} DMG`}</b>
          <button
            type="button"
            aria-label="Xem thuộc tính vũ khí"
            aria-expanded={weaponInfoOpen}
            onClick={() => {
              setItemInfoOpen(false);
              setWeaponInfoOpen((open) => !open);
            }}
          >
            CHI TIẾT ⓘ
          </button>
        </div>
        {session && (
          <div className="ammo-panel" aria-live="polite">
            <span className="ammo-count">
              <strong>{ammo[weapon]?.loaded ?? '–'}</strong>
              <small>/ {ammo[weapon]?.reserve ?? '–'} DỰ TRỮ</small>
            </span>
            {Boolean(ammo[weapon]?.reloadTicks) && (
              <span className="reload-status">
                ĐANG NẠP ·{' '}
                {Math.max(
                  0,
                  Math.ceil(
                    ((ammo[weapon]!.reloadTicks * 1000) / 30 - (now - ammo[weapon]!.receivedAt)) /
                      1000,
                  ),
                )}
                s
              </span>
            )}
            <button
              type="button"
              onClick={() => adapterRef.current?.reload(weapon)}
              disabled={hud.health === 0 || !!ammo[weapon]?.reloadTicks || !ammo[weapon]?.reserve}
            >
              NẠP ĐẠN · R
            </button>
          </div>
        )}
        {weapon === WeaponKind.Artillery && (
          <label className="artillery-range">
            TẦM PHÁO{' '}
            <input
              type="range"
              min="150"
              max="1350"
              step="50"
              value={artilleryRange}
              onChange={(event) => {
                const value = Number(event.target.value);
                controls.current.artilleryRange = value;
                setArtilleryRange(value);
              }}
            />
            <span>{artilleryRange} u</span>
          </label>
        )}
      </div>
      {weaponInfoOpen && (
        <div className="loadout-backdrop" onClick={() => setWeaponInfoOpen(false)}>
          <section
            className="weapon-info-panel loadout-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Thông tin ${selectedWeapon.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="loadout-heading">
              <div>
                <small>KHO VŨ KHÍ · 09 LOẠI</small>
                <h2>Chọn cách chiến đấu</h2>
              </div>
              <button
                className="loadout-close"
                type="button"
                aria-label="Đóng thông tin vũ khí"
                onClick={() => setWeaponInfoOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="loadout-weapon-grid" aria-label="Danh sách vũ khí">
              {WEAPONS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  className={item.kind === weapon ? 'active' : ''}
                  aria-pressed={item.kind === weapon}
                  onClick={() => {
                    controls.current.weapon = item.kind;
                    setWeapon(item.kind);
                  }}
                >
                  <span>{item.icon}</span>
                  <b>{item.name}</b>
                </button>
              ))}
            </div>
            <div className="loadout-hero">
              <span className="loadout-emblem">{selectedWeapon.icon}</span>
              <div>
                <small>
                  {selectedWeapon.behavior === 'Hitscan'
                    ? 'TIA TỨC THỜI'
                    : selectedWeapon.behavior === 'Lob'
                      ? 'ĐẠN CẦU VỒNG'
                      : selectedWeapon.behavior === 'Hazard'
                        ? 'KHỐNG CHẾ'
                        : 'ĐẠN BAY'}
                </small>
                <h3>{selectedWeapon.name}</h3>
                <p>{selectedWeapon.description}</p>
              </div>
            </div>
            <div className="loadout-stats">
              <div>
                <small>SÁT THƯƠNG</small>
                <strong>{selectedWeapon.damage} HP/phát</strong>
              </div>
              <div>
                <small>NHỊP BẮN</small>
                <strong>{(30 / selectedWeapon.cooldownTicks).toFixed(1)} phát/giây</strong>
              </div>
              <div>
                <small>TẦM HIỆU LỰC</small>
                <strong>{selectedWeapon.range} unit</strong>
              </div>
              <div>
                <small>BĂNG ĐẠN</small>
                <strong>{selectedWeapon.magazine} viên</strong>
              </div>
              <div>
                <small>ĐẠN DỰ TRỮ {session ? 'HIỆN CÓ' : 'BAN ĐẦU'}</small>
                <strong>
                  {session ? (ammo[weapon]?.reserve ?? '–') : selectedWeapon.reserve} viên
                </strong>
              </div>
              <div>
                <small>THỜI GIAN NẠP</small>
                <strong>{(selectedWeapon.reloadTicks / 30).toFixed(1)} giây</strong>
              </div>
              {selectedWeapon.blastRadius > 0 && (
                <div>
                  <small>VÙNG ẢNH HƯỞNG</small>
                  <strong>{selectedWeapon.blastRadius} unit</strong>
                </div>
              )}
              {selectedWeapon.speed > 0 && (
                <div>
                  <small>TỐC ĐỘ ĐẠN</small>
                  <strong>{selectedWeapon.speed} unit/giây</strong>
                </div>
              )}
            </div>
            <p className="loadout-note">
              ✦ {selectedWeapon.special}. Số đạn đang có hiển thị trên thanh súng; sát thương và
              hiệu ứng do server xử lý.
            </p>
          </section>
        </div>
      )}
      {itemInfoOpen && session && (
        <div className="loadout-backdrop" onClick={() => setItemInfoOpen(false)}>
          <section
            className="item-info-panel loadout-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Thông tin vật phẩm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="loadout-heading">
              <div>
                <small>TÚI ĐỒ · NHẶT BẰNG E</small>
                <h2>Vật phẩm mang theo</h2>
              </div>
              <button
                className="loadout-close"
                type="button"
                aria-label="Đóng thông tin vật phẩm"
                onClick={() => setItemInfoOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="item-detail-list">
              {ITEMS.map((item) => (
                <article key={item.id} className={`item-detail tone-${item.tone}`}>
                  <span className="item-detail-icon">{item.icon}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <small>
                      {item.kind === 'HealthKit'
                        ? `Hồi ${item.heal} HP`
                        : item.kind === 'RadarCell'
                          ? 'Quét 6 giây'
                          : 'Nạp kho đạn mọi súng'}{' '}
                      · Tối đa {item.maxStack} trong túi
                    </small>
                  </div>
                  <button
                    type="button"
                    disabled={hud.health === 0 || inventory[item.count] === 0}
                    onClick={() => void useInventoryItem(item.id)}
                  >
                    DÙNG {item.key} <b>×{inventory[item.count]}</b>
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      <div className="minimap-panel">
        <div className="minimap-heading">
          <span>BẢN ĐỒ KHU VỰC</span>
          <span>{radar ? 'ĐANG QUÉT' : hud.lightLevel > 0.55 ? 'ĐÊM' : 'NGÀY'}</span>
        </div>
        <MiniMap hud={hud} radar={radar} />
        <div className="light-buttons">
          <button
            type="button"
            aria-label="Đổi chế độ sáng tối"
            data-short={lightingMode === 'cycle' ? '◐' : lightingMode === 'night' ? '☾' : '☀'}
            onClick={() => {
              const next =
                lightingMode === 'cycle' ? 'night' : lightingMode === 'night' ? 'day' : 'cycle';
              controls.current.lightingMode = next;
              setLightingMode(next);
            }}
          >
            {lightingMode === 'cycle'
              ? '◐ TỰ ĐỘNG'
              : lightingMode === 'night'
                ? '☾ BAN ĐÊM'
                : '☀ BAN NGÀY'}
          </button>
          <button
            type="button"
            aria-label="Bật tắt đèn pha"
            data-short={headlights ? '◉' : '○'}
            aria-pressed={headlights}
            onClick={() => {
              controls.current.headlights = !headlights;
              setHeadlights(!headlights);
              adapterRef.current?.setHeadlights(!headlights);
            }}
          >
            {headlights ? '◉ ĐÈN BẬT' : '○ ĐÈN TẮT'}
          </button>
        </div>
        <button
          className="radar-button"
          type="button"
          disabled={cooldown > 0 || radarBusy}
          onClick={() => void useRadar()}
        >
          ◉{' '}
          {radarBusy
            ? 'Đang bật...'
            : radar
              ? 'Đang quét vị trí'
              : cooldown
                ? `Radar ${cooldown}s`
                : 'Dùng radar · 6s'}
        </button>
      </div>
      {radar && (
        <div className="radar-overlay" aria-label="Bản đồ radar phóng to">
          <div className="radar-title">
            ◉ RADAR ĐANG QUÉT <span>{Math.ceil((radarUntil - now) / 1000)}s</span>
          </div>
          <MiniMap hud={hud} radar />
          <div className="radar-legend">
            <i /> VỊ TRÍ NGƯỜI CHƠI KHÁC
          </div>
        </div>
      )}
      {hud.health === 0 && (
        <div className="respawn-overlay">
          {roomId ? 'XE ĐÃ BỊ LOẠI' : 'XE ĐÃ HỎNG'}{' '}
          <small>
            {roomId
              ? hud.spectating
                ? `Đang xem ${hud.spectating} đến hết trận`
                : 'Chờ kết quả trận'
              : 'Đang hồi sinh sau 3 giây'}
          </small>
        </div>
      )}
      <div className="game-bottom-hud">
        <span>
          {hud.status
            ? '◈ DÍNH BÙN · XE CHẠY CHẬM'
            : hud.hidden
              ? '◈ ĐANG ẨN TRONG BỤI'
              : '◈ TÌM BỤI ĐỂ ẨN NẤP'}
        </span>
        <span className="desktop-hint">
          {mode === 'practice' && !session ? `ĐÃ HẠ ${hud.targetsHit} MỤC TIÊU · ` : ''}
          WASD DI CHUYỂN · CHUỘT NGẮM/BẮN · 1–9 ĐỔI SÚNG · N SÁNG/TỐI · L ĐÈN PHA
        </span>
      </div>
      <div className="touch-controls">
        {stick(false)}
        <div className="touch-right">
          {stick(true)}
          <button
            className="fire-button"
            type="button"
            aria-label="Bắn"
            onPointerDown={(e) => {
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // The fire state still resets on pointerup/cancel.
              }
              controls.current.fire = true;
            }}
            onPointerUp={() => {
              controls.current.fire = false;
            }}
            onPointerCancel={() => {
              controls.current.fire = false;
            }}
          >
            BẮN
          </button>
        </div>
      </div>
      {session && (
        <div className="connection-status" role="status">
          {status}
        </div>
      )}
    </div>
  );
}
