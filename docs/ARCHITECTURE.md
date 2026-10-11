# Kiến trúc Scrap Street

**Cấu hình gameplay hiện hành:** map 4000×3000, sức chứa phòng 5/10/20/25/50, bo theo quy mô, túi đồ ba loại và đèn pha được server dùng để phát hiện xe trong bụi. Xem [GAMEPLAY.md](GAMEPLAY.md) và [PROTOCOL.md](PROTOCOL.md). Các số liệu MVP ở phần lịch sử thiết kế bên dưới có thể cũ.

**Trạng thái:** Phase 1–7 có nhiều room và `MatchRuntime` độc lập trong một process qua SignalR, movement authoritative, client prediction/reconciliation và interpolation, server tick 30 Hz và snapshot khoảng 10 Hz. Combat năm vũ khí, Health Kit, bo năm giai đoạn và kết quả trận đã có; lịch sử/thống kê cơ bản nằm trong PostgreSQL. Xem [IMPLEMENTED.md](IMPLEMENTED.md), [ROOMS.md](ROOMS.md) và [MATCHES.md](MATCHES.md) để phân biệt code hiện có với kế hoạch.

## 1. Mục tiêu và giới hạn bản đầu

Scrap Street là game 2D top-down nhiều người chơi, chiến đấu bằng phương tiện tự chế trong khu phố hoạt hình. Server quyết định movement hợp lệ, damage, HP, ammo, hit, item, zone và kết quả. Client gửi input rồi dự đoán/render. Hiện có **1 map, nhiều room 5/10/20/25/50 người, 100 HP, năm vũ khí, ba item trong túi và vòng bo năm giai đoạn**. Chưa đo tải 50 người thật hoặc nhiều phòng lâu dài.

Hình ảnh tham khảo chỉ định hướng màu pastel, viền đậm, ánh đèn ấm và không khí phố xá. Asset, bố cục map, tên nhân vật và gameplay phải là sản phẩm riêng.

## 2. Ranh giới backend

```text
Game.Api  ──> Game.Application ──> Game.Domain
   │                 │                  ▲
   ├──> Game.Infrastructure ───────────┘
   ├──> Game.Realtime ──> Game.Application
   └──> Game.Server ────> Game.Application
Game.Shared: DTO/enum/network contract dùng tại các ranh giới phù hợp
```

| Project | Vai trò hiện tại | Vai trò ở các phase tiếp theo |
|---|---|---|
| `Game.Api` | Host ASP.NET Core, REST auth/phòng/kết quả, SignalR Hub, DI, JWT, CORS, rate limit auth, migration lúc khởi động | Profile/leaderboard endpoint |
| `Game.Application` | `AuthService`, account/token/room/match store interfaces, command gateway và publisher interfaces | Use case profile/leaderboard |
| `Game.Domain` | Project thuần C# chưa có model gameplay | Definition và rule không phụ thuộc EF/SignalR |
| `Game.Infrastructure` | EF Core/Npgsql, user + match entities, repository và migrations | Redis room directory/presence, outbox |
| `Game.Realtime` | Hub xác thực/routing, connection registry, room group, snapshot + zone/result publisher | Event mới theo gameplay |
| `Game.Server` | MatchManager quản lý nhiều room/match trong memory, tick 30 Hz, movement, combat, loot, zone và lifecycle | Status effects, spatial grid, nhiều process |
| `Game.Shared` | DTO/enum/network contract và binary protocol v6 | Versioning contract khi thay layout |

`Game.Api` là composition root. Không đặt simulation trong Controller/Hub, không dùng EF entity làm player runtime. Interface `IMatchCommandGateway` và `IGameEventPublisher` nằm trong `Game.Application`; `Game.Server` và `Game.Realtime` triển khai hai phía.

## 3. Những gì Phase 1 thật sự làm

