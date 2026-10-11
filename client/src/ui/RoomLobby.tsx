import { useEffect, useState } from 'react';
import type { Session } from '../services/api/auth';
import {
  createRoom,
  currentRoom,
  joinRoom,
  leaveRoom,
  listRooms,
  quickJoin,
  startRoom,
  type RoomSummary,
} from '../services/api/rooms';

export function RoomLobby({
  session,
  onEnter,
}: {
  session: Session;
  onEnter: (room: RoomSummary) => void;
}): React.JSX.Element {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [mine, setMine] = useState<RoomSummary | null>(null);
  const [name, setName] = useState('Xưởng xe vui');
  const [capacity, setCapacity] = useState(10);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function refresh(): Promise<void> {
      try {
        const [all, current] = await Promise.all([listRooms(session), currentRoom(session)]);
        if (!active) return;
        setRooms(all);
        setMine(current);
        if (current?.state === 'Playing' || current?.state === 'Finished') onEnter(current);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Không tải được sảnh.');
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session, onEnter]);

  async function action(work: () => Promise<RoomSummary>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const room = await work();
      setMine(room);
      if (room.state === 'Playing') onEnter(room);
      else setRooms(await listRooms(session));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Yêu cầu chưa thành công.');
    } finally {
      setBusy(false);
    }
  }

  async function leave(): Promise<void> {
    if (!mine) return;
    setBusy(true);
    setError('');
    try {
      await leaveRoom(session, mine.id);
      setMine(null);
      setRooms(await listRooms(session));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không rời được phòng.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="room-lobby">
      <div className="room-lobby-head">
        <span className="eyebrow">SẢNH CHỜ / CHỌN QUY MÔ TRẬN</span>
        <h1>Chọn một góc phố để quậy.</h1>
        <p>
          Tạo phòng 5, 10, 20, 25 hoặc 50 người, nhập mã bạn bè hoặc ghép nhanh vào trận đang mở.
        </p>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {mine ? (
        <section className="room-current">
          <div>
            <span className="room-kicker">
              PHÒNG CỦA BẠN ·{' '}
              {mine.state === 'Waiting'
                ? 'ĐANG CHỜ'
                : mine.state === 'Finished'
                  ? 'ĐÃ KẾT THÚC'
                  : 'ĐANG CHƠI'}
            </span>
            <h2>{mine.name}</h2>
            <p>
              Mã phòng <strong>{mine.id.toUpperCase()}</strong> · {mine.playerCount}/{mine.capacity}{' '}
              người · Chủ phòng {mine.hostName}
            </p>
            <p>Gửi mã phòng cho bạn bè. Phòng thường chỉ vào được trước khi bắt đầu.</p>
          </div>
          <div className="room-current-actions">
            {mine.hostId === session.playerId && mine.state === 'Waiting' && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void action(() => startRoom(session, mine.id))}
              >
                BẮT ĐẦU TRẬN ↗
              </button>
            )}
            <button className="practice-button" disabled={busy} onClick={() => void leave()}>
              RỜI PHÒNG
            </button>
          </div>
        </section>
      ) : (
        <div className="room-actions-grid">
          <section className="room-card room-quick">
            <span className="room-kicker">VÀO TRẬN NGAY</span>
            <h2>Ghép nhanh</h2>
            <p>Vào phòng mở đang chơi, hoặc tạo phòng ghép nhanh mới.</p>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void action(() => quickJoin(session))}
            >
              GHÉP NHANH ↗
            </button>
          </section>
          <section className="room-card">
            <span className="room-kicker">TỤ TẬP BẠN BÈ</span>
            <h2>Tạo phòng</h2>
            <label>
              TÊN PHÒNG
              <input
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              SỨC CHỨA / THỜI GIAN BO
              <select
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
              >
                <option value={5}>5 người · khoảng 8 phút</option>
                <option value={10}>10 người · khoảng 10 phút</option>
                <option value={20}>20 người · khoảng 13 phút</option>
                <option value={25}>25 người · khoảng 15 phút</option>
                <option value={50}>50 người · khoảng 19 phút</option>
              </select>
            </label>
            <button
              className="practice-button"
              disabled={busy || name.trim().length < 3}
              onClick={() => void action(() => createRoom(session, name, capacity))}
            >
              TẠO PHÒNG +
            </button>
          </section>
          <section className="room-card">
            <span className="room-kicker">CÓ MÃ PHÒNG?</span>
            <h2>Vào cùng bạn</h2>
            <label>
              MÃ PHÒNG
              <input
                value={code}
                maxLength={8}
                onChange={(event) => setCode(event.target.value)}
                placeholder="8 ký tự"
              />
            </label>
            <button
              className="practice-button"
              disabled={busy || code.trim().length !== 8}
              onClick={() => void action(() => joinRoom(session, code.trim()))}
            >
              VÀO PHÒNG →
            </button>
          </section>
        </div>
      )}
      <section className="room-directory">
        <div className="room-directory-heading">
          <h2>Phòng đang mở</h2>
          <span>{rooms.length} PHÒNG</span>
        </div>
        {rooms.length === 0 ? (
          <p>Chưa có phòng nào. Tạo phòng để rủ bạn bè vào chơi.</p>
        ) : (
          <div className="room-list">
            {rooms.map((room) => (
              <div className="room-row" key={room.id}>
                <div>
                  <strong>{room.name}</strong>
                  <small>
                    {room.id.toUpperCase()} · {room.hostName} ·{' '}
                    {room.isQuick
                      ? 'GHÉP NHANH'
                      : room.state === 'Waiting'
                        ? 'CHỜ HOST'
                        : 'ĐANG CHƠI'}
                  </small>
                </div>
                <span>
                  {room.playerCount}/{room.capacity}
                </span>
                {!mine &&
                  (room.state === 'Waiting' || (room.isQuick && room.state === 'Playing')) && (
                    <button
                      disabled={busy || room.playerCount >= room.capacity}
                      onClick={() => void action(() => joinRoom(session, room.id))}
                    >
                      VÀO →
                    </button>
                  )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
