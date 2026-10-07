export type Session = { playerId: string; username: string; accessToken: string };

export async function authenticate(
  mode: 'login' | 'register',
  username: string,
  password: string,
): Promise<Session> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('Không kết nối được máy chủ. Bạn vẫn có thể thử bản offline.');
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Tên đăng nhập hoặc mật khẩu chưa đúng.');
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Yêu cầu chưa thành công.');
  }
  return response.json() as Promise<Session>;
}
