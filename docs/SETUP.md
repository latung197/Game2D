# Cài đặt và chạy Scrap Street trên máy mới

Tài liệu này mô tả trạng thái **Phase 1**. Game lái thử chạy offline trong trình duyệt. API đăng ký/đăng nhập cần PostgreSQL. Redis đã có trong `compose.yaml` nhưng chưa được code Phase 1 sử dụng.

## 1. Phần mềm cần có

| Thành phần | Mức đang dùng trong repo | Cách kiểm tra |
|---|---|---|
| .NET SDK | 10 | `dotnet --version` |
| Node.js | 22 khi phát triển Phase 1 | `node --version` |
| npm | 10 khi phát triển Phase 1 | `npm --version` |
| PostgreSQL | 16 trong môi trường phát triển/Compose | `psql --version` |
| Docker Compose | Tùy chọn, dùng nếu muốn chạy DB/API bằng container | `docker compose version` |

`client/package-lock.json` khóa phiên bản npm đã cài. Dùng `npm ci` trên máy mới để cài đúng các phiên bản trong lockfile. Nếu dùng phiên bản Node khác, cần kiểm tra yêu cầu của Vite trong `client/package.json` và chạy build lại.

## 2. Lấy source và kiểm tra

Sao chép toàn bộ thư mục dự án, bao gồm `Game.sln`, `src`, `client`, `compose.yaml`, `client/package-lock.json` và `docs`. Không cần sao chép `node_modules`, `bin`, `obj`, `client/dist`, `.keys`, `.runtime-*` hoặc ảnh chụp thử nghiệm. Các thư mục này được tạo lại khi chạy.

Từ thư mục gốc:

```powershell
dotnet restore Game.sln
dotnet build Game.sln
cd client
npm ci
npm run build
npm run format:check
```

Trên Linux/macOS, dùng cùng lệnh trong shell thông thường. Nếu PowerShell trên Windows chặn `npm.ps1`, gọi `npm.cmd` thay cho `npm`.

## 3A. Dùng PostgreSQL có sẵn

Tạo **database và role riêng** cho game. Trên máy hiện tại, role `scrap` và database `scrap_street` đã được tạo; trên máy khác phải tạo lại hoặc thay bằng role/database riêng. Ví dụ trong `psql` khi đăng nhập bằng tài khoản quản trị PostgreSQL:

```sql
CREATE ROLE scrap LOGIN PASSWORD 'scrap_dev';
CREATE DATABASE scrap_street OWNER scrap;
```

Chỉ chạy các lệnh `CREATE` nếu role/database chưa tồn tại. `scrap_dev` là mật khẩu **chỉ dành cho local development**, trùng với cấu hình mẫu ở `src/Game.Api/appsettings.Development.json`. Có thể đặt mật khẩu khác và ghi đè connection string bằng biến môi trường; không ghi mật khẩu thật vào repo:

```powershell
$env:ConnectionStrings__Game = 'Host=127.0.0.1;Port=5432;Database=scrap_street;Username=scrap;Password=MAT_KHAU_CUA_BAN'
dotnet run --project src/Game.Api --urls http://127.0.0.1:5080
```

Tương đương trong Bash:

```bash
export ConnectionStrings__Game='Host=127.0.0.1;Port=5432;Database=scrap_street;Username=scrap;Password=MAT_KHAU_CUA_BAN'
dotnet run --project src/Game.Api --urls http://127.0.0.1:5080
```

Nếu giữ nguyên role `scrap`/mật khẩu development và chạy với `ASPNETCORE_ENVIRONMENT=Development`, chỉ cần lệnh `dotnet run` ở trên. API áp dụng migration `InitialAuth` khi khởi động. Nếu không kết nối được DB hoặc user không có quyền tạo bảng, API sẽ dừng và ghi lỗi; sửa connection/permission trước khi chạy lại.

Mở terminal khác tại thư mục gốc:

```powershell
cd client
npm ci
npm run dev
```

Truy cập `http://127.0.0.1:5173/`. Vite proxy `/api` và `/health` sang `http://127.0.0.1:5080` theo `client/vite.config.ts`.

