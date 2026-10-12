# Bàn giao Scrap Street

Cập nhật 2026-10-12. Code hiện có hai chế độ offline, phòng online 5/10/20/25/50, map 4000×3000, chín súng với bảng so sánh chỉ số, HUD đạn thực có, ba item với bảng tác dụng và giới hạn, bụi ẩn nấp, đèn pha phát hiện mục tiêu, radar, bo năm phase, bảng kết quả và PostgreSQL. Xe mới vào phòng được đặt xa nhau hơn; nổ của bản thân không trừ máu. Giao diện súng/item dùng dữ liệu ở `data/weapons.json` và `data/items.json`. Chi tiết chức năng ở [IMPLEMENTED.md](IMPLEMENTED.md) và luật ở [GAMEPLAY.md](GAMEPLAY.md).

## Chạy từ checkout

1. Cài .NET 10 SDK, Node 22 và PostgreSQL. Làm theo [SETUP.md](SETUP.md) để tạo role/database và cấu hình connection string/JWT.
2. Ở gốc repo chạy `dotnet restore Game.sln`, sau đó `dotnet run --project src/Game.Api --urls http://127.0.0.1:5080`.
3. Terminal khác chạy `cd client`, `npm ci`, `npm run dev`. Mở `http://127.0.0.1:5173/`.
4. Đăng ký hai tài khoản, tạo phòng và chọn sức chứa, cho tài khoản còn lại vào, host bắt đầu. Có thể dùng ghép nhanh 10 người. Dùng 1–9 đổi súng, `i` xem chỉ số, R nạp, E nhặt, Q/T/G dùng item, N đổi ngày/đêm, L bật đèn pha.

API tự áp migration khi khởi động. PostgreSQL giữ tài khoản, lịch sử trận và thống kê; Redis trong Compose chưa được nối vào runtime. Nếu API không kết nối được DB thì không khởi động; kiểm tra connection string/quyền. Frontend dev cần API cổng 5080 cho proxy `/api` và `/hubs`.

## Xác minh

```powershell
dotnet build Game.sln --no-restore
dotnet run --no-restore --project tests/Game.RoomProbe/Game.RoomProbe.csproj
cd client
npm run build
npm run format:check
npm run test:movement
```

Khi API và Vite đang chạy, chạy lần lượt `npm run test:loot`, `test:rooms`, `test:match`, `test:weapons`, `test:realtime`, `test:browser`. Đừng chạy cùng lúc các bài dùng trận `development`; auth rate limit cũng có thể trả 429 khi đăng ký nhiều tài khoản trong cùng một phút. `test:layout` cần Edge/Chrome headless với CDP ở cổng 9224. Sau cập nhật chín vũ khí, đã chạy thành công build, room probe, loot, rooms, match, weapons, realtime, movement server, browser và layout; browser kiểm tra hai xe đứng yên đầu trận giữ 100 HP và UI điện thoại hiển thị bảng chỉ số.

Đợt sửa giật màn phòng: `MapRenderer` bake map thành texture lúc tạo scene, chọn tỉ lệ texture theo giới hạn GPU; `Interpolation` không tua lùi thời gian trình bày khi gói đến trễ; `Prediction` làm tan sai lệch nhỏ trong 120 ms; nhãn xe chỉ đổi texture khi chữ thay đổi. Bài `test:browser` in p50/p95 frame 390×844. Trên Edge headless tại máy này, trước bake map là 50/66,7 ms, sau bake là 16,7/16,8 ms. Nếu máy thật vẫn lag, ghi loại máy, trình duyệt, FPS và lỗi console; kiểm tra `MAX_TEXTURE_SIZE`, WebGL/Canvas, snapshot rate và long tasks trước khi đổi hạ tầng.

Kiểm tra lại đã ép WebGL báo `MAX_TEXTURE_SIZE=2048` trong browser test: map raster ở nửa độ phân giải vẫn hiển thị đủ trên điện thoại. Test nay bắt mọi `Runtime.exceptionThrown`; nó phát hiện Phaser thử thao tác trên `AudioContext` đã đóng khi reload scene. Vì game hiện không dùng âm thanh, cấu hình `audio.noAudio` loại bỏ lỗi này; chạy lại browser test không còn exception. Bài realtime có một lần HTTP 429 do tạo tài khoản thử liên tục, chạy lại sau cửa sổ rate limit đã qua và đạt 10,1 snapshot/giây.

## Ranh giới vận hành

Một process giữ room, match, reconnect state và queue ghi kết quả. Khi process restart, trận đang chơi mất. 50 slot/phòng và tọa độ hợp lệ đã có nhưng chưa đo FPS, packet drop, p95 tick hoặc mạng di động với 50 máy. Không coi sức chứa 50 là cam kết tải production. Scale nhiều instance cần owner cho từng room, routing và backplane/session affinity; không đẩy movement từng tick vào Redis. Kết quả chưa ghi DB cần durable outbox nếu không được phép mất khi crash.

Các file chính: `data/map.json`, `data/game_rules.json`, `data/items.json`, `data/loot_tables.json`, `data/weapons.json`; server ở `src/Game.Server`, API ở `src/Game.Api`, Hub ở `src/Game.Realtime`, client ở `client/src/game` và `client/src/ui`. Hợp đồng mạng ở [PROTOCOL.md](PROTOCOL.md), API phòng ở [ROOMS.md](ROOMS.md), hướng kiến trúc ở [ARCHITECTURE.md](ARCHITECTURE.md).
