# Scrap Street

Game đấu xe 2D nhìn từ trên xuống, viết bằng .NET 10, React, Phaser và PostgreSQL. Có khám phá/tập bắn offline, phòng online 5/10/20/25/50 người, năm loại vũ khí, map 4000 × 3000, bụi ẩn nấp, đèn pha phát hiện đối thủ, radar, túi đồ ba loại và bo năm giai đoạn. Server quyết định di chuyển, va chạm, sát thương, loot, bo và kết quả; client dự đoán di chuyển để lái mượt.

## Chạy nhanh

Cần .NET 10 SDK, Node 22, PostgreSQL. Xem [hướng dẫn cài đặt](docs/SETUP.md) để cấu hình DB và JWT. Mở hai terminal tại thư mục gốc:

```powershell
dotnet run --project src/Game.Api --urls http://127.0.0.1:5080
```

```powershell
cd client
npm ci
npm run dev
```

Vào `http://127.0.0.1:5173/`. Khám phá và tập bắn chạy offline. Để chơi online, đăng ký/đăng nhập, tạo phòng với sức chứa mong muốn hoặc ghép nhanh; host bắt đầu trận.

**Điều khiển:** WASD/mũi tên lái, chuột ngắm và click bắn, `1–9` đổi súng, `R` nạp, `E` nhặt, `Q` dùng cứu thương, `T` dùng pin radar, `G` dùng hộp đạn, `N` đổi ngày/đêm, `L` bật/tắt đèn pha. Điện thoại có cần lái/ngắm, nút bắn, thanh súng vuốt được và các ô túi đồ chạm được. Nút `i` cạnh thanh súng mở bảng sát thương và thuộc tính; xem [bảng 9 vũ khí](docs/GAMEPLAY.md#vũ-khí-và-xe).

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [Gameplay](docs/GAMEPLAY.md) | Map, bo, thời gian 5–50 người, item, tầm nhìn, giới hạn |
| [Setup](docs/SETUP.md) | Cài môi trường, PostgreSQL, API, client, kiểm tra |
| [Rooms](docs/ROOMS.md) | Tạo phòng, host, reconnect và API |
| [Matches](docs/MATCHES.md) | Vòng đời trận, xếp hạng và lưu kết quả |
| [Protocol](docs/PROTOCOL.md) | Binary v6 và SignalR MessagePack |
| [Architecture](docs/ARCHITECTURE.md) | Ranh giới module và hướng mở rộng |
| [Implemented](docs/IMPLEMENTED.md) | Chức năng, kiểm chứng và giới hạn thực tế |
| [Assets](docs/ASSETS.md) | Skin Kenney và giấy phép |
| [Phases](docs/PHASES.md) | Lịch sử triển khai và việc còn mở |
| [Handoff](docs/HANDOFF.md) | Bàn giao vận hành |

## Kiểm tra

```powershell
dotnet build Game.sln --no-restore
dotnet run --no-restore --project tests/Game.RoomProbe/Game.RoomProbe.csproj
cd client
npm run build
npm run format:check
```

Khi API đang chạy, chạy các integration test trong `client/package.json` **lần lượt**: `test:loot`, `test:rooms`, `test:match`, `test:weapons`, `test:realtime`. Các bài tạo tài khoản có thể gặp rate limit 429 nếu chạy song song. `test:layout` cần Vite và Edge/Chrome CDP cổng 9224. Phòng 50 người có luật, spawn và protocol phù hợp nhưng chưa được đo tải dài hạn trên 50 máy thật; xem [giới hạn cụ thể](docs/GAMEPLAY.md#kiểm-tra-và-giới-hạn).