## 3B. Dùng Docker Compose

Compose hiện có PostgreSQL, Redis và API. Frontend vẫn chạy bằng Vite trên máy host.

1. Sao chép `.env.example` thành `.env`.
2. Thay `JWT_KEY` bằng chuỗi ngẫu nhiên ít nhất 32 byte; không dùng giá trị mẫu.
3. Chạy `docker compose up -d --build` ở thư mục gốc.
4. Chạy `cd client`, `npm ci`, `npm run dev`.

Nếu máy đã có PostgreSQL chiếm cổng 5432, chọn cách **3A** hoặc bỏ mapping `5432:5432` của dịch vụ `postgres` trong `compose.yaml` trước khi dùng Compose. API container vẫn truy cập PostgreSQL qua hostname nội bộ `postgres`. Dữ liệu PostgreSQL nằm trong volume `scrap_postgres`; `docker compose down` không xóa volume trừ khi yêu cầu xóa volume rõ ràng.

`compose.yaml` là cấu hình development, gồm credential DB mẫu. Trước khi triển khai môi trường công khai, thay toàn bộ credential, giới hạn port, cấu hình HTTPS, secret và Data Protection phù hợp.

## 4. Kiểm tra bằng tay

1. `http://127.0.0.1:5080/health` trả `{ "status": "ok" }`.
2. Trang `http://127.0.0.1:5173/` hiển thị landing page.
3. Bấm **Lái thử offline**; xe xuất hiện ở giữa map. WASD/phím mũi tên di chuyển, chuột xoay hướng súng, camera theo xe, nhà chặn đường. Đây là chuyển động client offline, chưa có combat.
4. Đăng ký một tài khoản mới: username 3–24 ký tự ASCII gồm chữ/số/gạch dưới; mật khẩu 12–128 ký tự. Đăng xuất và đăng nhập lại. API lưu user trong bảng `users`.
5. Đăng nhập sai mật khẩu trả HTTP 401; đăng ký username trùng trả HTTP 409; `/api/me` chỉ trả dữ liệu khi có bearer token hợp lệ.

Tài khoản `demo` được tạo trong database **trên máy phát triển ban đầu**, không nằm trong source/migration. Máy mới cần tự đăng ký tài khoản.

## 5. Cấu hình và lưu ý vận hành

| Khóa | Nguồn trong Phase 1 | Ý nghĩa |
|---|---|---|
| `ConnectionStrings:Game` | `appsettings.Development.json` hoặc env `ConnectionStrings__Game` | Kết nối PostgreSQL |
| `Jwt:Issuer`, `Jwt:Audience`, `Jwt:Key` | File Development hoặc env `Jwt__*` | Phát/xác thực access JWT |
| `Client:Origin` | Development file hoặc env | CORS khi frontend gọi API trực tiếp |
| `DataProtection:KeysPath` | Mặc định `src/Game.Api/.keys`; Compose dùng volume | Key ring của ASP.NET Core |

Access token hiện có hạn 30 phút. Frontend giữ token trong `sessionStorage`; nút Đăng xuất chỉ xóa session ở client. Refresh token, logout server và lifecycle phiên đầy đủ là việc của phase tiếp theo. Không dùng secret Development hoặc credential mẫu cho production.

## 6. Nếu gặp lỗi

- **API không lên:** kiểm tra PostgreSQL, connection string, role có quyền tạo bảng và log migration.
- **Trang mở được nhưng auth báo không kết nối:** xác nhận API ở cổng 5080 và proxy trong `client/vite.config.ts`.
- **Cổng 5173/5080 bị dùng:** tắt tiến trình cũ hoặc đổi đồng thời port trong lệnh chạy, Vite proxy và `Client:Origin`.
- **Phaser trống:** kiểm tra console trình duyệt và kích thước vùng `.game-frame`; scene hiện không tải asset ngoài.
- **Build frontend báo package thiếu:** chạy `npm ci` trong `client`.
- **Cảnh báo chunk Phaser lớn:** Phaser được tải riêng khi vào màn game; đây là cảnh báo kích thước bundle, không phải lỗi build.
