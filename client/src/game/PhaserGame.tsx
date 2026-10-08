import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Phaser from 'phaser';
import { GameScene, type GameControls, type HudState } from './scenes/GameScene';
import { BUILDINGS, BUSHES, MAP } from './config/map';
import type { Session } from '../services/api/auth';
import { GameNetworkAdapter } from './network/GameNetworkAdapter';
import { WeaponKind } from './network/BinaryGameCodec';

const WEAPONS = [
  { kind: WeaponKind.Bullet, name: 'Đạn xa', short: 'ĐẠN', icon: '●' },
  { kind: WeaponKind.Laser, name: 'Laser', short: 'LASER', icon: '⌁' },
  { kind: WeaponKind.Rocket, name: 'Tên lửa', short: 'TÊN LỬA', icon: '➤' },
  { kind: WeaponKind.Artillery, name: 'Pháo', short: 'PHÁO', icon: '◉' },
  { kind: WeaponKind.Mud, name: 'Bùn', short: 'BÙN', icon: '◌' },
] as const;

const emptyHud: HudState = {
  x: 1100,
  y: 640,
  health: 100,
  status: 0,
  players: [],
  hidden: false,
  view: { x: 600, y: 300, width: 1000, height: 700 },
};

function MiniMap({ hud, radar }: { hud: HudState; radar: boolean }): React.JSX.Element {
  return (
    <svg
      className="minimap-svg"
      viewBox={`0 0 ${MAP.width} ${MAP.height}`}
      role="img"
      aria-label="Bản đồ nhỏ"
    >
      <rect width={MAP.width} height={MAP.height} fill="#243842" />
      <path
        d="M0 470H3200 M0 720H3200 M650 0V2200 M1330 0V2200 M0 1510H3200 M2190 0V2200"
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
      {radar &&
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

export function PhaserGame({ session }: { session: Session | null }): React.JSX.Element {
  const mount = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<GameNetworkAdapter | null>(null);
  const controls = useRef<GameControls>({
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    touchAim: window.matchMedia('(pointer: coarse)').matches,
    fire: false,
    weapon: WeaponKind.Bullet,
    artilleryRange: 900,
  });
  const [weapon, setWeapon] = useState<WeaponKind>(WeaponKind.Bullet);
  const [artilleryRange, setArtilleryRange] = useState(900);
  const [status, setStatus] = useState('Đang kết nối...');
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [radarUntil, setRadarUntil] = useState(0);
  const [radarReady, setRadarReady] = useState(0);
  const [radarBusy, setRadarBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const radar = now < radarUntil;
  const cooldown = Math.max(0, Math.ceil((radarReady - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const selected = Number(event.key);
      if (selected < 1 || selected > 5) return;
      controls.current.weapon = selected as WeaponKind;
      setWeapon(selected as WeaponKind);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!mount.current) return;
    const adapter = session
      ? new GameNetworkAdapter(session.playerId, session.accessToken, setStatus)
      : null;
    adapterRef.current = adapter;
    if (adapter) void adapter.start().catch(() => setStatus('Không kết nối được trận online.'));
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount.current,
      width: 1100,
      height: 700,
      backgroundColor: '#28323c',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new GameScene(adapter, controls.current, setHud)],
      render: { antialias: true },
    });
    return () => {
      adapterRef.current = null;
      game.destroy(true);
      if (adapter) void adapter.stop();
    };
  }, [session]);

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
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.38);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.38);
    const length = Math.max(1, Math.hypot(x, y));
    if (aim) {
      if (Math.hypot(x, y) > 0.12) controls.current.aimAngle = Math.atan2(y, x);
      controls.current.touchAim = true;
    } else {
      controls.current.moveX = x / length;
      controls.current.moveY = y / length;
    }
  }

  function stick(aim: boolean): React.JSX.Element {
    return (
      <div
        className={`touch-stick ${aim ? 'aim-stick' : 'move-stick'}`}
        aria-label={aim ? 'Kéo để ngắm' : 'Kéo để di chuyển'}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          moveStick(e, aim);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) moveStick(e, aim);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          if (!aim) {
            controls.current.moveX = 0;
            controls.current.moveY = 0;
          }
        }}
        onPointerCancel={() => {
          if (!aim) {
            controls.current.moveX = 0;
            controls.current.moveY = 0;
          }
        }}
      >
        <span className="stick-knob">{aim ? '◎' : '✦'}</span>
        <small>{aim ? 'NGẮM' : 'LÁI'}</small>
      </div>
    );
  }

  return (
    <div className="game-viewport">
      <div ref={mount} className="game-canvas" />
      <div className="game-top-hud">
        <div className="arena-pill">
          <span className="live-dot" /> {session ? 'TRẬN ONLINE' : 'LÁI THỬ'} <b>·</b> PHỐ PHẾ LIỆU
        </div>
        <div className="coordinates">
          {Math.round(hud.x)} / {Math.round(hud.y)}
        </div>
      </div>
      <div className="health-panel" aria-label={`Máu ${hud.health} trên 100`}>
        <span>HP</span>
        <div className="health-track">
          <i style={{ width: `${hud.health}%` }} />
        </div>
        <strong>{hud.health}</strong>
      </div>
      <div className="weapon-dock" aria-label="Chọn loại đạn">
        <div className="weapon-title">
          VŨ KHÍ <span>1–5 ĐỂ ĐỔI</span>
        </div>
        <div className="weapon-list">
          {WEAPONS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={`weapon-option ${weapon === item.kind ? 'selected' : ''}`}
              aria-label={item.name}
              aria-pressed={weapon === item.kind}
              onClick={() => {
                controls.current.weapon = item.kind;
                setWeapon(item.kind);
              }}
            >
              <strong>{item.icon}</strong>
              <small>{item.short}</small>
            </button>
          ))}
        </div>
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
            <span>{artilleryRange}m</span>
          </label>
        )}
      </div>
      <div className="minimap-panel">
        <div className="minimap-heading">
          <span>BẢN ĐỒ KHU VỰC</span>
          <span>{radar ? 'ĐANG QUÉT' : 'N'}</span>
        </div>
        <MiniMap hud={hud} radar={radar} />
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
          XE ĐÃ HỎNG <small>Đang hồi sinh...</small>
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
        <span className="desktop-hint">WASD DI CHUYỂN · CHUỘT NGẮM/BẮN · PHÍM 1–5 ĐỔI ĐẠN</span>
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
              e.currentTarget.setPointerCapture(e.pointerId);
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
