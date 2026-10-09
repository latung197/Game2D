# Kiểm kê code hiện tại

Tài liệu này ghi đúng phần đang chạy trong repo ngày 2026-10-09. Lộ trình còn lại ở [PHASES.md](PHASES.md); byte layout chi tiết ở [PROTOCOL.md](PROTOCOL.md).

## Backend

| Vị trí | Đã triển khai |
|---|---|
| `Game.Api` | ASP.NET Core host, JWT, CORS, auth rate limit, migration, `/health`, auth REST và `/hubs/game` |
| `Game.Infrastructure` | EF Core/Npgsql lưu tài khoản; state trận không lưu DB |
| `Game.Shared/Contracts` | Binary protocol v5, codec little-endian cho input, fire, snapshot, laser, radar, impact |
| `Game.Realtime` | Hub xác thực JWT, route lệnh, publisher phát byte payload bằng SignalR MessagePack |
| `Game.Server/Matches` | Development match tối đa 10 người, `PlayerMovementSystem` tick 30 Hz với gia tốc/va nhà, HP, radar, projectile, bùn |
| `Game.Application` | Auth service, abstraction kết nối Hub/server/publisher |

Client gửi input 14 byte ở tick cố định 30 Hz; server kiểm tra sequence, clientTick và giới hạn trục, tự tính gia tốc 1000 unit/s², phanh 1400 unit/s², tốc độ tối đa 280 unit/s, xoay 10 rad/s, va nhà và biên map. Match xử lý tối đa 1024 command/tick, gửi snapshot riêng cho từng người khoảng 10 Hz qua outbound worker, chỉ giữ bản snapshot mới nhất. Log mỗi 30 giây ghi thời gian tick trung bình/cao nhất và số command/input bị bỏ; client đo trễ ACK và độ sửa vị trí. Không chờ DB hoặc network trong tick. Đạn thường, tên lửa, pháo và bùn được server tạo/di chuyển/va chạm; laser là hitscan. Server tính damage, nổ lan, HP, chết và hồi sinh sau 3 giây. Xe trong vũng bùn giảm tốc xuống 126 unit/s. Lệnh Fire nhận 5 byte gồm loại đạn và tầm bắn, không tin tọa độ/damage do client gửi.

| Vũ khí | Tầm tối đa | Cooldown | Hiệu ứng |
|---|---:|---:|---|
| Đạn xa | 1800 | 7 tick | 25 HP, bay 1100 unit/s |
| Laser | 2800 | 12 tick | 25 HP, tia tức thời bị nhà chắn |
| Tên lửa | 2200 | 30 tick | Nổ 40 HP trong bán kính 110 |
| Pháo | 1350 | 45 tick | Rơi sau 45 tick, nổ 45 HP trong bán kính 145 |
| Bùn | 1200 | 20 tick | Vũng tồn tại 120 tick, làm chậm 55% |

Snapshot v5 dài `15 + 14 × số xe + 8 × số projectile + 7 × số vũng` byte; header có ACK cho người nhận, mỗi xe có vận tốc. Event laser 15 byte và impact 12 byte. Radar bật 6 giây, hồi 30 giây; server lọc xe trong bụi và vật thể xa theo người xem. Redis có trong Compose nhưng runtime chưa dùng. `Game.Domain` vẫn là khung. Chưa có ammo/reload, item nhặt, bo, nhiều match song song, room browser hoặc cơ chế scale tới 50 người/trận.

## Client

React/Vite/Phaser có auth, lái thử offline và vào development match online. Map Graphics 3200×2200 có nhà, đường, bụi; camera, minimap, radar phóng to, HUD HP/trạng thái, điều khiển chuột/bàn phím hoặc hai cần ảo và nút bắn trên điện thoại. Giao diện trong trận ưu tiên điện thoại: khung game dùng chiều cao còn lại của viewport, thanh đầu trang/HUD/minimap/đạn thu gọn; màn hình ngang chuyển thanh đạn sang trái để không che xe. Thanh vũ khí chọn năm loại bằng nút hoặc phím 1–5; pháo có thanh chọn tầm. Client render projectile từ snapshot, cung bay pháo, laser, vụ nổ và vũng bùn. `Movement.ts` mô phỏng cùng quy tắc va nhà/gia tốc với server; `Prediction.ts` dự đoán self mỗi tick, loại input đã ACK và replay phần chờ; `Interpolation.ts` trễ ba tick để làm mượt xe khác, xoá ngay xe bị ẩn/rời trận. Sai lệch nhỏ được làm mượt, chết/hồi sinh hoặc sai lệch lớn áp ngay. Online vẫn lấy HP và vị trí cuối cùng từ server. Offline dùng cùng luật movement nhưng combat chỉ là hiệu ứng xem thử.

## Kiểm thử đã thực hiện

| Lệnh | Kết quả |
|---|---|
| `dotnet build Game.sln --no-restore` | Build backend |
| `cd client; npm run build` | TypeScript và Vite build |
| `cd client; npm run format:check` | Kiểm tra format |
| `cd client; npm run test:realtime` | Hai client, binary snapshot/laser, HP/death/respawn, stealth/radar, input sai, reconnect |
| `cd client; npm run test:movement` | Gia tốc, va nhà, replay input, sửa vị trí và nội suy/ẩn xe |
| `cd client; npm run test:movement:server` | Server giới hạn tốc độ, va nhà, bác sequence/clientTick sai và ACK theo người |
| `cd client; npm run test:weapons` | Đường đạn, nổ lan, pháo, bùn làm chậm/hết hạn, impact binary |
| `cd client; npm run test:browser` | Hai tab Edge, lái qua WebSocket với trễ giả lập 80 ms và bố cục chạm portrait/landscape |
| `cd client; npm run test:layout` | Preview offline ở 320×568, 390×844, 844×390 và PC 1366×768; kiểm tra không tràn viewport, thanh đạn/slider và nút chạm không chồng nhau |

Kiểm thử browser dùng Edge giả lập kích thước/chạm, chưa thay thế test trên Safari iOS hoặc thiết bị Android thật. Các bài test realtime dùng PostgreSQL tạm cổng 55432 trên máy phát triển. Chưa có load test 50 người/trận hoặc 10.000 người đồng thời.
