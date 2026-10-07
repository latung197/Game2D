# Scrap Street

Game 2D top-down về những chiếc xe tự chế trong khu phố hoạt hình. Mục tiêu là multiplayer realtime ổn định, server authoritative và kiến trúc có thể phát triển từ vertical slice 10 người lên nhiều room và 50 người/room sau khi kiểm thử tải.

## Trạng thái dự án

**Phase 1 đã hoàn thành (2026-10-08):** solution .NET 10, API đăng ký/đăng nhập JWT lưu PostgreSQL, client React/Vite/Phaser, một map placeholder lớn hơn màn hình và một xe di chuyển offline với camera follow/collision đơn giản. Phase 2–10 **chưa triển khai**. Project `Game.Server`, `Game.Realtime`, `Game.Domain`, `Game.Shared` hiện là khung để giữ ranh giới; chưa có gameplay online.

## Tài liệu bắt đầu từ đây

| Tài liệu | Đọc khi nào |
|---|---|
| [Cài đặt và chạy trên máy mới](docs/SETUP.md) | Muốn clone/sao chép repo rồi chạy API, DB và client |
| [Bàn giao phiên tiếp theo](docs/HANDOFF.md) | Muốn tiếp tục làm từ trạng thái hiện tại, biết chính xác phần đã/chưa làm |
| [Kiểm kê Phase 1](docs/IMPLEMENTED.md) | Muốn tra từng file và luồng thực tế đã chạy được |
| [Yêu cầu sản phẩm](docs/PRODUCT_SPEC.md) | Muốn giữ đầy đủ ý định gameplay, UI, item, logo và mục tiêu mở rộng |
| [Kiến trúc](docs/ARCHITECTURE.md) | Muốn hiểu ranh giới project, runtime, protocol và luật authoritative |
| [Phase 1–10](docs/PHASES.md) | Muốn tự phát triển từng phase, biết file, thứ tự, test và điều kiện hoàn tất |

## Chạy nhanh ở môi trường đã cài PostgreSQL

Làm theo [SETUP.md](docs/SETUP.md) để tạo role/database riêng và cấu hình connection. Sau đó mở hai terminal tại thư mục gốc:

```powershell
dotnet run --project src/Game.Api --urls http://127.0.0.1:5080
```

```powershell
cd client
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173/`. Có thể bấm **Lái thử offline** ngay; đăng ký/đăng nhập cần API và PostgreSQL. Dùng WASD/phím mũi tên để di chuyển, chuột để ngắm. Endpoint kiểm tra API: `http://127.0.0.1:5080/health`.

## Kiểm tra baseline

```powershell
dotnet build Game.sln
cd client
npm run build
npm run format:check
```

Giữ `client/package-lock.json` khi chuyển máy và dùng `npm ci`. Không đưa `node_modules`, `bin`, `obj`, `.keys`, file `.env` hoặc dữ liệu PostgreSQL local vào source. Trạng thái DB/account trên máy gốc không tự đi theo repo.
