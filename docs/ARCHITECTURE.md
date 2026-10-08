# Kiến trúc Scrap Street

**Trạng thái:** Phase 2 đã có development match realtime qua SignalR, server tick 30 Hz và snapshot khoảng 10 Hz. Những phần combat, room và prediction ở Phase 3–10 vẫn là thiết kế dự kiến. Xem [IMPLEMENTED.md](IMPLEMENTED.md) để phân biệt code hiện có với kế hoạch.

## 1. Mục tiêu và giới hạn bản đầu

Scrap Street là game 2D top-down nhiều người chơi, chiến đấu bằng phương tiện tự chế trong khu phố hoạt hình. Server quyết định movement hợp lệ, damage, HP, ammo, hit, item, zone và kết quả. Client gửi input rồi dự đoán/render. Vertical slice đầu tiên hướng đến **1 map, 1 room, tối đa 10 người, 100 HP, Pistol, Health Kit và 1 safe zone**; hoàn thành sau Phase 7. Quy tắc 50 người/room và late join chỉ mở sau khi đo tải và kiểm thử.

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
| `Game.Api` | Host ASP.NET Core, REST auth, SignalR Hub, DI, JWT, CORS, rate limit auth, migration lúc khởi động | Room/profile/leaderboard endpoint |
| `Game.Application` | `AuthService`, account repository/token interfaces | Use case room/match/profile; command gateway và publisher interfaces |
| `Game.Domain` | Project thuần C# chưa có model gameplay | Definition và rule không phụ thuộc EF/SignalR |
| `Game.Infrastructure` | EF Core/Npgsql, user entity, repository, migration | PostgreSQL records, Redis room directory/presence, repositories |
| `Game.Realtime` | Hub xác thực/routing, connection registry, snapshot publisher | Room group và các event gameplay |
| `Game.Server` | MatchManager, một MatchRuntime development, tick 30 Hz, movement cơ bản | Nhiều room và gameplay system |
| `Game.Shared` | DTO và protocol version 1 | Mở rộng contract theo gameplay |

`Game.Api` là composition root. Không đặt simulation trong Controller/Hub, không dùng EF entity làm player runtime. Interface `IMatchCommandGateway` và `IGameEventPublisher` nằm trong `Game.Application`; `Game.Server` và `Game.Realtime` triển khai hai phía.

## 3. Những gì Phase 1 thật sự làm

- `Game.Api/Program.cs`: nạp connection/JWT config, đăng ký EF/repository/service, xác thực bearer, CORS, rate limit 10 auth request/phút/IP, chạy migration, map `/health`, `/api/auth/register`, `/api/auth/login`, `/api/me`.
- `AuthService`: chuẩn hóa username sang lowercase, kiểm tra độ dài/ký tự, hash/verify password bằng `PasswordHasher<Account>`, phát token qua `IAccessTokenIssuer`.
- `EfAccountRepository` và `GameDbContext`: map bảng `users`; unique index cho username. Migration `InitialAuth` và model snapshot đã có.
- `JwtTokenIssuer`: access JWT 30 phút, `sub` là account GUID. `/api/me` lấy ID từ claim sau khi xác thực.
- `client/src/ui/App.tsx`: form đăng ký/đăng nhập, lưu access token trong `sessionStorage`, có nút vào lái thử offline. `auth.ts` gọi REST qua Vite proxy.
- `client/src/game/scenes/GameScene.ts`: vẽ map placeholder bằng Phaser Graphics, nhận WASD/arrow, aim theo chuột, kiểm tra va chạm với các nhà, camera theo xe. **Toàn bộ movement này là client offline**.

Đây là phần mô tả **lịch sử Phase 1**. Sau đó Phase 2 đã thêm Hub và movement server; bản thử combat có projectile, damage, HP và vũng bùn. Room lifecycle, zone, loot, Redis integration, refresh token, server logout và thống kê vẫn chưa có. Chỉ có bảng `users` được tạo; các bảng còn lại ở mục 10 là kế hoạch.

## 4. MatchRuntime dự kiến

Phase 2 đã triển khai một `MatchRuntime` development với player movement, năm vũ khí, command queue và tick 30 Hz. Mô hình nhiều room, các gameplay system đầy đủ và xử lý lỗi từng match dưới đây vẫn là kế hoạch.

Mỗi room đang chơi có đúng một `MatchRuntime`, sở hữu `World`, `Players`, `Projectiles`, `Items`, `Zone`, `SpatialGrid`, command queue và tick counter. Một nơi duy nhất sửa state của match: fixed simulation loop. Hub nhận command đã xác thực, kiểm tra sơ bộ kích thước/tần suất rồi xếp vào queue có giới hạn. Các system xử lý command ở tick kế tiếp.

