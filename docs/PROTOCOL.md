# Gói tin realtime binary v4

Trận online dùng SignalR qua WebSocket với MessagePack Hub Protocol. Dữ liệu gameplay là `byte[]`/`Uint8Array` bên trong frame SignalR; REST đăng ký/đăng nhập vẫn dùng JSON. Các số nhiều byte dùng **little-endian**. Mỗi payload game có `version=4` và `kind`; codec từ chối sai version, kind hoặc độ dài. V4 không tương thích với client v3, nên cần tải lại client sau khi cập nhật server.

## Các lệnh client gửi

| Hub method | Byte | Layout |
|---|---:|---|
| `InputBatch` | 10 | `version: u8`, `kind=1: u8`, `sequence: u32`, `moveX: i8`, `moveY: i8`, `aim: u8`, `flags=0: u8` |
| `Fire` | 5 | `version: u8`, `kind=5: u8`, `weapon: u8`, `range: u16` |

`moveX/moveY` thuộc [-127, 127]; -128 và flags khác 0 bị từ chối. Góc aim chia vòng tròn thành 256 mức. `weapon` từ 1 đến 5 theo bảng bên dưới. `range` là khoảng cách mong muốn tính bằng world unit, được server kẹp trong [80, tầm tối đa của vũ khí]. Client không gửi tọa độ, player ID, HP hoặc damage. Server lấy danh tính từ JWT và vị trí/góc ngắm đã lưu trong match; sequence cũ hoặc trùng bị bỏ.

## Snapshot server gửi

Độ dài: **`11 + 10 × P + 8 × J + 7 × H` byte** với P là số xe, J là số projectile, H là số vũng bùn. Các record xếp liên tiếp theo thứ tự xe, projectile, vũng bùn.

| Offset | Byte | Nội dung |
|---:|---:|---|
| 0 | 1 | `version=4` |
| 1 | 1 | `kind=2` |
| 2 | 4 | `serverTick: u32` |
| 6 | 1 | Số xe P |
| 7 | 2 | Số projectile J (`u16`) |
| 9 | 2 | Số vũng bùn H (`u16`) |
| 11... | 10/xe | `networkId: u16`, `x: u16`, `y: u16`, `rotation: u8`, `aim: u8`, `health: u8`, `status: u8` |
| Sau xe | 8/projectile | `id: u16`, `x: u16`, `y: u16`, `weapon: u8`, `progress: u8` |
| Sau projectile | 7/vũng | `id: u16`, `x: u16`, `y: u16`, `remainingTicks: u8` |

X/Y là tọa độ world nhân 16 rồi làm tròn, độ phân giải 1/16 unit; map 3200×2200 vừa trong `u16`. Góc chia thành 256 mức. `status=1` nghĩa là đang bị bùn làm chậm, `0` là bình thường. `progress` chỉ dùng cho đạn pháo: 0–255 từ lúc phóng đến lúc rơi; các đạn khác bằng 0. `remainingTicks` của vũng bùn tối đa 120. Network ID và ID vật thể chỉ có ý nghĩa trong match; roster `JoinMatch` và `PlayerJoined`/`PlayerLeft` ánh xạ network ID sang tài khoản. GUID và tên không lặp trong snapshot.

Snapshot khoảng 10 Hz, riêng theo từng người xem: xe ở xa hơn 850 unit bị ẩn; xe trong bụi chỉ lộ ở dưới 145 unit. Projectile/vũng bùn ở xa hơn 900 unit cũng không có trong snapshot. Radar đang hiệu lực bỏ qua các giới hạn này. Server giới hạn tối đa 128 projectile và 32 vũng bùn cùng lúc. Snapshot không có nội suy client ở phiên bản này.

## Sự kiện server gửi

| Event | Kind | Byte | Layout sau `version, kind` |
|---|---:|---:|---|
| `Shot` | 3 | 15 | `startX, startY, endX, endY: u16 × 4`; `shooterNetworkId, hitNetworkId: u16 × 2`; `targetHealth: u8` |
| `RadarResult` | 4 | 6 | `activeTicks: u16`, `cooldownTicks: u16` |
| `Impact` | 6 | 12 | `projectileId: u16`, `x, y: u16 × 2`, `weapon: u8`, `hitNetworkId: u16`, `targetHealth: u8` |

`Shot` dành cho laser hitscan; `Impact` đánh dấu điểm đạn thường/tên lửa/pháo/bùn kết thúc. `hitNetworkId=0` nghĩa là không có mục tiêu trực tiếp. Với tên lửa/pháo nổ lan, `Impact` chỉ chứa **một** người trúng để hiển thị; HP chính xác của mọi người vẫn nằm trong snapshot kế tiếp. Radar có hiệu lực 180 tick (6 giây), hồi 900 tick (30 giây). Xe 0 HP không lái/bắn và hồi sinh sau 90 tick (3 giây).

## Luật vũ khí hiện tại

| ID | Vũ khí | Tầm tối đa | Hồi (tick) | Sát thương | Cách hoạt động |
|---:|---|---:|---:|---:|---|
| 1 | Đạn xa | 1800 | 7 | 25 | Đạn bay 1100 unit/s, va nhà hoặc xe đầu tiên |
| 2 | Laser | 2800 | 12 | 25 | Tia tức thời, bị nhà chắn |
| 3 | Tên lửa | 2200 | 30 | 40 | Bay 520 unit/s, nổ bán kính 110 unit tại va chạm |
| 4 | Pháo | 1350 | 45 | 45 | Bay cung hiển thị trong 45 tick (1,5 giây), nổ bán kính 145 unit ở điểm rơi; có thể vượt nhà |
| 5 | Bùn | 1200 | 20 | 0 | Bay 650 unit/s; tạo vũng bán kính 100 unit tồn tại 120 tick (4 giây), giảm tốc xe từ 280 xuống 126 unit/s |

Nổ lan có thể trúng cả người bắn. Đạn pháo dùng đường bay và thời gian rơi do server quyết định; cung cao trên client là hiệu ứng 2D, chưa có mô phỏng vật lý theo trục cao. Chưa có ammo/reload, loại bẫy khác, giáp hoặc kết liễu theo loại vũ khí.

## Kiểm thử và giới hạn

`npm run test:realtime` kiểm tra snapshot v4 hai xe **31 byte**, laser 15 byte, HP/death/respawn, radar/ẩn bụi, reconnect. `npm run test:weapons` kiểm tra từng đường đạn, nổ lan, quỹ đạo/phát nổ của pháo, vũng bùn làm chậm/hết hạn và sự kiện Impact 12 byte. `npm run test:browser` kiểm tra hai tab qua WebSocket và giao diện chạm. Các con số là payload game; frame WebSocket còn có overhead SignalR/MessagePack.
