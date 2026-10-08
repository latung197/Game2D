# Kiểm kê code hiện tại

Tài liệu này mô tả tính năng đã triển khai, không phải toàn bộ yêu cầu sản phẩm. Kế hoạch nằm trong [PHASES.md](PHASES.md).

## Backend

| Vị trí | Đã triển khai |
|---|---|
| `Game.Api/Program.cs` | Host ASP.NET Core, JWT, CORS, rate limit auth, migration khi khởi động, `/health`, `/api/auth/register`, `/api/auth/login`, `/api/me`, `/hubs/game` |
| `Game.Application/Accounts/AuthService.cs` | Chuẩn hóa username, kiểm tra input, hash/verify password, phát JWT |
| `Game.Infrastructure/Persistence/*` | EF Core/Npgsql, bảng `users`, unique username, migration `InitialAuth` |
| `Game.Shared/Contracts/*` | Protocol version 3, byte codec little-endian, input 10 byte, snapshot `11 + 9 × số xe` byte, tia bắn 15 byte, radar response 6 byte |
| `Game.Application/Abstractions/IMatchCommandGateway.cs` | Interface Hub → server và server → publisher |
| `Game.Realtime/Hubs/*` | Hub yêu cầu JWT, lấy player ID từ claims; publisher gửi snapshot và tia bắn qua SignalR group |
| `Game.Realtime/Connections/ConnectionRegistry.cs` | Theo dõi connection ID và player ID; bỏ player khi connection cuối rời đi |
| `Game.Server/Matches/*` | Development match cố định, player runtime, command queue 1024, tick 30 Hz, snapshot khoảng 10 Hz |

`Game.Domain` vẫn là project khung. `Game.Api` là host duy nhất; chưa có process game server riêng. Redis nằm trong Compose nhưng chưa được code sử dụng. Database chỉ lưu tài khoản; state trận ở memory.

### Auth

`register` nhận username 3–24 ký tự ASCII (chữ/số/gạch dưới) và password 12–128 ký tự, lowercase username, dùng `PasswordHasher<Account>`, trả `playerId`, `username`, `accessToken`. Username trùng trả 409. `login` sai trả 401. JWT hết hạn sau 30 phút, chứa account GUID trong `sub`. `/api/me` yêu cầu bearer token. Hai endpoint auth được rate limit 10 request/phút/IP. `sessionStorage` giữ token phía client, logout chỉ xóa token; chưa có refresh token hoặc server revocation.

### Realtime

Client kết nối `/hubs/game` bằng SignalR MessagePack với JWT rồi gọi `JoinMatch`. Hub lấy GUID người chơi từ claim đã xác thực, không dùng ID trong payload. Runtime tối đa 10 player; join thành công mới vào SignalR group. Input gửi dưới dạng 10 byte gồm version, sequence, trục di chuyển, góc ngắm và flags dự phòng. Gói sai version/độ dài/trục, hoặc sequence cũ/trùng bị bỏ. Server chuẩn hóa đường chéo, di chuyển tối đa 280 world units/giây, chặn biên map và bounding box nhà. Server không nhận tọa độ hay damage từ client. Xem [PROTOCOL.md](PROTOCOL.md).

`MatchManager` đọc tối đa 1024 command mỗi tick, gọi `MatchRuntime.Step()` mỗi 1/30 giây. Snapshot riêng cho từng người được xếp vào queue chỉ giữ bản mới nhất mỗi 3 tick; worker riêng mã hóa byte rồi gửi SignalR, không chờ network trong tick. Lệnh Fire giới hạn 7 tick, server tính tia va vào nhà/xe/rìa map và gửi sự kiện binary qua queue riêng. Mỗi lần trúng trừ 25/100 HP; xe chết ngừng di chuyển/bắn và hồi sinh sau 3 giây. Lệnh radar được server giới hạn 6 giây hiệu lực, 30 giây hồi. GUID/username gửi qua roster lúc join và event khi player vào/rời trận; snapshot chỉ dùng network ID 2 byte. Chưa có projectile vật lý, ammo, item nhặt trên map, zone, room lifecycle hay nhiều match đang hoạt động.

## Client

`client/src/ui/App.tsx` có landing, đăng ký/đăng nhập và lái thử offline. Sau đăng nhập, `PhaserGame` tạo `GameNetworkAdapter`, kết nối SignalR, tự join/rejoin. `ClientWorldState` giữ snapshot mới nhất. `GameScene` gửi input khoảng 20 lần/giây, render vị trí self/remote từ snapshot, dọn xe remote khi rời trận. Chưa có prediction/reconciliation/interpolation nên chuyển động online có thể giật.

Map Phaser Graphics 3200×2200 có mười nhà, đường và bụi cây; dữ liệu nhà ở `client/src/game/config/map.ts`. Offline dùng WASD/phím mũi tên, chuột xoay turret, camera follow và collision đơn giản. Online dùng cùng map/điều khiển, nhưng vị trí do server quyết định. HUD có HP, minimap, radar mở bản đồ lớn theo xác nhận của server, hai cần ảo và nút bắn trên màn hình cảm ứng. Server chỉ gửi xe trong bán kính 850 units; xe đang nấp bụi chỉ hiện khi lại gần 145 units, trừ khi radar đang bật. Chưa có tilemap hay physics engine.

## Kiểm thử đã thực hiện

| Kiểm tra | Kết quả |
|---|---|
| `dotnet build Game.sln --no-restore` | Thành công, 0 warning/0 error |
| `cd client; npm run build` | Thành công; Vite cảnh báo chunk Phaser lớn và annotation trong SignalR package |
| `cd client; npm run format:check` | Thành công; Prettier dùng `endOfLine: auto` để chấp nhận LF/CRLF theo file trên Windows |
| `npm run test:realtime` | Hai account thấy nhau qua byte codec; bắn trúng 25 HP/phát, giới hạn nhịp bắn, chết/hồi sinh, stealth/radar server, input sai, reconnect; snapshot hai xe 29 byte, tia bắn 15 byte, khoảng 10 snapshot/giây |
| `npm run test:browser` | Hai tab Edge headless render Phaser; payload WebSocket chứa snapshot hai xe đo được 47 byte; viewport điện thoại dọc/ngang và điều khiển chạm hoạt động |
| API không có player | Working set 87.6 → 87.5 MB, private memory 44.6 → 44.5 MB trong 5 giây quan sát; không thấy tăng liên tục trong mẫu ngắn này |

Kiểm thử dùng PostgreSQL tạm cổng 55432 vì mật khẩu role `scrap` của PostgreSQL đang chạy tại cổng 5432 không khớp cấu hình mẫu. Không dùng Docker; Compose chưa được smoke test. Browser test mới dùng giả lập kích thước/chạm của Edge, chưa thử Safari iOS hay thiết bị thật. Chưa có test riêng cho rule simulation với độ trễ hoặc tải lớn.