Thứ tự tick đề xuất: lấy input hợp lệ → status/movement/collision → weapon/projectile → damage/death → item/loot → zone → event/snapshot. Tick cố định 30 Hz, đo bằng `Stopwatch` và accumulator; giới hạn số bước bù sau lag. Không chờ DB, Redis hoặc `SendAsync` trong tick. Snapshot được tạo 10–15 Hz rồi chuyển sang outbound worker; khi backlog, thay snapshot cũ bằng snapshot mới. Event quan trọng như kill, pickup, warning, result không được bỏ tùy tiện.

`MatchManager` quản lý dictionary room → runtime, tạo/dừng riêng từng runtime. Lỗi của một match được ghi log kèm `MatchId`/`ServerTick`, match đó được kết thúc có kiểm soát; không dùng một global mutable GameLoop cho tất cả room.

## 5. Protocol realtime hiện tại và dự kiến

Hiện có REST auth và SignalR MessagePack `/hubs/game`: `JoinMatch`, `InputBatch` 10 byte, `Fire` 5 byte, `Snapshot` binary `11 + 10 × số xe + 8 × số đạn + 7 × số vũng bùn` byte; `JoinMatch` trả roster/`JoinAccepted`. `PlayerJoined`/`PlayerLeft` cập nhật metadata. Laser có event `Shot` 15 byte, đạn bay có `Impact` 12 byte và radar trả 6 byte. Chi tiết little-endian, lượng tử hóa tọa độ/góc và version ở [PROTOCOL.md](PROTOCOL.md). Các REST room/profile/leaderboard và lệnh `LeaveMatch`, `PickupRequest`, `CommandRejected` là hợp đồng dự kiến, chưa triển khai.

```text
InputBatch dự kiến: sequence, clientTick, moveX/Y, aimAngle, fire, useItem
Snapshot dự kiến: serverTick, lastProcessedSequence, selfState,
  nearbyPlayers, projectiles, items, zone
```

Client không được gửi position, damage, HP hoặc player ID làm nguồn sự thật. Server lấy identity từ authenticated connection. `sequence` giúp bỏ input cũ/trùng và chuẩn bị reconciliation; `serverTick` giúp interpolation về sau. Protocol binary v4 có record cho projectile và vũng bùn; snapshot lọc theo người xem để không phát tọa độ xe nấp bụi hoặc vật thể quá xa khi radar tắt. SignalR Hub chỉ route; `Game.Server` xử lý luật vũ khí và va chạm.

## 6. Movement và render dự kiến

Local player: lấy input → dự đoán movement ngay → lưu pending input `{sequence, dt, input}` → gửi server → nhận self state và `lastProcessedSequence` → đặt lại state theo server → phát lại input chưa được xác nhận → làm mượt sai khác nhỏ. Server luôn kiểm tra acceleration, max speed, collision, status và sequence; snapshot của server là nguồn sự thật. Teleport hợp lệ hoặc sai khác lớn áp dụng ngay.

Remote player: giữ buffer 2+ snapshot và render trễ khoảng 100 ms theo `serverTick`, nội suy vị trí/góc. Thiếu snapshot thì extrapolate ngắn, sau đó giữ vị trí. Spawn, death và teleport là event rời rạc, không nội suy xuyên qua.

Phase 2 đã có `RealtimeClient`, `GameNetworkAdapter` và `ClientWorldState`; Phaser scene render world state trong match online. Phase 3 sẽ thêm prediction/reconciliation và interpolation.

## 7. Weapon, damage, item, status

- `WeaponDefinition` trong `weapons.json`: ID, damage, fire rate, speed/count/spread của projectile, magazine/reload, range, rarity, knockback. `WeaponSystem` kiểm tra state/ammo/cooldown rồi gọi behavior đăng ký trong registry. Pistol đi trước; các weapon khác dùng lại pipeline.
- `ProjectileSystem` tạo, di chuyển, collision/hit và despawn projectile trên server. Client chỉ render và có thể pool sprite.
- `DamageService` xử lý validate → modifier → shield/armor → HP → status → death/kill attribution → event. Damage type gồm projectile, explosion, trap, zone, status và collision.
- `ItemDefinition` trong `items.json` và `ItemBehaviorRegistry` tránh rải điều kiện `if(itemId == ...)` trong loop. Pickup kiểm tra alive, khoảng cách, tồn tại item, inventory/cooldown và xử lý một lần trên server. Health Kit là item đầu; troll/super item thêm behavior riêng.
- `StatusEffectDefinition`/`StatusEffectInstance`/`StatusEffectManager` quản lý magnitude, duration, source và `Replace`, `RefreshDuration`, `Stack`, `Ignore`. Spawn protection hết theo thời gian hoặc khi chủ động bắn.

