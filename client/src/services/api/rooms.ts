import type { Session } from './auth';

export type RoomSummary = {
  id: string;
  name: string;
  state: 'Waiting' | 'Starting' | 'Playing' | 'Ending' | 'Finished';
  hostId: string;
  hostName: string;
  playerCount: number;
  capacity: number;
  isQuick: boolean;
};

async function request<T>(
  session: Session,
  path: string,
  method = 'GET',
  body?: object,
): Promise<T> {
  const response = await fetch(`/api/rooms${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null as T;
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    const messages: Record<string, string> = {
      room_not_found: 'Không tìm thấy phòng.',
      room_full: 'Phòng đã đủ người.',
      room_capacity_invalid: 'Chọn sức chứa 5, 10, 20, 25 hoặc 50 người.',
      room_started: 'Phòng đã bắt đầu.',
      room_not_playing: 'Trận chưa bắt đầu hoặc đã kết thúc.',
      not_host: 'Chỉ chủ phòng được bắt đầu.',
      not_member: 'Bạn không ở trong phòng này.',
      already_in_room: 'Bạn đang ở một phòng khác.',
      room_limit: 'Máy chủ đã đủ phòng.',
      room_name_invalid: 'Tên phòng cần từ 3 đến 40 ký tự.',
    };
    throw new Error(messages[result?.error ?? ''] ?? 'Không thực hiện được yêu cầu phòng.');
  }
  return response.json() as Promise<T>;
}

export const listRooms = (session: Session) => request<RoomSummary[]>(session, '/');
export const currentRoom = (session: Session) => request<RoomSummary | null>(session, '/current');
export const createRoom = (session: Session, name: string, capacity = 10) =>
  request<RoomSummary>(session, '/', 'POST', { name, capacity });
export const joinRoom = (session: Session, id: string) =>
  request<RoomSummary>(session, `/${encodeURIComponent(id)}/join`, 'POST');
export const quickJoin = (session: Session) => request<RoomSummary>(session, '/quick', 'POST');
export const startRoom = (session: Session, id: string) =>
  request<RoomSummary>(session, `/${encodeURIComponent(id)}/start`, 'POST');
export const finishRoom = (session: Session, id: string) =>
  request<RoomSummary>(session, `/${encodeURIComponent(id)}/finish`, 'POST');
export const leaveRoom = (session: Session, id: string) =>
  request<RoomSummary>(session, `/${encodeURIComponent(id)}`, 'DELETE');
