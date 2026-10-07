# Bàn giao cho máy hoặc phiên làm việc khác

**Cập nhật:** 2026-10-08. **Trạng thái:** Phase 1 xong; Phase 2 chưa bắt đầu. Đây là tài liệu trạng thái ngắn, còn kiến trúc chi tiết trong [ARCHITECTURE.md](ARCHITECTURE.md), lộ trình trong [PHASES.md](PHASES.md) và cách chạy trong [SETUP.md](SETUP.md).

## 1. Sự thật cần giữ khi tiếp tục

- Source ở thư mục gốc có `Game.sln` (.NET 10), `src/Game.Api`, `Game.Application`, `Game.Domain`, `Game.Infrastructure`, `Game.Realtime`, `Game.Server`, `Game.Shared`, và `client` (TypeScript/React/Vite/Phaser 3).
- Code gameplay hiện chỉ là **một scene lái xe offline trên client**. `Game.Server`, `Game.Realtime`, `Game.Domain`, `Game.Shared` đang là project khung và build được. Chưa có SignalR Hub, fixed simulation loop, room, projectile, HP, safe zone hay loot.
- Backend hiện có `users` trong PostgreSQL, migration `202610080001_InitialAuth`, `register`, `login`, `/api/me`, JWT access 30 phút và rate limit auth. Password dùng `PasswordHasher<Account>`.
- Frontend dùng Vite proxy `/api` → `127.0.0.1:5080`. Access token được giữ trong `sessionStorage`; trang có lái thử offline ngay cả khi API tắt.
- Map hiện được vẽ bằng Phaser Graphics, kích thước 2400×1600, collision đơn giản với các hình nhà trong `client/src/game/config/map.ts`. Đây là placeholder, chưa phải tilemap.
- Phong cách đã chọn: phố xá pastel, viền đậm, ánh đèn ấm, xe tự chế vui nhộn; chỉ lấy cảm hứng thẩm mỹ từ ảnh tham khảo, không sao chép asset/bố cục.

## 2. Trạng thái môi trường máy gốc

- Máy gốc có PostgreSQL 16 chạy ở `localhost:5432`; đã tạo role development `scrap` và database riêng `scrap_street` cho game. Người dùng đã cung cấp credential quản trị để tạo DB, **credential đó không được ghi vào source hoặc tài liệu**.
- `src/Game.Api/appsettings.Development.json` chứa connection và JWT key **mẫu cho development**; không mang nguyên vào production. Database và account trong đó là dữ liệu riêng của máy gốc, không nằm trong source.
- Account `demo` được tạo thủ công qua API trên DB máy gốc để xem nhanh; máy khác không có account này và nên tự đăng ký.
- API và Vite đã từng được bật ở `127.0.0.1:5080` và `127.0.0.1:5173`. Phiên làm việc mới phải kiểm tra cổng và khởi chạy lại nếu cần; không dựa vào tiến trình của phiên cũ.
- Máy gốc chưa cài Docker CLI nên `compose.yaml` chưa được smoke test. PostgreSQL tạm dùng cho kiểm thử đã được dừng/xóa; không còn dependency vào nó.
- Repo hiện chưa được `git init`; để chuyển máy, sao chép thư mục hoặc đưa vào version control, giữ `client/package-lock.json`. `.gitignore` đã loại build output, dependency, key local, runtime tạm.

## 3. File cần mở đầu tiên

1. `README.md`: bản đồ tài liệu.
2. `docs/SETUP.md`: cài và chạy lại.
3. `docs/IMPLEMENTED.md`: file và luồng thật của Phase 1.
4. `docs/PRODUCT_SPEC.md`: các yêu cầu sản phẩm từ brief ban đầu.
5. `docs/PHASES.md`: phạm vi/acceptance từng phase.
6. `docs/ARCHITECTURE.md`: ranh giới project, nguồn sự thật, protocol/simulation dự kiến.
7. `src/Game.Api/Program.cs`, `src/Game.Application/Accounts/AuthService.cs`, `src/Game.Infrastructure/Persistence/*`: đường đi của auth thật.
8. `client/src/ui/App.tsx`, `client/src/game/PhaserGame.tsx`, `client/src/game/scenes/GameScene.ts`: UI và gameplay offline thật.

## 4. Lệnh xác nhận baseline

```powershell
dotnet restore Game.sln
dotnet build Game.sln
cd client
npm ci
npm run build
npm run format:check
```

