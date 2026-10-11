import type { Session } from './auth';
import type { MatchResult } from '../realtime/RealtimeClient';

export async function getMatchResult(
  session: Session,
  matchId: string,
): Promise<MatchResult | null> {
  const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Không tải được kết quả trận.');
  return response.json() as Promise<MatchResult>;
}