Definition JSON chưa tồn tại trong Phase 1; tạo khi system tương ứng được triển khai. Các giá trị balance phải được validate khi nạp config để một config lỗi không phá match đang chạy.

## 8. Room và match lifecycle

Room: `Waiting → Starting → Playing → Ending → Finished`. Host tạo room; server cấp room ID/code; server kiểm tra membership/capacity/start. Khi chơi, chỉ owner runtime được sửa state. Disconnect có thời gian reconnect ngắn rồi mới xử lý leave/death theo rule đã chốt. Spectator không chiếm suất player.

Match: load map → spawn hợp lệ → playing/loot/combat/zone → winner khi còn một người sống → khóa combat → persist kết quả ngoài tick → finished/cleanup. Tại cap 10 của vertical slice, không bật late join vào trận đang chơi vì quy tắc late join yêu cầu `AlivePlayers > 10`. Sau khi tăng cap, server còn phải kiểm tra khoảng cách enemy và spawn protection.

## 9. Map, safe zone, interest và scale

Map Phase 1 là Graphics procedural 2400×1600, dữ liệu nhà trong `client/src/game/config/map.ts`. Phase sau chuyển sang `MapDefinition` và tilemap có collision/decor/spawn/loot/special layers. Thay renderer/map data mà không để GameLoop phụ thuộc Phaser.

`SafeZoneState` giữ center, current/target radius, phase `Waiting/Warning/Shrinking/Stable`, thời điểm bắt đầu/kết thúc. Vòng đích nằm trong vòng trước, tâm và bán kính nội suy theo thời gian server; damage ngoài vòng tích lũy theo simulation `dt`, tăng theo phase. Client chỉ vẽ zone và warning.

`SpatialGrid` dự kiến ô 512×512 world units, snapshot lấy cell hiện tại và lân cận với biên đệm; kill feed, zone và super item warning là global event. Đo bytes/snapshot, tick duration, player count trước khi chuyển cap từ 10 lên 50.

Một match có một game server owner. Khi cần nhiều máy, Redis lưu `roomId → serverId`, presence/server registry và cache; gameplay packet đi trực tiếp client ↔ owner game server, không chuyển mọi movement qua Redis Pub/Sub. State runtime ở memory nên việc chuyển owner sau crash cần thiết kế phục hồi riêng; hiện chưa hỗ trợ.

## 10. Dữ liệu bền vững

**Đã có:** `users(id UUID PK, username VARCHAR(24) UNIQUE, password_hash TEXT, created_at TIMESTAMPTZ)` trong PostgreSQL. Tên cột vật lý do EF migration `InitialAuth` định nghĩa theo PascalCase cho thuộc tính, bảng là `users`. Không sửa tay bảng và migration đã chạy trên môi trường khác.

**Dự kiến:** `refresh_tokens`, `player_profiles`, `cosmetics`, `player_cosmetics`, `player_statistics`, `match_history`, `match_players`, `achievements`, `player_achievements`. Runtime position/projectile/zone không ghi từng tick xuống DB; chỉ persist record kết quả khi match kết thúc. Mỗi phase tạo migration riêng và giữ migration history.

## 11. Bảo mật, quan sát, hiệu năng

Hiện có password hash, unique username, JWT xác thực `/api/me` và SignalR Hub, rate limit auth theo IP, giới hạn Hub message size 4096 byte, kiểm tra input sequence/axis và bounded queue. Phase tiếp theo cần refresh rotation/revocation, kiểm tra room membership, giới hạn input rate, fire rate, ammo, cooldown và pickup distance. Khi browser SignalR truyền token qua query string WebSocket, không log query token.

Structured log nên có `MatchId`, `RoomId`, `PlayerId`, `ConnectionId`, `ServerTick` khi liên quan. Metrics: active connections/matches, players/match, tick duration, snapshot bytes, messages/s, dropped inputs, latency. Không log từng tick. Tick 30 Hz có ngân sách khoảng 33,33 ms; dùng spatial grid, pool và hạn chế allocation trong loop khi profiling chỉ ra vấn đề.

## 12. Quy tắc giữ kiến trúc khi phát triển

1. Đọc [PHASES.md](PHASES.md) và chỉ thêm phần cần cho phase đang làm.
2. Cập nhật `docs/HANDOFF.md` sau mỗi phase: file mới, lệnh chạy, test, phần chưa hoàn thành.
3. Runtime model tách EF entity; Phaser scene không gọi Hub trực tiếp.
4. Mọi command network có cancellation/rate/validation phù hợp. Không để DB/Redis/SignalR I/O trong fixed tick.
5. Mỗi system có test cho rule rủi ro cao; ưu tiên test xử lý command, collision, damage, phase transition và reconciliation hơn test chép lại implementation.
