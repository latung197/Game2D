# Giao thức realtime v6

Client dùng SignalR + MessagePack. SignalR ưu tiên WebSocket và có fallback. Payload nhị phân game được bọc trong frame SignalR, mọi số nhiều byte là **little-endian**. `GameProtocol.Version = 6`; codec hai phía từ chối version/kind/độ dài sai. Đổi cấu trúc binary phải tăng version đồng thời ở C# và TypeScript.

## Client gửi

| Hub method | Byte | Layout |
|---|---:|---|
| `InputBatch(byte[])` | 14 | `version:u8`, `kind=1:u8`, `sequence:u32`, `clientTick:u32`, `moveX:i8`, `moveY:i8`, `aim:u8`, `flags=0:u8` |
| `Fire(byte[])` | 5 | `version:u8`, `kind=5:u8`, `weapon:u8`, `range:u16` |

Trục lái lượng tử trong [-127,127]; giá trị -128 và flags khác 0 bị từ chối. Góc lượng tử 256 mức. Sequence và clientTick tăng theo input 30 Hz; server từ chối số cũ/trùng. Fire range bị kẹp theo vũ khí. Server lấy player/room từ JWT và connection binding; client không gửi HP, damage hay vị trí tùy ý.

Hub methods MessagePack khác: `JoinMatch(roomId)`, `Reload(weapon)`, `Pickup(itemId)`, `UseItem(kind)`, `SetHeadlights(enabled)`, `UseRadar()`. `UseRadar` trả payload binary radar 6 byte; các phương thức còn lại trả record MessagePack. Trận `development` chỉ có trong môi trường Development.

## Snapshot server gửi

Độ dài `15 + 14 × P + 8 × J + 7 × H` byte, với P xe, J projectile, H vùng bùn. Thứ tự: header, xe, projectile, bùn.

| Offset | Byte | Trường |
|---:|---:|---|
| 0 | 1 | `version=6` |
| 1 | 1 | `kind=2` |
| 2 | 4 | `serverTick:u32` |
| 6 | 1 | Số xe P |
| 7 | 2 | Số projectile J |
| 9 | 2 | Số vùng bùn H |
| 11 | 4 | `lastProcessedSequence:u32` riêng cho người nhận |
| 15... | 14/xe | `networkId:u16, x:u16, y:u16, rotation:u8, aim:u8, health:u8, status:u8, velocityX:i16, velocityY:i16` |
| Sau xe | 8/projectile | `id:u16, x:u16, y:u16, weapon:u8, progress:u8` |
| Sau projectile | 7/vùng | `id:u16, x:u16, y:u16, remainingTicks:u8` |

X/Y = world unit × 16, làm tròn; map 4000 × 3000 vừa trong `u16`, giới hạn trục khoảng 4095,94. Vận tốc làm tròn world unit/giây. `status=1` là đang bị bùn làm chậm. Roster `JoinMatch` và event `PlayerJoined`/`PlayerLeft` ánh xạ network ID sang GUID/tên; snapshot không gửi lại tên. Snapshot khoảng 10 Hz, riêng từng viewer, lọc đối thủ ở xa hơn 850 unit và người trong bụi xa hơn 145 unit. Đèn pha mở ngoại lệ cho mục tiêu trong bụi ở nón hướng ngắm ±0,34 rad, tối đa 570 unit, nếu không bị nhà chắn. Radar hiện mọi đối thủ trong 180 tick. Projectile/bùn thường lọc ở 900 unit. Server giới hạn 128 projectile và 32 vùng bùn đồng thời.

Movement 30 Hz, gia tốc 1000 unit/s², phanh 1400, tốc độ tối đa 280 hoặc 126 khi dính bùn, xoay tối đa 10 rad/s. Sau sáu tick không có input, server trả trục lái về 0. Xe ở trong `[35,3965] × [35,2965]`; nhà nới 28 unit để va chạm. Client dự đoán và replay input chưa ACK; server là nguồn vị trí cuối. `clientTick` chỉ dùng chống gói cũ, chưa tua lại mô phỏng server.