- `Game.Api/Program.cs`: nạp connection/JWT config, đăng ký EF/repository/service, xác thực bearer, CORS, rate limit 10 auth request/phút/IP, chạy migration, map `/health`, `/api/auth/register`, `/api/auth/login`, `/api/me`.
- `AuthService`: chuẩn hóa username sang lowercase, kiểm tra độ dài/ký tự, hash/verify password bằng `PasswordHasher<Account>`, phát token qua `IAccessTokenIssuer`.
- `EfAccountRepository` và `GameDbContext`: map bảng `users`; unique index cho username. Migration `InitialAuth` và model snapshot đã có.
- `JwtTokenIssuer`: access JWT 30 phút, `sub` là account GUID. `/api/me` lấy ID từ claim sau khi xác thực.
- `client/src/ui/App.tsx`: form đăng ký/đăng nhập, lưu access token trong `sessionStorage`, có nút vào lái thử offline. `auth.ts` gọi REST qua Vite proxy.
- `client/src/game/scenes/GameScene.ts`: vẽ map placeholder bằng Phaser Graphics, nhận WASD/arrow, aim theo chuột, kiểm tra va chạm với các nhà, camera theo xe. **Toàn bộ movement này là client offline**.

Đây là phần mô tả **lịch sử Phase 1**. Trạng thái Phase 7 nằm ở các mục tiếp theo và [IMPLEMENTED.md](IMPLEMENTED.md); room, loot, zone và thống kê cơ bản đã có. Redis integration, refresh token và server logout vẫn chưa có.

## 4. MatchRuntime hiện tại và hướng mở rộng

Phase 4 đã triển khai nhiều `RoomRuntime`, mỗi phòng có `MatchRuntime` riêng với player movement, năm vũ khí và command queue tại tick 30 Hz. Mô hình nhiều process, gameplay system đầy đủ và cô lập lỗi từng match dưới đây vẫn là kế hoạch.

Mỗi room đang chơi có một `MatchRuntime`, sở hữu player, projectile, loot, zone/lifecycle và tick counter. `SpatialGrid` chưa có. `MatchManager` giữ command queue có giới hạn; Hub xác thực và gửi command vào manager. Simulation cập nhật state trong loop 30 Hz; thao tác phòng được bảo vệ bằng lock của manager.

Thứ tự tick đề xuất: lấy input hợp lệ → status/movement/collision → weapon/projectile → damage/death → item/loot → zone → event/snapshot. Tick cố định 30 Hz, đo bằng `Stopwatch` và accumulator; giới hạn số bước bù sau lag. Không chờ DB, Redis hoặc `SendAsync` trong tick. Snapshot được tạo 10–15 Hz rồi chuyển sang outbound worker; khi backlog, thay snapshot cũ bằng snapshot mới. Event quan trọng như kill, pickup, warning, result không được bỏ tùy tiện.

`MatchManager` hiện quản lý dictionary room → runtime và dùng một timer 30 Hz để bước qua các trận đang chơi. State trận không dùng chung. Cô lập lỗi từng trận và nhiều process là phần phát triển tiếp theo; hiện lỗi không được bắt riêng cho từng room.

## 5. Protocol realtime hiện tại và dự kiến

Hiện có REST auth/phòng/kết quả và SignalR MessagePack `/hubs/game`: `JoinMatch`, `InputBatch` 14 byte, `Fire` 5 byte, `Snapshot` binary `15 + 14 × số xe + 8 × số đạn + 7 × số vũng bùn` byte; `JoinMatch` trả roster/`JoinAccepted`. `PlayerJoined`/`PlayerLeft` cập nhật metadata. Snapshot v6 có ACK input riêng cho người nhận và vận tốc từng xe; súng tia tức thời có event `Shot` 16 byte gồm weapon ID, đạn bay có `Impact` 12 byte, radar trả 6 byte. `WorldItems`, `ZoneState`, `MatchEnded` là record MessagePack riêng, không thay đổi layout snapshot. Chi tiết ở [PROTOCOL.md](PROTOCOL.md). Profile/leaderboard, `LeaveMatch` riêng và `CommandRejected` chưa triển khai.

