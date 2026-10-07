import { lazy, Suspense, useState, type FormEvent } from 'react';
import { authenticate, type Session } from '../services/api/auth';

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
  const [preview, setPreview] = useState(() =>
    new URLSearchParams(window.location.search).has('preview'),
  );
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    sessionStorage.removeItem('scrap-session');
    setSession(null);
    setPreview(false);
  }

  const playing = Boolean(session || preview);
  return (
    <div className="app-shell">
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
          <span className="version">/ PHASE 01</span>
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

      {playing ? (
        <main className="play-layout">
          <aside className="play-sidebar">
            <div className="eyebrow">BẢN ĐỒ 01 · KHU PHỐ PHẾ LIỆU</div>
            <h1>Chạy thử chiếc xe đầu tiên.</h1>
            <p>Luồn qua những con phố nhỏ, ghé tiệm bắp xào và tìm góc đường yêu thích.</p>
            <div className="instruction">
              <span>W A S D</span>
              <div>Di chuyển</div>
            </div>
            <div className="instruction">
              <span>↑ ← ↓ →</span>
              <div>Di chuyển</div>
            </div>
            <div className="instruction">
              <span>CHUỘT</span>
              <div>Ngắm hướng súng</div>
            </div>
            <div className="phase-note">
              Phase 1 là chuyển động offline. Bắn và multiplayer sẽ được thêm ở các phase tiếp theo.
            </div>
            <button
              className="outline-button"
              onClick={() => (preview ? setPreview(false) : signOut())}
            >
              ← Về xưởng
            </button>
          </aside>
          <section className="game-frame">
            <div className="game-toolbar">
              <span>
                <i /> KHU PHỐ PHẾ LIỆU
              </span>
              <span>CHẾ ĐỘ LÁI THỬ</span>
            </div>
            <Suspense fallback={<div className="game-loading">ĐANG KHỞI ĐỘNG XE...</div>}>
              <PhaserGame />
            </Suspense>
            <div className="game-footer">
              <span>◆ MAP RỘNG HƠN MÀN HÌNH</span>
              <span>CAMERA THEO XE · VA CHẠM NHÀ</span>
            </div>
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
              <button className="primary-button" onClick={() => setPreview(true)}>
                LÁI THỬ OFFLINE <span>↗</span>
              </button>
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
              <p>
                Trong Phase 1, tài khoản xác thực qua API; bản đồ lái thử vẫn hoạt động offline.
              </p>
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
        <span>ĐANG LẮP RÁP · PHASE 01</span>
      </footer>
    </div>
  );
}
