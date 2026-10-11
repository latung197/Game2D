# Phòng online

Phòng nằm trong memory của `MatchManager`; mỗi phòng có `RoomRuntime` và `MatchRuntime` riêng. PostgreSQL lưu tài khoản và kết quả, không lưu trạng thái phòng đang chơi. Server hiện giới hạn 64 phòng/process; mức tải 50 người/phòng mới được kiểm tra về sức chứa và vị trí spawn, chưa có phép đo tải nhiều phòng dài hạn.

## Luồng chơi

1. Đăng nhập; sảnh hiển thị phòng hiện tại và danh sách phòng.
2. Tạo phòng với tên 3–40 ký tự và sức chứa **5, 10, 20, 25 hoặc 50**, hoặc nhập mã phòng, hoặc ghép nhanh. Mặc định và ghép nhanh dùng 10.
3. Phòng thường bắt đầu ở `Waiting`; host bấm bắt đầu, chuyển `Starting` rồi `Playing`. Chỉ thành viên đã vào trước đó được kết nối gameplay. Phòng ghép nhanh vào `Playing` ngay và còn cho tham gia khi chưa đủ chỗ.
4. Client gọi SignalR `JoinMatch(roomId)`; Hub đối chiếu JWT, membership và room state, rồi nối vào group theo room. Snapshot, shot, item, zone và kết quả được phát trong đúng group. Input/fire/reload/radar/item/headlight dùng room gắn với connection ở server.
5. Khi trận xong, phòng chuyển `Ending` → `Finished`, client hiện bảng xếp hạng và có thể về sảnh. Host có quyền kết thúc thủ công.

Mỗi tài khoản chỉ ở một phòng tại một thời điểm. Mã phòng là 8 ký tự hex để chia sẻ, không phải bí mật bảo mật. Rời phòng chủ động loại người chơi khỏi trận; host rời thì quyền chuyển cho người còn lại. Phòng trống bị dọn.

## REST API

Mọi endpoint yêu cầu bearer JWT. `RoomSummary` gồm `id`, `name`, `state`, `hostId`, `hostName`, `playerCount`, `capacity`, `isQuick`.

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/rooms/` | Danh sách phòng |
| GET | `/api/rooms/current` | Phòng của tài khoản, hoặc 204 |
| POST | `/api/rooms/` | `{ "name": "...", "capacity": 25 }`; capacity có thể bỏ qua để mặc định 10 |
| POST | `/api/rooms/quick` | Vào phòng ghép nhanh còn chỗ hoặc tạo mới |
| POST | `/api/rooms/{id}/join` | Vào phòng còn chỗ theo policy |
| POST | `/api/rooms/{id}/start` | Host bắt đầu phòng thường |
| POST | `/api/rooms/{id}/finish` | Host kết thúc trận đang chơi |
| DELETE | `/api/rooms/{id}` | Rời phòng |
| GET | `/api/matches/{id}` | Kết quả đã lưu, chỉ participant |

Tên/sức chứa sai trả 400; không thấy phòng trả 404; phòng đầy, đã bắt đầu, không phải host hoặc đã ở phòng khác trả 409. Sức chứa được áp cả ở membership và `MatchRuntime.Join`, không chỉ ở giao diện.

## Reconnect

Ngắt SignalR giữ slot khoảng 30 giây. Kết nối lại cùng tài khoản và room khôi phục vị trí, hướng, HP, ammo, cooldown, radar, túi đồ và trạng thái đèn pha. Server gửi lại roster, item thế giới, túi đồ, ammo và zone. Hết hạn thì rời phòng; nếu host mất kết nối rồi hết hạn, chuyển host. Vào muộn phòng thường và spectator ngoài phòng chưa hỗ trợ. Phòng `Finished` được dọn sau khoảng 30 giây nếu thành viên không rời thủ công.

## Kiểm tra

`tests/Game.RoomProbe` kiểm tra cap, chuyển host, vào muộn, reconnect và 50 spawn. `client/tests/rooms.integration.mjs` kiểm tra hai phòng tách biệt, input/shot routing, host, finish và ghép nhanh. Chạy integration test tạo tài khoản lần lượt vì auth rate limit theo IP.