```text
InputBatch dự kiến: sequence, clientTick, moveX/Y, aimAngle, fire, useItem
Snapshot dự kiến: serverTick, lastProcessedSequence, selfState,
  nearbyPlayers, projectiles, items, zone
```

Client không được gửi position, damage, HP hoặc player ID làm nguồn sự thật. Server lấy identity từ authenticated connection. `sequence`/`clientTick` bỏ input cũ/trùng; ACK và self state cho client replay, `serverTick` cho nội suy remote. Protocol binary v6 có record cho projectile và vũng bùn; snapshot lọc theo người xem để không phát tọa độ xe nấp bụi hoặc vật thể quá xa khi radar tắt. SignalR Hub chỉ route; `Game.Server` xử lý luật vũ khí và va chạm.

## 6. Movement và render hiện tại

Local player: lấy input theo tick 30 Hz → lượng tử hóa như byte gửi đi → dự đoán movement và lưu pending `{sequence, clientTick, input}` → gửi server → nhận self state/vận tốc và `lastProcessedSequence` → đặt lại state theo server → phát lại input chưa ACK → làm mượt sai khác nhỏ. Server kiểm tra gia tốc, tốc độ tối đa, collision, status, sequence và clientTick; snapshot là nguồn sự thật. Chết/hồi sinh hoặc sai khác trên 100 unit áp dụng ngay. Client đo trễ ACK và độ sửa vị trí.

Phần **hiển thị** nội suy vị trí/góc xe mình giữa state trước và sau tick theo phần thời gian còn dư của frame. Vì vậy màn 60 Hz không phải vẽ cùng một vị trí hai lần giữa các tick 30 Hz. `Prediction` dịch state hiển thị trước theo lượng correction nhỏ khi snapshot về; correction lớn hoặc đổi trạng thái sống/chết vẫn đặt lại ngay. Sau một frame chậm, accumulator bắt kịp tối đa 250 ms; server vẫn quyết định va chạm và vị trí cuối cùng.

Remote player: giữ tối đa tám snapshot và render trễ ba tick (~100 ms) theo `serverTick`, nội suy vị trí/góc. Khi chưa có snapshot tiếp theo thì giữ vị trí cuối; xe bị ẩn/rời trận được xoá khỏi buffer. Death hoặc dịch chuyển hơn 100 unit áp dụng ngay.

`PlayerMovementSystem.cs` và `Movement.ts` chứa cùng thông số/quy tắc movement ở hai phía; `Prediction.ts` và `Interpolation.ts` xử lý hình ảnh client. Hình học nhà/bụi lấy từ `data/map.json` ở cả C# và TypeScript; test conformance kiểm tra quy tắc di chuyển. `RealtimeClient`/`GameNetworkAdapter` giữ giao tiếp ngoài scene.

## 7. Weapon, damage, item, status

- `WeaponDefinition` trong `weapons.json`: ID, damage, fire rate, speed/count/spread của projectile, magazine/reload, range, rarity, knockback. `WeaponSystem` kiểm tra state/ammo/cooldown rồi gọi behavior đăng ký trong registry. Pistol đi trước; các weapon khác dùng lại pipeline.
- `ProjectileSystem` tạo, di chuyển, collision/hit và despawn projectile trên server. Client chỉ render và có thể pool sprite.
- `DamageService` xử lý validate → modifier → shield/armor → HP → status → death/kill attribution → event. Damage type gồm projectile, explosion, trap, zone, status và collision.
- `ItemDefinition` trong `items.json` và `ItemBehaviorRegistry` tránh rải điều kiện `if(itemId == ...)` trong loop. Pickup kiểm tra alive, khoảng cách, tồn tại item, inventory/cooldown và xử lý một lần trên server. Health Kit là item đầu; troll/super item thêm behavior riêng.
- `StatusEffectDefinition`/`StatusEffectInstance`/`StatusEffectManager` quản lý magnitude, duration, source và `Replace`, `RefreshDuration`, `Stack`, `Ignore`. Spawn protection hết theo thời gian hoặc khi chủ động bắn.

