import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { authenticate, type Session } from '../services/api/auth';
import { currentRoom, finishRoom, leaveRoom, type RoomSummary } from '../services/api/rooms';
import { RoomLobby } from './RoomLobby';
import { MatchResultScreen } from './MatchResultScreen';
import { getMatchResult } from '../services/api/matches';
import type { MatchResult } from '../services/realtime/RealtimeClient';

const PhaserGame = lazy(() =>
  import('../game/PhaserGame').then((module) => ({ default: module.PhaserGame })),
);

export function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = sessionStorage.getItem('scrap-session');
    try {
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  });
  const [previewMode, setPreviewMode] = useState<'roam' | 'practice' | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('practice') ? 'practice' : params.has('preview') ? 'roam' : null;
  });
  const [activeRoom, setActiveRoom] = useState<RoomSummary | null>(null);
  const [roomResult, setRoomResult] = useState<MatchResult | null>(null);
  const enterRoom = useCallback((room: RoomSummary) => {
    setRoomResult(null);
    setActiveRoom(room);
  }, []);
  const onMatchEnd = useCallback((result: MatchResult) => {
    setRoomResult(result);
    setActiveRoom((room) => (room ? { ...room, state: 'Finished' } : room));
  }, []);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session || !activeRoom) return;
    let active = true;
    const refresh = async () => {
      try {
        const room = await currentRoom(session);
        if (!active) return;
        if (!room || room.id !== activeRoom.id) {
          if (activeRoom.state !== 'Finished') setActiveRoom(null);
          return;
        }
        if (room.state === 'Finished') {
          if (activeRoom.state !== 'Finished') setActiveRoom(room);
          if (!roomResult) {
            const result = await getMatchResult(session, room.id);
            if (active && result) setRoomResult(result);
          }
        }
      } catch {
        /* A short network interruption should not close the arena. */
      }
    };
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session, activeRoom, roomResult]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await authenticate(mode, username, password);
      sessionStorage.setItem('scrap-session', JSON.stringify(result));
      setSession(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Có lỗi xảy ra.');
    } finally {
      setBusy(false);
    }
  }

  function signOut(): void {
    if (session)
      void currentRoom(session)
        .then((room) => room && leaveRoom(session, room.id))
        .catch(() => {});
    sessionStorage.removeItem('scrap-session');
    setSession(null);
    setActiveRoom(null);
    setRoomResult(null);
    setPreviewMode(null);
  }

  async function exitArena(): Promise<void> {
    if (activeRoom && session) {
      try {
        await leaveRoom(session, activeRoom.id);
        setActiveRoom(null);
        setRoomResult(null);
      } catch (cause) {
        if (activeRoom.state === 'Finished') {
          setActiveRoom(null);
          setRoomResult(null);
        } else setError(cause instanceof Error ? cause.message : 'Không rời được phòng.');
      }
    } else setPreviewMode(null);
  }

  async function finishArena(): Promise<void> {
    if (!activeRoom || !session) return;
    try {
      const finished = await finishRoom(session, activeRoom.id);
      setActiveRoom(finished);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không kết thúc được trận.');
    }
  }

  const playing = Boolean(activeRoom || previewMode);
  return (
    <div className={`app-shell${playing ? ' is-playing' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">✦</span>
          <span>
            SCRAP
            <br />
            <strong>STREET</strong>
          </span>
        </div>
        <div className="topbar-center">
          <span className="status-light" /> XƯỞNG XE HỖN LOẠN{' '}
          <span className="version">/ BATTLE ARENA</span>
        </div>
        <div className="topbar-right">
          {session ? (
            <>
              <span className="user-pill">★ {session.username}</span>
              <button className="text-button" onClick={signOut}>
                Đăng xuất
              </button>
            </>
          ) : (
            <span className="offline-pill">BẢN THỬ OFFLINE</span>
          )}
        </div>
      </header>

      {session && !activeRoom ? (
        <RoomLobby session={session} onEnter={enterRoom} />
      ) : playing ? (
        <main className="play-layout">
          <div className="play-intro">
            <div>
              <span className="eyebrow">ĐẤU TRƯỜNG / 01</span>
              <h1>Khu phố phế liệu</h1>
            </div>
            <p>Bản đồ rộng · ẩn nấp trong bụi · radar quét vị trí</p>
            <div className="arena-actions">
              {activeRoom?.state === 'Playing' && activeRoom.hostId === session?.playerId && (
                <button className="finish-button" onClick={() => void finishArena()}>
                  Kết thúc trận
                </button>
              )}
              <button className="leave-button" onClick={() => void exitArena()}>
                ← Về sảnh
              </button>
            </div>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <section className="game-frame" aria-label="Đấu trường Scrap Street">
            {activeRoom?.state === 'Finished' && session ? (
              <MatchResultScreen
                result={roomResult}
                playerId={session.playerId}
                onExit={() => void exitArena()}
              />
            ) : (
              <Suspense fallback={<div className="game-loading">ĐANG KHỞI ĐỘNG XE...</div>}>
                <PhaserGame
                  session={activeRoom ? session : null}
                  roomId={activeRoom?.id}
                  mode={previewMode ?? 'roam'}
                  onMatchEnd={onMatchEnd}
                />
              </Suspense>
            )}
          </section>
        </main>
      ) : (
        <main className="landing">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="sparkle">✳</span> CHÀO MỪNG ĐẾN KHU PHỐ KỲ QUẶC
              </div>
              <h1>
                XE CŨ.
                <br />
                <em>TRÒ VUI MỚI.</em>
              </h1>
              <p>
                Một góc phố pastel, một chiếc xe tự chế và rất nhiều trò hỗn loạn đang chờ được lắp
                ráp.
              </p>
              <div className="hero-badges">
                <span>✦ 2D TOP-DOWN</span>
                <span>✦ XE TỰ CHẾ</span>
                <span>✦ ĐẤU TRƯỜNG VUI NHỘN</span>
              </div>
              <div className="mode-actions" aria-label="Chọn chế độ chơi offline">
                <button className="primary-button" onClick={() => setPreviewMode('roam')}>
                  KHÁM PHÁ TỰ DO <span>↗</span>
                </button>
                <button className="practice-button" onClick={() => setPreviewMode('practice')}>
                  TẬP BẮN · 5 MỤC TIÊU <span>◎</span>
                </button>
              </div>
              <p className="mode-caption">
                Đăng nhập để đấu online; chơi thử hai chế độ offline ngay.
              </p>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="moon" />
              <div className="building back">
                <div className="windows">▣　▣　▣</div>
                <div className="sign">XƯỞNG XE VUI</div>
                <div className="door" />
              </div>
              <div className="building front">
                <div className="awning" />
                <div className="shop-sign">BẮP XÀO THẢO LINH</div>
                <div className="shop-door" />
              </div>
              <div className="tree">
                <div className="tree-top">
                  ● ●<br /> ● ● ●<br />● ●
                </div>
                <div className="tree-trunk" />
              </div>
              <div className="street">
                <div className="road-lines" />
              </div>
              <div className="cart">
                <div className="cart-star">★</div>
                <div className="wheel one" />
                <div className="wheel two" />
              </div>
              <div className="art-label">KHU PHỐ PHẾ LIỆU / 01</div>
            </div>
          </section>
          <section className="auth-strip">
            <div>
              <div className="eyebrow">LƯU DANH Ở XƯỞNG</div>
              <h2>{mode === 'login' ? 'Đăng nhập để sẵn sàng.' : 'Tạo tài khoản của bạn.'}</h2>
              <p>Tài khoản lưu qua API; bạn cũng có thể chơi thử offline ngay trên trình duyệt.</p>
            </div>
            <form onSubmit={submit}>
              <div className="form-row">
                <label>
                  TÊN ĐĂNG NHẬP
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    minLength={3}
                    maxLength={24}
                    required
                    autoComplete="username"
                    placeholder="taylai_vui"
                  />
                </label>
                <label>
                  MẬT KHẨU
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={mode === 'register' ? 12 : 1}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="Ít nhất 12 ký tự khi đăng ký"
                  />
                </label>
              </div>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <div className="form-actions">
                <button className="submit-button" disabled={busy}>
                  {busy ? 'Đang xử lý...' : mode === 'login' ? 'ĐĂNG NHẬP →' : 'TẠO TÀI KHOẢN →'}
                </button>
                <button
                  type="button"
                  className="switch-button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError('');
                  }}
                >
                  {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
                </button>
              </div>
            </form>
          </section>
        </main>
      )}
      <footer className="site-footer">
        <span>SCRAP STREET © 2026</span>
        <span>SCRAP STREET · BATTLE ARENA</span>
      </footer>
    </div>
  );
}
