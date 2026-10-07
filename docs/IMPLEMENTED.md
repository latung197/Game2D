# Kiểm kê phần đã triển khai ở Phase 1

Tài liệu này mô tả **code đang tồn tại**, không mô tả tính năng mong muốn. Dùng cùng [HANDOFF.md](HANDOFF.md) khi mở repo trong phiên khác.

## 1. Cấu trúc thực tế

```text
Game.sln
src/
  Game.Api/
    Program.cs
    Authentication/JwtTokenIssuer.cs
    appsettings.json
    appsettings.Development.json
    Dockerfile
    Properties/launchSettings.json
  Game.Application/Accounts/AuthService.cs
  Game.Infrastructure/Persistence/
    GameDbContext.cs
    EfAccountRepository.cs
    Migrations/InitialAuth.cs
    Migrations/GameDbContextModelSnapshot.cs
  Game.Domain/             # project khung
  Game.Realtime/           # project khung
  Game.Server/             # project khung
  Game.Shared/             # project khung
client/
  index.html
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
  .prettierrc.json
  src/
    main.tsx
    style.css
    ui/App.tsx
    services/api/auth.ts
    game/PhaserGame.tsx
    game/config/map.ts
    game/scenes/GameScene.ts
compose.yaml
.env.example
.gitignore
README.md
docs/
```

Các project `Game.Domain`, `Game.Realtime`, `Game.Server`, `Game.Shared` có `.csproj` và project reference cần thiết, **chưa có class gameplay**. `Game.Api` hiện là host duy nhất; chưa có process game server riêng. `Game.sln` là solution tiêu chuẩn theo yêu cầu.

## 2. Luồng backend hiện tại

### Khởi động

`Game.Api/Program.cs` đọc `ConnectionStrings:Game` và `Jwt:Key`; dừng sớm nếu thiếu hoặc key ngắn hơn 32 byte UTF-8. Nó đăng ký `GameDbContext` dùng Npgsql, `EfAccountRepository`, `AuthService` và `JwtTokenIssuer`. Sau khi build host, API gọi `Database.MigrateAsync()` **trước khi mở cổng**. Log được đưa ra console. Key ring Data Protection lưu trong `.keys` ở local hoặc đường dẫn cấu hình. Middleware gồm CORS, authentication, authorization và rate limiter.

`appsettings.Development.json` là cấu hình local mẫu: `scrap_street`, role `scrap`, cổng 5432 và JWT key development. Environment variable dạng `ConnectionStrings__Game`, `Jwt__Key` ghi đè giá trị mẫu. `launchSettings.json` của template có profile Development; lệnh trong [SETUP.md](SETUP.md) chọn URL 5080. `Dockerfile` publish `Game.Api`, `compose.yaml` dựng PostgreSQL 16, Redis 7 và API. Redis chưa được DI hoặc sử dụng bởi code.

### Đăng ký

`POST /api/auth/register` nhận JSON `{ "username": "...", "password": "..." }`. Endpoint từ chối trường trống. `AuthService` trim và lowercase username; chỉ nhận 3–24 ký tự ASCII gồm chữ, số, `_`; password 12–128 ký tự. Service kiểm tra username tồn tại, băm mật khẩu bằng ASP.NET Core `PasswordHasher<Account>`, lưu `Account`. Repository còn bắt lỗi unique index từ PostgreSQL để xử lý race giữa hai request. Thành công trả `playerId`, `username`, `accessToken`. Username trùng trả 409, input không hợp lệ trả 400.

### Đăng nhập và xác thực

`POST /api/auth/login` trim/lowercase username rồi verify hash. Mật khẩu sai hoặc user không tồn tại trả 401. JWT chứa `sub` là GUID của account và tên user, hết hạn sau 30 phút; issuer/audience/key lấy từ config. `GET /api/me` yêu cầu bearer JWT, lấy user ID từ claim đã xác thực rồi đọc DB, trả `playerId` và `username`. Identity của người chơi **không lấy từ body request**. Hai endpoint auth được rate limit 10 request/phút/IP theo code hiện tại.

### PostgreSQL

Migration `202610080001_InitialAuth` tạo bảng vật lý `users`, các cột `Id` UUID, `Username` VARCHAR(24), `PasswordHash` TEXT, `CreatedAt` TIMESTAMPTZ và unique index `IX_users_Username`. EF model nằm trong `GameDbContext`, snapshot ở `GameDbContextModelSnapshot`. Không có bảng room/match/profile/refresh token. Tài khoản demo ở máy gốc là dữ liệu phát sinh khi test, không phải seed migration.