Definition JSON chưa tồn tại trong Phase 1; tạo khi system tương ứng được triển khai. Các giá trị balance phải được validate khi nạp config để một config lỗi không phá match đang chạy.

## 8. Room và match lifecycle

Room hiện đi qua `Waiting → Starting → Playing → Ending → Finished`; `Starting` và `Ending` là chuyển trạng thái trong cùng thao tác, không có countdown. Host tạo room; server cấp room ID/code, kiểm tra membership/capacity/start. Disconnect giữ chỗ 30 giây rồi xóa thành viên nếu không quay lại. Người ngoài phòng chưa thể vào chỉ để xem; người chơi đã chết trong phòng online xem xe còn sống trong tầm nhìn đến khi trận kết thúc, không hồi sinh.

Match online hiện dùng `MatchRuntime(competitive: true)` trong mỗi `RoomRuntime`: spawn → movement/loot/combat/zone → loại người chơi → chốt winner hoặc host finish → phát kết quả và lưu ngoài tick → Finished/cleanup. Người chết không hồi sinh trong phòng online; `development` là runtime riêng có hồi sinh và không có zone. Phòng thường không cho vào muộn; phòng ghép nhanh cho vào khi còn chỗ. Chưa có spawn protection hoặc quy tắc kiểm tra khoảng cách enemy khi vào muộn.

## 9. Map, safe zone, interest và scale

Map hiện là 4000×3000; `data/map.json` là nguồn hình học nhà/bụi dùng chung server và client. Renderer Phaser thêm cỏ, cây, đường, đèn và chi tiết nhà; cây trang trí không tham gia va chạm. Sau này có thể chuyển sang tilemap theo lớp collision/decor/spawn/loot mà không để game loop phụ thuộc Phaser.

`ZoneSystem` đọc `data/game_rules.json`, giữ tâm/bán kính hiện tại và mục tiêu, ba trạng thái `Warning/Shrinking/Stable` cùng số tick còn lại. Vòng đích luôn nằm trong vòng trước; server nội suy mỗi tick. `ZoneDamageSystem` tích lũy phần lẻ sát thương trên 30 tick/giây; client chỉ vẽ vòng và cảnh báo. Luật số xem [MATCHES.md](MATCHES.md).

Phòng hiện cho chọn sức chứa tới 50 người và đã kiểm tra 50 vị trí spawn, nhưng chưa đo tải 50 kết nối đồng thời. `SpatialGrid` ô 512×512 world units là bước tối ưu dự kiến khi số đo tick, snapshot bytes và băng thông cho thấy cần thiết; lúc đó snapshot sẽ lấy cell hiện tại và lân cận với biên đệm, còn kill feed và zone là global event.

Một match có một game server owner. Khi cần nhiều máy, Redis lưu `roomId → serverId`, presence/server registry và cache; gameplay packet đi trực tiếp client ↔ owner game server, không chuyển mọi movement qua Redis Pub/Sub. State runtime ở memory nên việc chuyển owner sau crash cần thiết kế phục hồi riêng; hiện chưa hỗ trợ.

## 10. Dữ liệu bền vững

**Đã có:** `users(id UUID PK, username VARCHAR(24) UNIQUE, password_hash TEXT, created_at TIMESTAMPTZ)` và `match_history`, `match_players`, `player_statistics` trong PostgreSQL. EF migrations `InitialAuth` và `202610110001_MatchResults` quản lý schema. Tên cột vật lý do migration định nghĩa theo PascalCase cho thuộc tính. Kết quả lưu một lần trong transaction và cộng thống kê; retry chạy ngoài tick. Không ghi runtime position/projectile/zone mỗi tick.

**Dự kiến:** `refresh_tokens`, `player_profiles`, `cosmetics`, `player_cosmetics`, `achievements`, `player_achievements`, leaderboard API. Cần durable outbox nếu muốn đảm bảo không mất kết quả khi process dừng trước lúc ghi thành công.

