# Bàn giao Scrap Street

**Cập nhật:** 2026-10-08. Phase 2 realtime đã hoạt động; có bản thử combat năm loại đạn và radar. Đây chưa phải Phase 3/4/5 hoàn chỉnh.

## Trạng thái

- Backend .NET 10: `Game.Api` host REST auth/SignalR, `Game.Infrastructure` lưu account bằng PostgreSQL, `Game.Server` giữ trận trong memory, `Game.Shared` chứa codec. `Game.Domain` còn là khung.
- Client React/Vite/Phaser: auth, lái thử offline, match online cố định tối đa 10 người, map 3200×2200, minimap/radar, điều khiển desktop và chạm, thanh chọn năm vũ khí.
- SignalR MessagePack bọc payload gameplay binary v4. Input 10 byte, Fire 5 byte, snapshot `11 + 10P + 8J + 7H` byte, laser 15 byte, impact 12 byte, radar 6 byte. Xem [PROTOCOL.md](PROTOCOL.md).
- Match tick 30 Hz, snapshot khoảng 10 Hz. Server quyết định movement, collision, đường đạn, điểm rơi, damage/HP, hiệu ứng bùn và radar. Đạn xa, laser, tên lửa, pháo, bùn đã có luật riêng trong `WeaponRules.cs`.
- Chưa có prediction/interpolation, ammo/reload, loot, bo, room browser, nhiều match cùng lúc hoặc Redis integration. Chưa kiểm thử tải 50 người/trận và 10.000 người online.

## Chạy

Làm theo [SETUP.md](SETUP.md) để cấu hình PostgreSQL. Tại thư mục gốc:

```powershell
dotnet restore Game.sln
dotnet build Game.sln
dotnet run --project src/Game.Api --urls http://127.0.0.1:5080
```

Terminal khác:

```powershell
cd client
npm ci
npm run dev -- --host 0.0.0.0
```

Mở `http://127.0.0.1:5173/` hoặc IP Wi-Fi của máy ở cổng 5173. Đăng nhập hai account ở hai tab để thử combat online. Chọn vũ khí bằng phím 1–5 hoặc thanh nút; pháo có slider tầm. Chuột hoặc cần phải để ngắm; click hoặc nút Bắn để khai hỏa.

## Kiểm tra

Sau khi API đang chạy: `dotnet build Game.sln --no-restore`; trong `client` chạy `npm run build`, `npm run format:check`, `npm run test:realtime`, `npm run test:weapons`. Bài `npm run test:browser` cần Vite và Edge CDP tại cổng 9224. Test browser giả lập kích thước/chạm, chưa xác nhận trên thiết bị thật.

## Việc tiếp theo

Theo [PHASES.md](PHASES.md), ưu tiên prediction/reconciliation và interpolation, sau đó ammo/reload, luật kill/score, item và room lifecycle. Trước khi nâng lên 50 người/trận hoặc 10.000 online, đo tải và thiết kế nhiều match/process; Redis chỉ cần khi nhiều instance phải chia sẻ thông tin phù hợp, không đặt từng tick di chuyển qua Redis.
