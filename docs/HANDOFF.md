# Bàn giao Scrap Street

**Cập nhật:** 2026-10-08. **Trạng thái:** Phase 2 đã triển khai và có bản thử combat/radar; Phase 3 chưa bắt đầu.

## Code đang có

- .NET 10: `Game.Api` host REST auth và SignalR; `Game.Application` chứa auth và interface; `Game.Infrastructure` lưu account bằng EF Core/PostgreSQL; `Game.Realtime` chứa Hub và publisher; `Game.Server` chứa `MatchManager`/`MatchRuntime`; `Game.Shared` chứa contract protocol. `Game.Domain` vẫn là khung.
- Client React/Vite/Phaser có đăng ký/đăng nhập, lái thử offline không cần API, và trận thử online cố định sau đăng nhập. Access token ở `sessionStorage`; hết hạn sau 30 phút, chưa có refresh token.
- Match online giới hạn 10 người. Input qua SignalR MessagePack `/hubs/game`; server lấy player ID từ JWT, giữ state trong memory, tick 30 Hz, gửi snapshot binary riêng cho từng người khoảng 10 Hz. Protocol v3: input 10 byte; snapshot `11 + 9 × số xe` byte, byte cuối mỗi xe là HP; tia bắn 15 byte; radar response 6 byte. Hub chỉ route; Phaser render state từ `GameNetworkAdapter`/`ClientWorldState`. Chi tiết byte layout ở [PROTOCOL.md](PROTOCOL.md).
- Movement online có giới hạn tốc độ, biên map và collision với mười hình nhà. Map 3200×2200 vẫn là Phaser Graphics placeholder; có minimap, bụi ẩn từ xa và điều khiển cảm ứng. Server tính 25 damage/phát trúng, hồi sinh sau 3 giây, lọc vị trí xe ở bụi và xác thực cooldown radar. Chưa có prediction/interpolation, ammo, loot, safe zone, room browser hoặc Redis integration.

## Chạy và kiểm tra

Xem [SETUP.md](SETUP.md) để tạo PostgreSQL role/database. Từ thư mục gốc:

```powershell
dotnet restore Game.sln
dotnet build Game.sln
dotnet run --project src/Game.Api --urls http://127.0.0.1:5080
```

Trong terminal khác:

```powershell
cd client
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173/`, đăng nhập hai tài khoản ở hai tab để thấy nhau. Chạy `npm run test:realtime` khi API đang chạy. Browser test `npm run test:browser` cần Vite và browser CDP tại cổng 9224.

Phase 2 đã được kiểm tra bằng `dotnet build` (0 warning/0 error), `npm run build`, `npm run format:check`, hai SignalR client và hai tab Edge headless. Binary snapshot hai xe dài 29 byte; payload WebSocket/SignalR đo được 47 byte, khoảng 10 snapshot/giây. Input sai bị bỏ, ngắt kết nối và kết nối lại thành công. Mẫu không player 5 giây ở phiên Phase 2 trước cho thấy private memory 44.6 → 44.5 MB. Browser test xác nhận hai canvas Phaser và xe của cả hai player; chưa đo độ mượt hay độ trễ 50–100 ms.

Lần test dùng PostgreSQL tạm cổng 55432 trong `.runtime-test/` vì password role `scrap` ở PostgreSQL sẵn có trên máy này không khớp cấu hình development. Không thay đổi instance có sẵn. `compose.yaml` chưa được smoke test vì không có Docker CLI.

## Việc tiếp theo

Phase 3 theo [PHASES.md](PHASES.md): client prediction/reconciliation, remote interpolation, authoritative movement/collision đầy đủ và kiểm thử khi có độ trễ. Trước khi làm, xem [IMPLEMENTED.md](IMPLEMENTED.md) và [ARCHITECTURE.md](ARCHITECTURE.md). Giữ runtime tách EF/SignalR, player ID chỉ từ JWT và scene không gọi Hub trực tiếp.