## Combat binary

| Event | Kind | Byte | Payload sau `version,kind` |
|---|---:|---:|---|
| `Shot` | 3 | 16 | `startX,startY,endX,endY:u16×4`, `shooterNetworkId,hitNetworkId:u16×2`, `targetHealth:u8`, `weapon:u8` |
| `RadarResult` | 4 | 6 | `activeTicks:u16`, `cooldownTicks:u16` |
| `Impact` | 6 | 12 | `projectileId:u16`, `x,y:u16×2`, `weapon:u8`, `hitNetworkId:u16`, `targetHealth:u8` |

`Shot` dành cho laser, bắn tỉa và xung điện tức thời; `Impact` dành cho đạn bay, tên lửa, pháo, lựu đạn và bùn. Nổ lan có thể trúng nhiều người, trừ chính người bắn; `Impact` chỉ hiển thị một mục tiêu, snapshot kế tiếp có HP thật của tất cả. Dữ liệu băng đạn, nạp, kill feed dùng MessagePack `AmmoChanged`/`Kill`. ID súng 1–9 theo bảng trong [GAMEPLAY.md](GAMEPLAY.md#vũ-khí-và-xe); luật chính xác ở `data/weapons.json`.

## Item, bo và kết quả MessagePack

`WorldItems { MatchId, Revision, Items[] }` phát khi vào trận, nhặt, respawn loot. Item gồm `Id,Kind,X,Y`; client bỏ qua revision cũ. `Pickup(itemId)` trả `{ Accepted,Code,ItemId,Health }`, có thể từ chối `not_in_match`, `dead`, `unknown_item`, `unavailable`, `too_far`, `inventory_full`. Khi thành công, server cất item vào túi rồi phát `ItemPicked` cho phòng và `InventoryChanged { HealthKits,RadarCells,AmmoCrates }` riêng cho người nhặt. Trường `Health`/`NewHealth` của event pickup chỉ là HP hiện tại. ID item: 1 cứu thương, 2 pin radar, 3 hộp đạn.

`UseItem(kind)` trả `{ Accepted,Code,Kind,Inventory,Health,Radar,Ammo[] }`. Từ chối `dead`, `empty`, `full_health`, `ammo_full`, `unknown_item` hoặc `not_in_match`. Hiệu ứng áp server, rồi client nhận số lượng còn lại. Đèn pha bật/tắt bằng `SetHeadlights(bool)`; trạng thái này được giữ khi reconnect. `UseRadar()` là năng lực radar có cooldown 900 tick; pin radar là consumable có thể kích hoạt radar ngay.

`ZoneState` gồm `PhaseIndex, Stage, CenterX/Y, Radius, TargetX/Y, TargetRadius, RemainingTicks, DamagePerSecond, Completed`; phát khi join và khoảng 10 Hz. `MatchEnded` chứa `MatchId, WinnerId?, WinnerName?, EndedAt, Players[]` với placement/kill/death. `GET /api/matches/{id}` trả kết quả đã lưu cho participant. Xem [GAMEPLAY.md](GAMEPLAY.md) và [MATCHES.md](MATCHES.md).

## Kiểm tra

`client/tests/realtime.integration.mjs` kiểm tra snapshot/binary, stealth/radar và reconnect; `client/tests/loot.integration.mjs` kiểm tra đồng bộ item/túi đồ; `tests/Game.RoomProbe` kiểm tra luật server. 50 người trong cùng một snapshot dùng tối đa khoảng `15 + 14×50 = 715` byte trước overhead SignalR/MessagePack nếu không có projectile/hazard; AOI thường giảm số xe được gửi. Đây là kích thước lý thuyết, chưa phải phép đo băng thông tổng khi đủ 50 kết nối.
