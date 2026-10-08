# Scrap Street

Game 2D top-down về những chiếc xe tự chế trong khu phố hoạt hình. Mục tiêu là multiplayer realtime ổn định, server authoritative và kiến trúc có thể phát triển từ vertical slice 10 người lên nhiều room và 50 người/room sau khi kiểm thử tải.

## Trạng thái dự án

**Phase 2 và bản thử combat đã triển khai (2026-10-08):** Phase 1 có API đăng ký/đăng nhập JWT và lái thử offline. Khi đăng nhập, client kết nối SignalR/WebSocket dùng MessagePack; protocol v3 có input 10 byte, snapshot `11 + 9 × số xe` byte và tia bắn 15 byte. Server xử lý input ở 30 Hz, gửi snapshot khoảng 10 Hz, tính HP/sát thương và lọc vị trí người nấp bụi. Bản đồ thử 3200×2200 có minimap, radar do server kiểm soát và điều khiển chạm. Chưa có prediction, ammo, room browser hoặc gameplay hoàn chỉnh. Xem [IMPLEMENTED.md](docs/IMPLEMENTED.md) và [PROTOCOL.md](docs/PROTOCOL.md).

## Tài liệu bắt đầu từ đây

| Tài liệu | Đọc khi nào |
|---|---|
| [Cài đặt và chạy trên máy mới](docs/SETUP.md) | Muốn clone/sao chép repo rồi chạy API, DB và client |
| [Bàn giao phiên tiếp theo](docs/HANDOFF.md) | Muốn tiếp tục làm từ trạng thái hiện tại, biết chính xác phần đã/chưa làm |
| [Kiểm kê đến Phase 2](docs/IMPLEMENTED.md) | Muốn tra từng file và luồng thực tế đã chạy được |
| [Yêu cầu sản phẩm](docs/PRODUCT_SPEC.md) | Muốn giữ đầy đủ ý định gameplay, UI, item, logo và mục tiêu mở rộng |
| [Kiến trúc](docs/ARCHITECTURE.md) | Muốn hiểu ranh giới project, runtime, protocol và luật authoritative |
| [Gói tin binary](docs/PROTOCOL.md) | Muốn biết byte layout và cách mở rộng dữ liệu realtime |
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

Mở `http://127.0.0.1:5173/`. Có thể bấm **Lái thử offline** ngay; đăng ký/đăng nhập cần API và PostgreSQL. Sau đăng nhập, mở thêm tài khoản khác trong trình duyệt/tab khác để vào cùng development match. Máy tính dùng WASD/phím mũi tên để di chuyển, chuột để ngắm, nhấn chuột để bắn; điện thoại dùng hai cần ảo và nút Bắn. Nút radar phóng to minimap trong 6 giây, hồi 30 giây. Để thử trên điện thoại cùng Wi-Fi, chạy `npm run dev -- --host 0.0.0.0` rồi dùng IP Wi-Fi của máy tính ở cổng 5173. Endpoint kiểm tra API: `http://127.0.0.1:5080/health`.

## Kiểm tra baseline

```powershell
dotnet build Game.sln
cd client
npm run build
npm run format:check
```

Giữ `client/package-lock.json` khi chuyển máy và dùng `npm ci`. Không đưa `node_modules`, `bin`, `obj`, `.keys`, file `.env` hoặc dữ liệu PostgreSQL local vào source. Trạng thái DB/account trên máy gốc không tự đi theo repo.