## 11. Bảo mật, quan sát, hiệu năng

Hiện có password hash, unique username, JWT xác thực `/api/me` và SignalR Hub, rate limit auth theo IP, giới hạn Hub message size 4096 byte, kiểm tra input sequence/axis và bounded queue. Room membership, fire rate, ammo, cooldown và pickup distance được xác thực ở server trong các command tương ứng. Cần bổ sung refresh rotation/revocation và giới hạn input rate theo từng tài khoản/kết nối. Khi browser SignalR truyền token qua query string WebSocket, không log query token.

Structured log nên có `MatchId`, `RoomId`, `PlayerId`, `ConnectionId`, `ServerTick` khi liên quan. Metrics: active connections/matches, players/match, tick duration, snapshot bytes, messages/s, dropped inputs, latency. Không log từng tick. Tick 30 Hz có ngân sách khoảng 33,33 ms; dùng spatial grid, pool và hạn chế allocation trong loop khi profiling chỉ ra vấn đề.

## 12. Quy tắc giữ kiến trúc khi phát triển

1. Đọc [PHASES.md](PHASES.md) và chỉ thêm phần cần cho phase đang làm.
2. Cập nhật `docs/HANDOFF.md` sau mỗi phase: file mới, lệnh chạy, test, phần chưa hoàn thành.
3. Runtime model tách EF entity; Phaser scene không gọi Hub trực tiếp.
4. Mọi command network có cancellation/rate/validation phù hợp. Không để DB/Redis/SignalR I/O trong fixed tick.
5. Mỗi system có test cho rule rủi ro cao; ưu tiên test xử lý command, collision, damage, phase transition và reconciliation hơn test chép lại implementation.

## Cấu trúc hiện tại để mở rộng sự kiện

`data/map.json` là nguồn duy nhất cho kích thước bản đồ, nhà và bụi ẩn nấp. Client nạp qua `game/config/map.ts`; `Game.Server` nhúng cùng tệp thành resource và kiểm tra tọa độ/kích thước khi nạp. Cây, đèn và các lớp trang trí hiện chỉ dùng để vẽ. Khi thêm vật cản hoặc vùng ẩn nấp, sửa dữ liệu trong JSON và kiểm tra cả render lẫn luật server. Các mô tả map 2400×1600 và hình học khai báo riêng ở các mục lịch sử phía trên đã cũ.

Ở client, `GameScene` giữ vòng đời Phaser, input và nối các hệ thống. `game/render/MapRenderer.ts`, `LightingRenderer.ts`, `CombatEffects.ts` chịu trách nhiệm vẽ tương ứng. `GameNetworkAdapter` là ranh giới với `RealtimeClient`; `GameEventBus` phát `shot`, `impact`, `status` có kiểu, cho phép nhiều listener và trả về hàm hủy đăng ký. Component React và scene đều hủy listener khi dừng. Khi thêm một sự kiện giao diện hoặc hiệu ứng, khai báo payload trong adapter, phát từ adapter, đăng ký ở nơi dùng và hủy khi kết thúc; sự kiện gameplay có ảnh hưởng luật chơi vẫn phải được server xác thực.

Skin nút dùng Kenney UI Pack CC0, nguồn và các file được dùng ghi ở [ASSETS.md](ASSETS.md). CSS skin nằm ở `client/src/skin.css`; giao diện còn lại trong `style.css`. Không nhúng asset trực tiếp vào logic scene.

Giới hạn hiện tại: `MatchManager` giữ nhiều `RoomRuntime` trong một process và một trận `development` riêng. `MatchRuntime` chứa state độc lập theo phòng; các sự kiện gameplay đi qua publisher SignalR và kênh lưu kết quả. Chưa có durable event bus/outbox hay routing nhiều server. Khi thêm mode, đặt luật trong system theo match và giữ REST/Hub là lớp điều phối, tránh đưa I/O vào tick.
