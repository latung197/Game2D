# Gói tin realtime binary v3

Trận online dùng SignalR qua WebSocket với MessagePack Hub Protocol. Input và snapshot là `byte[]`/`Uint8Array` nằm trong frame SignalR; REST auth/lobby vẫn dùng JSON. Tất cả số nhiều byte trong payload game dùng **little-endian**. Mỗi payload có `version` và `kind`; server/client từ chối gói sai version, kind hoặc độ dài.

## Input: 10 byte, client → server

| Offset | Byte | Nội dung |
|---:|---:|---|
| 0 | 1 | Version = 3 |
| 1 | 1 | Kind = 1 (input) |
| 2 | 4 | Sequence `uint32` |
| 6 | 1 | Move X `int8`, -127…127 |
| 7 | 1 | Move Y `int8`, -127…127 |
| 8 | 1 | Aim: 0…255 tương ứng 0…360° |
| 9 | 1 | Flags; hiện phải bằng 0, dành cho fire/use-item sau |

Server lấy player ID từ JWT của kết nối, không có player ID, tọa độ hoặc damage trong input. Sequence cũ/trùng bị bỏ; so sánh theo `uint32` có xử lý vòng lại. Runtime vẫn giới hạn tốc độ và collision.

## Snapshot: `11 + 9 × số xe` byte, server → client

| Offset | Byte | Nội dung |
|---:|---:|---|
| 0 | 1 | Version = 3 |
| 1 | 1 | Kind = 2 (snapshot) |
| 2 | 4 | Server tick `uint32` |
| 6 | 1 | Số xe |
| 7 | 2 | Số projectile, hiện = 0 |
| 9 | 2 | Số hazard (bom/bẫy), hiện = 0 |
| 11… | 9/xe | Mỗi xe: network ID `uint16`, X `uint16`, Y `uint16`, góc xe `uint8`, góc ngắm `uint8`, HP `uint8` (0…100) |

X/Y = world coordinate × 16 rồi làm tròn, tức độ phân giải 1/16 world unit. Map hiện 3200×2200 nằm trong `uint16` ở độ phân giải này. Góc được chia thành 256 mức, khoảng 1,406°/mức. ID mạng ngắn chỉ có ý nghĩa trong trận. `JoinMatch` trả roster `networkId → playerId/username`; `PlayerJoined` và `PlayerLeft` cập nhật roster khi có người vào/rời trận. Tên và GUID không lặp lại trong snapshot. Server tạo snapshot riêng cho từng người: chỉ gửi xe trong bán kính 850 world units; người ở bụi chỉ hiện khi cách tối đa 145 units. Radar bỏ giới hạn này trong thời gian hiệu lực.

## Phát bắn: 15 byte, server → client

Client gọi lệnh `Fire` qua kết nối đã xác thực. Server giới hạn nhịp bắn tối thiểu 7 tick, lấy tọa độ và góc ngắm từ trạng thái server, rồi cắt tia tại tòa nhà, xe trúng đầu tiên hoặc rìa bản đồ. Event `Shot` mang 15 byte: `version=3`, `kind=3`, `startX`, `startY`, `endX`, `endY` là bốn `uint16` little-endian với tọa độ ×16, rồi `shooterNetworkId`/`hitNetworkId` là hai `uint16`, cuối cùng `targetHealth` là `uint8`. `hitNetworkId=0` nghĩa là trượt. Mỗi phát trúng trừ 25 HP; xe 0 HP không di chuyển/bắn và tự hồi sinh sau 90 tick (3 giây). Đây là tia hitscan; chưa có projectile vật lý, ammo hay giáp.

`UseRadar` là lệnh qua Hub, server giữ thời gian hiệu lực 180 tick (6 giây) và cooldown 900 tick (30 giây). Kết quả binary 6 byte: `version=3`, `kind=4`, `activeTicks` `uint16`, `cooldownTicks` `uint16`. Client chỉ mở bản đồ radar theo kết quả server. Server không gửi vị trí xe xa hoặc nấp bụi ngoài thời gian radar; gọi Hub trực tiếp hay kết nối lại trong 30 giây không vượt được cooldown. Hiện radar là kỹ năng sẵn có, chưa cần nhặt item trên map.

Projectile/hazard **chưa được triển khai**. Hai count trong header luôn bằng 0; decoder hiện từ chối gói có count khác 0. Khi định nghĩa record cho đạn, bom, bẫy phải tăng version, thêm codec và test tương thích, không tự ghi dữ liệu vào phần reserved của v3.

## Số đo hiện tại

Kiểm thử hai người ngày 2026-10-08: snapshot game = `11 + 2 × 9 = 29` byte khi cả hai xe nhìn thấy nhau; payload WebSocket chứa MessagePack/SignalR = **47 byte** trong lần đo Edge headless; khoảng 10 snapshot/giây. Snapshot chỉ còn một xe khi người kia ở bụi và radar tắt. Bài test `npm run test:realtime` kiểm tra HP, death/respawn, stealth/radar, input sai và reconnect; `npm run test:browser` kiểm tra hai tab và giao diện mobile.
