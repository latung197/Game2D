# Bàn giao Scrap Street

**Cập nhật:** 2026-10-09. Phase 2 realtime và bản thử Phase 3 movement mượt đã hoạt động; có combat năm loại đạn và radar. Room/loot/bo vẫn thuộc các phase sau.

## Trạng thái

- Backend .NET 10: `Game.Api` host REST auth/SignalR, `Game.Infrastructure` lưu account bằng PostgreSQL, `Game.Server` giữ trận trong memory, `Game.Shared` chứa codec. `Game.Domain` còn là khung.
- Client React/Vite/Phaser: auth, lái thử offline, match online cố định tối đa 10 người, map 3200×2200, minimap/radar, điều khiển desktop và chạm, thanh chọn năm vũ khí. Bố cục trong trận đã thu gọn cho điện thoại dọc/ngang; dùng gần hết viewport, thanh đạn ở trái khi xoay ngang.
- SignalR MessagePack bọc payload gameplay binary v5. Input 14 byte gồm sequence/clientTick, Fire 5 byte, snapshot `15 + 14P + 8J + 7H` byte với ACK và vận tốc; laser 15 byte, impact 12 byte, radar 6 byte. Xem [PROTOCOL.md](PROTOCOL.md).
- Match tick 30 Hz, snapshot khoảng 10 Hz. Server quyết định gia tốc/va nhà, đường đạn, điểm rơi, damage/HP, hiệu ứng bùn và radar. Client dự đoán self và replay input chưa ACK, nội suy xe khác trễ ba tick. Log tick trung bình/cao nhất và input bị bỏ; client giữ số đo trễ ACK/độ sửa vị trí.
- Chưa có ammo/reload, loot, bo, room browser, nhiều match cùng lúc hoặc Redis integration. Chưa kiểm thử trên mạng di động/Wi-Fi thật ở 50–100 ms, tải 50 người/trận hoặc 10.000 người online.

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

Sau khi API đang chạy: `dotnet build Game.sln --no-restore`; trong `client` chạy `npm run build`, `npm run format:check`, `npm run test:realtime`, `npm run test:movement`, `npm run test:movement:server`, `npm run test:weapons`. Bài `npm run test:browser` cần Vite và Edge CDP tại cổng 9224; có giả lập trễ 80 ms. Bài `npm run test:layout` chỉ cần Vite và Edge CDP, kiểm tra 320×568, 390×844, 844×390 và PC 1366×768. Test browser giả lập kích thước/chạm, chưa xác nhận trên thiết bị thật.

## Việc tiếp theo

Theo [PHASES.md](PHASES.md), bước tiếp theo là room lifecycle/nhiều match độc lập, rồi ammo/reload, luật kill/score và item. Trước khi nâng lên 50 người/trận hoặc 10.000 online, đo tải và thiết kế nhiều match/process; Redis chỉ cần khi nhiều instance phải chia sẻ thông tin phù hợp, không đặt từng tick di chuyển qua Redis.