Muốn chạy trực tiếp: khởi động PostgreSQL và API `dotnet run --project src/Game.Api --urls http://127.0.0.1:5080` trong terminal ở gốc; trong terminal khác chạy `cd client`, `npm run dev`. Chi tiết credential/Compose và xử lý lỗi ở `docs/SETUP.md`.

Kết quả đã ghi nhận cuối Phase 1: backend build 0 warning/0 error; frontend build và format check đạt; trang HTTP 200, `/health` trả `ok`; DB migration và auth đã smoke test; duplicate username 409, password sai 401. Frontend build có warning chunk Phaser lớn, nhưng game code đã được lazy load.

## 5. Việc tiếp theo: Phase 2

**Mục tiêu ngắn:** hai account mở hai trình duyệt, vào một development match và thấy vị trí nhau qua server. Đưa input qua SignalR; identity từ JWT; state ở `MatchRuntime` riêng; Hub chỉ route. Theo [PHASES.md](PHASES.md), server cần nhận input chứ không tin vị trí/damage từ client. Ở Phase 2 có thể render snapshot chưa mượt; Phase 3 thêm prediction/reconciliation/interpolation.

**Thứ tự triển khai đề xuất:**

1. Định nghĩa contract versioned trong `Game.Shared`; thiết kế `IMatchCommandGateway`/`IGameEventPublisher` ở Application.
2. Tạo `MatchManager` và một `MatchRuntime` cho development match, queue có giới hạn và fixed tick 30 Hz; thêm PlayerRuntime và movement server cơ bản.
3. Tạo SignalR Hub JWT và connection registry; định danh bằng `Context.User`/claims, không cho payload quyết định player ID.
4. Tạo `RealtimeClient` độc lập Phaser; `GameNetworkAdapter`/`ClientWorldState`; scene chỉ render self/remote từ state.
5. Kiểm thử hai client, disconnect/reconnect, input sai/trùng, isolation của state; sau đó cập nhật lại tài liệu này.

**Không làm sớm:** phát triển hàng loạt weapon/item, tăng cap 50, binary protocol, cosmetics hoặc đổi toàn bộ UI. Các phần đó có phase riêng và phụ thuộc vào đường realtime ổn định.

## 6. Những hạn chế/rủi ro đang biết

| Vấn đề | Tác động | Phase xử lý |
|---|---|---|
| Movement/aim/collision ở client | Không dùng được để xác nhận gameplay online | 2–3 |
| Map Graphics và collision theo rectangle | Chưa đủ map/collision cho combat lớn | 3–4, 7 |
| Không có refresh token/logout server | User cần đăng nhập lại khi JWT 30 phút hết hạn; logout chỉ xóa token phía client | auth hardening trước beta/Phase 10 |
| `sessionStorage` giữ access JWT | Cần đánh giá lại chính sách session/XSS trước phát hành công khai | trước beta |
| API tự migrate DB lúc startup | Thuận tiện MVP, cần quy trình migration có kiểm soát khi nhiều instance | trước scale production |
| Data Protection key ở volume/file local chưa có mã hóa at rest | Cấu hình key management/chứng chỉ cho production | trước deploy công khai |
| `compose.yaml` chưa được chạy trên máy gốc | Cần smoke test trên máy có Docker | khi chuyển máy/có Docker |
| Chưa có test tự động | Rule gameplay mới cần test có ý nghĩa khi thêm | từ Phase 2 |
| Chưa có mobile touch controls | Có thể xem UI mobile nhưng game lái bằng bàn phím/chuột | sau vertical slice |

## 7. Mẫu yêu cầu để tiếp tục ở phiên mới

> Hãy đọc `README.md` và toàn bộ `docs/` trong repo Scrap Street. Phase 1 đã hoàn thành; hiện cần làm Phase 2 theo `docs/PHASES.md`. Trước khi sửa hãy kiểm tra `dotnet build Game.sln` và `npm run build`, đối chiếu `docs/HANDOFF.md` với code. Giữ server authoritative, Hub chỉ route, MatchRuntime cô lập, frontend networking tách khỏi Phaser. Sau khi làm, cập nhật tài liệu, nêu file tạo/sửa, cách chạy, test và kết quả thực tế.

Mẫu này là định hướng; code hiện tại luôn là nguồn kiểm chứng cuối cùng nếu tài liệu bị cũ.
