# Chức năng đã triển khai và mức kiểm chứng

Cập nhật 2026-10-11. Tài liệu này mô tả code hiện tại; cấu hình chi tiết ở [GAMEPLAY.md](GAMEPLAY.md), API phòng ở [ROOMS.md](ROOMS.md), payload ở [PROTOCOL.md](PROTOCOL.md).

## Backend

| Phần | Code/dữ liệu | Trạng thái |
|---|---|---|
| Tài khoản | `Game.Api`, `Game.Infrastructure` | Đăng ký/đăng nhập, password hash, JWT, `/api/me`, auth rate limit, PostgreSQL |
| Phòng | `MatchManager`, `RoomRuntime`, `RoomEndpoints` | Host tạo/bắt đầu/kết thúc, vào/rời/ghép nhanh, 5/10/20/25/50 người, reconnect 30 giây, 64 phòng/process |
| Runtime | `MatchRuntime`, `PlayerMovementSystem`, `DamageService` | Tick 30 Hz, server giữ tọa độ/HP/va chạm, input sequence/ACK, respawn chỉ ở Development |
| Map | `data/map.json`, `MapData` | 4000 × 3000, nhà chặn xe và đạn, bụi che xe, cây/đèn trang trí; client/server dùng chung JSON |
| Tầm nhìn | `MatchRuntime.VisibleSnapshots` | AOI 850 unit, ẩn bụi sau 145, radar toàn map, đèn pha phát hiện trong nón 570 unit khi không bị nhà chắn |
| Vũ khí | `data/weapons.json`, `WeaponRules` | Chín súng: đạn thường, laser, tên lửa, pháo, bùn, liên thanh, bắn tỉa, lựu đạn, xung điện; chỉ số/thuộc tính trong HUD, ammo/reload, projectile/hitscan, splash, kill feed |
| Loot và túi đồ | `data/items.json`, `data/loot_tables.json`, `LootSystem` | 16 spawn, ba item, stack/starting count, pickup chỉ cất vào túi, dùng do server áp, giữ qua reconnect |
| Bo | `data/game_rules.json`, `ZoneSystem`, `ZoneDamageSystem` | Bo ban đầu phủ cả map, năm phase, nhịp 8–19 phút theo phòng, trừ HP liên tục bên ngoài |
| Kết quả | `MatchLifecycle`, `EfMatchResultStore` | Winner/placement, event kết thúc, ghi transaction PostgreSQL và chống cộng trùng |

`MatchManager` tách queue command, snapshot và worker phát event/lưu DB, không gọi DB trong tick. SignalR MessagePack chở record room/item/zone; movement, shot, impact dùng binary v6. Client gửi yêu cầu, server xác thực room từ binding connection và JWT.

## Client

React/Vite xử lý xác thực, sảnh, HUD và bảng kết quả; Phaser xử lý map, xe, đạn, ánh sáng, item và bo. `GameNetworkAdapter` nối SignalR với scene; `GameEventBus` quản lý listener; `Prediction`/`Movement` xử lý lái mượt với ACK; `Interpolation` làm mượt xe khác. Giao diện có nút/font Kenney UI Pack 2.0 CC0 (xem [ASSETS.md](ASSETS.md)).

Map có thêm khu đông/nam, đường và nhà chi tiết; xe render nhỏ hơn và camera điện thoại rộng hơn. Minimap có sương mù đã khám phá, vùng ngoài bo, item và địch được nhìn thấy. Chu kỳ sáng/tối, chế độ ngày/đêm, đèn pha và radar đều có nút; đèn pha còn gửi trạng thái cho server. Túi đồ online hiện ba ô chạm được, số lượng, phím Q/T/G; E nhặt vật phẩm gần. Chế độ offline khám phá/tập bắn vẫn hoạt động.

Map tĩnh được bake thành texture một lần khi scene khởi tạo; độ phân giải tự giảm theo giới hạn texture GPU. Nhãn xe không vẽ lại chữ khi nội dung giữ nguyên. Đồng hồ nội suy xe khác tiến một chiều qua các snapshot; xe mình làm mượt sai lệch nhỏ sau ACK. Edge headless mô phỏng điện thoại 390×844/hai người online đo p50/p95 frame khoảng 16,7/16,8 ms sau sửa, so với 50/66,7 ms khi map vector được vẽ lại mỗi frame. FPS máy thật cần đo riêng.

Browser test còn ép GPU giả lập giới hạn texture 2048 để kiểm tra map nửa độ phân giải, và bắt exception JavaScript. Phaser được cấu hình `noAudio` vì bản hiện tại chưa phát âm thanh; việc này tránh lỗi `AudioContext` đã đóng khi scene bị tháo và trang reload.

## Kiểm chứng đã chạy

| Lệnh | Kết quả/giới hạn |
|---|---|
| `dotnet build --no-restore` | Thành công, 0 warning/error |
| `dotnet run --no-restore --project tests/Game.RoomProbe/Game.RoomProbe.csproj` | Qua room, combat, loot, bo, 50 spawn, winner |
| `cd client; npm run build` | TypeScript/Vite thành công; cảnh báo bundle Phaser lớn hiện có |
| `cd client; npm run test:loot` | Qua hai client nhặt tranh chấp, dùng cứu thương/radar |
| `cd client; npm run test:rooms` | Qua hai phòng cách ly, host, reconnect, quick join |
| `cd client; npm run test:match` | Qua bo, winner, DB và quyền participant |
| `cd client; npm run test:movement` | Qua prediction/collision/interpolation |
| `cd client; npm run test:layout` | Qua viewport 320×568, 390×844, 844×390, 1366×768 trên Edge headless |

Các integration test có đăng ký tài khoản phải chạy lần lượt vì auth rate limit 10 request/phút/IP; nếu 429 thì chờ cửa sổ rate limit. Layout test là mô phỏng viewport, chưa phải kiểm thử nhiệt/FPS trên máy thật.

## Giới hạn và việc còn mở

Phòng/túi đồ giữa trận và queue kết quả ở memory của một API process; crash có thể mất trận hoặc kết quả chưa ghi. Chưa có Redis room routing, multi server ownership, outbox, leaderboard/cosmetic, đo tải 50 kết nối lâu dài hoặc 10.000 online. Chưa có chuẩn production cho tải lớn; xem [ARCHITECTURE.md](ARCHITECTURE.md) và [PHASES.md](PHASES.md). Runtime 50 người đã có sức chứa và spawn hợp lệ, không đồng nghĩa với 50 người ổn định trên mạng/thiết bị thật.
