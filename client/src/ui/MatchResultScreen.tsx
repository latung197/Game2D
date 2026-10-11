import type { MatchResult } from '../services/realtime/RealtimeClient';

export function MatchResultScreen({
  result,
  playerId,
  onExit,
}: {
  result: MatchResult | null;
  playerId: string;
  onExit: () => void;
}): React.JSX.Element {
  const self = result?.players.find((player) => player.playerId === playerId);
  return (
    <div className="match-result-screen">
      <span className="eyebrow">TRẬN ĐÃ KẾT THÚC</span>
      <h2>
        {result
          ? result.winnerId === playerId
            ? 'CHIẾN THẮNG!'
            : result.winnerName
              ? `${result.winnerName} chiến thắng`
              : 'Không có người thắng'
          : 'Đang lưu kết quả...'}
      </h2>
      {self && (
        <p>
          Bạn xếp hạng <strong>#{self.placement}</strong> · {self.kills} hạ gục
        </p>
      )}
      {result && (
        <div className="result-table" role="table" aria-label="Bảng xếp hạng trận">
          <div className="result-row heading" role="row">
            <span>HẠNG</span>
            <span>NGƯỜI CHƠI</span>
            <span>HẠ</span>
            <span>CHẾT</span>
          </div>
          {result.players.map((player) => (
            <div
              className={`result-row ${player.playerId === playerId ? 'self' : ''}`}
              role="row"
              key={player.playerId}
            >
              <strong>#{player.placement}</strong>
              <span>{player.username}</span>
              <span>{player.kills}</span>
              <span>{player.deaths}</span>
            </div>
          ))}
        </div>
      )}
      <button className="primary-button" type="button" onClick={onExit}>
        VỀ SẢNH →
      </button>
    </div>
  );
}
