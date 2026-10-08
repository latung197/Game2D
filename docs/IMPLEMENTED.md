# Kiểm kê code hiện tại

Tài liệu này ghi đúng phần đang chạy trong repo ngày 2026-10-08. Lộ trình còn lại ở [PHASES.md](PHASES.md); byte layout chi tiết ở [PROTOCOL.md](PROTOCOL.md).

## Backend

| Vị trí | Đã triển khai |
|---|---|
| `Game.Api` | ASP.NET Core host, JWT, CORS, auth rate limit, migration, `/health`, auth REST và `/hubs/game` |
| `Game.Infrastructure` | EF Core/Npgsql lưu tài khoản; state trận không lưu DB |
| `Game.Shared/Contracts` | Binary protocol v4, codec little-endian cho input, fire, snapshot, laser, radar, impact |
| `Game.Realtime` | Hub xác thực JWT, route lệnh, publisher phát byte payload bằng SignalR MessagePack |
| `Game.Server/Matches` | Development match tối đa 10 người, tick 30 Hz, movement/collision, HP, radar, projectile, bùn |
| `Game.Application` | Auth service, abstraction kết nối Hub/server/publisher |

Client gửi input 10 byte khoảng 20 lần/giây; server kiểm tra sequence và giới hạn trục, tự tính vị trí tối đa 280 unit/s, va nhà và biên map. Match xử lý tối đa 1024 command/tick, gửi snapshot riêng cho từng người khoảng 10 Hz qua outbound worker, chỉ giữ bản snapshot mới nhất. Không chờ DB hoặc network trong tick. Đạn thường, tên lửa, pháo và bùn được server tạo/di chuyển/va chạm; laser là hitscan. Server tính damage, nổ lan, HP, chết và hồi sinh sau 3 giây. Xe trong vũng bùn giảm tốc xuống 126 unit/s trong 4 giây tồn tại của vũng. Lệnh Fire nhận 5 byte gồm loại đạn và tầm bắn, không tin tọa độ/damage do client gửi.

| Vũ khí | Tầm tối đa | Cooldown | Hiệu ứng |
|---|---:|---:|---|
| Đạn xa | 1800 | 7 tick | 25 HP, bay 1100 unit/s |
| Laser | 2800 | 12 tick | 25 HP, tia tức thời bị nhà chắn |
| Tên lửa | 2200 | 30 tick | Nổ 40 HP trong bán kính 110 |
| Pháo | 1350 | 45 tick | Rơi sau 45 tick, nổ 45 HP trong bán kính 145 |
| Bùn | 1200 | 20 tick | Vũng tồn tại 120 tick, làm chậm 55% |

Snapshot v4 dài `11 + 10 × số xe + 8 × số projectile + 7 × số vũng` byte. Event laser 15 byte và impact 12 byte. Radar bật 6 giây, hồi 30 giây; server lọc xe trong bụi và vật thể xa theo người xem. Redis có trong Compose nhưng runtime chưa dùng. `Game.Domain` vẫn là khung. Chưa có ammo/reload, item nhặt, bo, nhiều match song song, room browser, prediction/interpolation hoặc cơ chế scale tới 50 người/trận.

## Client

React/Vite/Phaser có auth, lái thử offline và vào development match online. Map Graphics 3200×2200 có nhà, đường, bụi; camera, minimap, radar phóng to, HUD HP/trạng thái, điều khiển chuột/bàn phím hoặc hai cần ảo và nút bắn trên điện thoại. Thanh vũ khí chọn năm loại bằng nút hoặc phím 1–5; pháo có thanh chọn tầm. Client render projectile từ snapshot, cung bay pháo, laser, vụ nổ và vũng bùn. Online dùng vị trí/HP do server gửi. Offline là bản lái thử hiệu ứng, không mô phỏng cùng luật server.

## Kiểm thử đã thực hiện

| Lệnh | Kết quả |
|---|---|
| `dotnet build Game.sln --no-restore` | Build backend |
| `cd client; npm run build` | TypeScript và Vite build |
| `cd client; npm run format:check` | Kiểm tra format |
| `cd client; npm run test:realtime` | Hai client, binary snapshot/laser, HP/death/respawn, stealth/radar, input sai, reconnect |
| `cd client; npm run test:weapons` | Đường đạn, nổ lan, pháo, bùn làm chậm/hết hạn, impact binary |
| `cd client; npm run test:browser` | Hai tab Edge và bố cục điều khiển chạm portrait/landscape |

Kiểm thử browser dùng Edge giả lập kích thước/chạm, chưa thay thế test trên Safari iOS hoặc thiết bị Android thật. Các bài test realtime dùng PostgreSQL tạm cổng 55432 trên máy phát triển. Chưa có load test 50 người/trận hoặc 10.000 người đồng thời.