## 3. Luồng frontend hiện tại

`index.html` mount React qua `src/main.tsx`. `App.tsx` hiển thị landing page, form login/register, trạng thái tài khoản và nút **Lái thử offline**. `services/api/auth.ts` dùng `fetch` đến `/api/auth/login` hoặc `/api/auth/register`; Vite proxy những đường dẫn này sang API cổng 5080. Nếu API chưa chạy, trang vẫn mở được và hiện thông báo khi auth thất bại.

Frontend giữ `{playerId, username, accessToken}` trong `sessionStorage` sau auth; reload trong cùng browser session khôi phục thông tin đó. Nút Đăng xuất xóa session client. Hiện **không gọi `/api/me` để tái xác thực khi reload**, không có refresh token và không kiểm tra token hết hạn trước khi hiển thị tên; cần hoàn thiện khi làm session lifecycle.

`App.tsx` lazy load `PhaserGame.tsx` chỉ khi có account session hoặc bấm lái thử. Có thể vào thẳng màn xem bằng query `?preview=1`; đây là đường tắt của Phase 1, không phải quyền truy cập trận online. `PhaserGame.tsx` tạo Phaser Game trong React effect và destroy khi rời màn, dùng Scale.RESIZE. Gameplay loop nằm trong `GameScene.update`, không nằm trong React.

`config/map.ts` định nghĩa map 2400×1600 và sáu hình nhà. `GameScene.ts` vẽ nền, đường, vỉa hè, nhà và cây bằng Graphics/Text; tạo xe placeholder với logo ngôi sao. WASD/phím mũi tên tính vector di chuyển, chuẩn hóa đường chéo, tốc độ 280 world units/giây; `delta` được clamp 50 ms. Xe bị clamp vào biên map và bị chặn khi đi vào bounding rectangle của nhà có margin 28. Chuột đổi hướng turret. Camera theo xe với lerp 0,09. Không có tilemap, physics engine, bắn, projectile, damage hoặc multiplayer trong scene này.

`src/style.css` định hình landing/game theo phố pastel, viền đậm và màu ấm. CSS art ở landing và map Graphics là hình tự tạo cho placeholder, không dùng asset từ ảnh tham khảo. `client/.prettierrc.json` và script `format`/`format:check` giữ TSX/CSS dễ đọc.

## 4. Lệnh build và kiểm thử đã thực hiện

| Kiểm tra | Kết quả đã ghi nhận |
|---|---|
| `dotnet build Game.sln --no-restore` | Thành công, 0 warning, 0 error |
| `cd client && npm run build` | Thành công; Vite cảnh báo chunk Phaser lớn, đã lazy load scene |
| `cd client && npm run format:check` | Thành công |
| PostgreSQL tạm + API | Migration tạo bảng, register/login/`/api/me` thành công |
| Auth lỗi | Username trùng 409; mật khẩu sai 401 |
| PostgreSQL sẵn có trên máy gốc | API khởi động/migrate thành công trên DB riêng `scrap_street` |
| Frontend/API live | Frontend HTTP 200; `/health` trả `ok` |
| Browser screenshot | Landing và game scene render; đã sửa chiều cao canvas để xe ở trong viewport |

Chưa có test project tự động. Kiểm tra browser bằng ảnh chụp xác nhận render tĩnh, **không chứng minh đầy đủ hành vi điều khiển dưới mọi thiết bị**. Docker Compose chưa được chạy trên máy gốc. Khi bổ sung Phase 2, viết test cho simulation/input và chạy thử hai trình duyệt thật.

## 5. Các điểm nối để phát triển tiếp

1. Thêm contract trong `Game.Shared` và Hub trong `Game.Realtime`; đừng gọi SignalR trực tiếp từ `GameScene`.
2. Thêm `MatchManager`/`MatchRuntime`/fixed loop trong `Game.Server`, rồi route Hub command qua interface Application.
3. Thay movement offline bằng state authoritative khi vào match online. Có thể giữ màn lái thử offline riêng để phát triển UI/map.
4. Chuyển collision/map definition sang dữ liệu server hiểu được; Phaser chỉ là renderer.
5. Tạo migration riêng cho mỗi nhóm persistent data mới; không ghi tick state vào PostgreSQL.
6. Cập nhật tài liệu này sau mỗi phase, nhất là khi contract/protocol hoặc luồng chạy thay đổi.
