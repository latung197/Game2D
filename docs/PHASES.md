# Lộ trình phát triển Phase 1–10

**Ngày cập nhật:** 2026-10-11. **Trạng thái thực tế:** Phase 1–7 đã triển khai; map lớn, phòng 5–50, bo theo sức chứa và túi đồ ba loại đã được bổ sung sau Phase 7. Các mô tả trạng thái từng phase bên dưới là lịch sử và có thể dùng số liệu cũ. Cấu hình hiện hành ở [GAMEPLAY.md](GAMEPLAY.md), code/giới hạn ở [IMPLEMENTED.md](IMPLEMENTED.md).

Mốc quan trọng là **vertical slice sau Phase 7**: một map, một room tối đa 10 người, 100 HP, Pistol, Health Kit, một safe zone, create/join room, damage/death/winner. Chỉ sau mốc này mới mở rộng troll item, interest management và cosmetics. Mỗi phase cần cập nhật tài liệu, chỉ rõ file tạo/sửa, lệnh chạy, test và kết quả quan sát được.

## Phase 1 — nền tảng và lái thử offline — ĐÃ LÀM

**Mục tiêu:** solution .NET 10, client React/Vite/Phaser, auth cơ bản, map lớn hơn viewport và một xe di chuyển offline.

**File/trách nhiệm đã tạo:**

| File hoặc nhóm | Trách nhiệm |
|---|---|
| `Game.sln`, `src/Game.*/*.csproj` | Bảy project và project references theo ranh giới kiến trúc |
| `src/Game.Api/Program.cs` | Config, DI, middleware, auth endpoints, migration startup |
| `src/Game.Api/Authentication/JwtTokenIssuer.cs` | Phát JWT access token 30 phút |
| `src/Game.Application/Accounts/AuthService.cs` | Validate username/password, hash, verify, auth use case và interfaces |
| `src/Game.Infrastructure/Persistence/GameDbContext.cs` | EF model `users` |
| `src/Game.Infrastructure/Persistence/EfAccountRepository.cs` | Truy vấn/lưu account, xử lý unique violation |
| `src/Game.Infrastructure/Persistence/Migrations/*` | Migration `InitialAuth` và model snapshot |
| `src/Game.Api/appsettings.Development.json` | Cấu hình local development mẫu |
| `src/Game.Api/Dockerfile`, `compose.yaml`, `.env.example` | Container build, PostgreSQL/Redis/API local Compose |
| `client/package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json` | Build scripts, dependencies, proxy API và TypeScript |
| `client/index.html`, `src/main.tsx`, `src/style.css` | Entry point và style giao diện |
| `client/src/ui/App.tsx`, `client/src/services/api/auth.ts` | Login/register và gọi API |
| `client/src/game/PhaserGame.tsx`, `config/map.ts`, `scenes/GameScene.ts` | Mount Phaser, map placeholder, xe offline, camera/collision |
| `README.md`, `docs/*` | Hướng dẫn và bàn giao |

**Đã kiểm tra:** `dotnet build Game.sln` không lỗi/cảnh báo; `npm run build` và `npm run format:check` thành công. Trên PostgreSQL thử nghiệm đã chạy migration, register/login/`/api/me`; username trùng trả 409, mật khẩu sai trả 401. Trên máy gốc đã chạy API với PostgreSQL 16 có sẵn, tạo database game riêng, frontend trả HTTP 200 và `/health` trả `ok`. Màn lái thử được kiểm tra bằng screenshot. Vite báo chunk Phaser lớn nhưng Phaser đã lazy load khi vào màn game.

**Giới hạn khi kết thúc Phase 1:** movement/aim/collision chỉ chạy ở client; map Graphics chưa phải tilemap; không có room, bắn, HP, projectile, loot, zone hay realtime. Phase 2 đã thêm movement server và realtime. Auth vẫn chưa có refresh token/logout server. Docker Compose chưa được chạy thực tế trên máy gốc vì không có Docker CLI.

## Phase 2 — realtime, hai người thấy nhau — ĐÃ LÀM

**Điều kiện đầu vào:** Phase 1 build được, API và PostgreSQL chạy. Tạo một development match cố định nhưng **đã dùng `MatchManager`/`MatchRuntime`**, để Phase 4 chỉ thêm lifecycle room.

**Việc triển khai:**

1. Thêm `Game.Shared/Contracts` cho `InputBatch`, `JoinAccepted`, `Snapshot`, `GameEvent`, version của protocol. ID người chơi lấy từ JWT.
2. Thêm `Game.Application/Abstractions/IMatchCommandGateway` và `IGameEventPublisher` để Hub không phụ thuộc trực tiếp vào nội bộ simulation.
3. Thêm `Game.Realtime/Hubs/GameHub`, `Connections/ConnectionRegistry`, publisher SignalR; cấu hình JWT cho Hub path và kết nối lại.
4. Thêm `Game.Server/Matches/MatchManager`, `MatchRuntime`, command queue giới hạn, `Players/PlayerRuntime`, fixed tick 30 Hz. Server áp input movement cơ bản, kiểm tra sequence/giới hạn. Chưa cần client prediction.
5. Thêm `client/src/services/realtime/RealtimeClient`, `game/network/GameNetworkAdapter`, `ClientWorldState`. Phaser render self/remote từ snapshot. Kết nối UI sau login.

**Test bắt buộc:** mở hai trình duyệt/tài khoản; cả hai thấy nhau, di chuyển trên cùng map; disconnect một người không làm chết loop. Gửi payload có player ID khác hoặc position/damage tự đặt không làm thay đổi state server. Đo sơ bộ tần suất snapshot và memory khi không có người chơi.

**Hoàn tất khi:** hai client thấy vị trí của nhau qua server, mỗi runtime có state riêng, Hub không chứa luật gameplay. Chấp nhận movement còn hơi giật; Phase 3 xử lý độ mượt.

## Phase 3 — movement authoritative và hình ảnh mượt — ĐÃ LÀM

**Việc triển khai:**

1. Chuyển movement sang `PlayerMovementSystem` với acceleration, max speed, rotation, collision và clamp map; không nhận position từ client.
2. Input có sequence/clientTick; server gửi self state, serverTick và last processed sequence.
3. Client local prediction + pending input replay; remote interpolation buffer theo serverTick. Smooth correction nhỏ, áp ngay teleport/spawn/death.
4. Dùng chung dữ liệu map collision trong `data/map.json` ở client và server; server vẫn là nguồn sự thật khi hai implementation sai lệch.
5. Thêm phép đo input delay/correction, dropped sequence và tick duration.

**File dự kiến:** `Game.Server/Players/PlayerMovementSystem.cs`, `Physics/CollisionSystem.cs`, `GameLoop/FixedGameLoop.cs`, `client/src/game/network/Prediction.ts`, `Reconciliation.ts`, `Interpolation.ts`, cập nhật scene/contract.

**Test bắt buộc:** mô phỏng độ trễ 50–100 ms; self đi ngay theo phím, remote di chuyển mượt; server sửa vị trí khi client cố gửi input sai/di chuyển xuyên tường; sequence cũ/trùng bị bỏ. Có test server về tốc độ tối đa, collision, dt và sequence; client test replay input chưa ack.

**Hoàn tất khi:** server quyết định movement cuối cùng và cả local/remote có thể chơi được dưới độ trễ mục tiêu.

**Kết quả 2026-10-11:** `PlayerMovementSystem` tăng tốc/phanh/xoay/va nhà tại 30 Hz; protocol v5 có `clientTick`, ACK riêng từng người và vận tốc; client dự đoán/replay, sửa sai và nội suy xe khác. Test server xác nhận tốc độ, va nhà, input cũ/sai và ACK; test đối chiếu 237 tick C#–TypeScript lệch tối đa 0,003 đơn vị. Hai tab Edge qua bài test chuyển động local/remote ở 50, 80 và 100 ms độ trễ giả lập; test realtime xác nhận reconnect. Chưa đo trên thiết bị hoặc mạng thật.

## Phase 4 — room và nhiều match cô lập — ĐÃ LÀM

**Việc triển khai:** REST create/list/join/leave/quick join; host start; room states `Waiting/Starting/Playing/Ending/Finished`; `RoomId`, code, map, count, host; `MatchManager` tạo/dừng nhiều runtime; nhóm SignalR theo match; reconnect/spectator theo policy. Cap vertical slice là **10 người**, nhưng dữ liệu và protocol dùng type có thể tăng lên 50. Redis room directory/presence có thể được thêm ở phase này hoặc khi có nhiều game server; runtime state vẫn in-memory.

**File dự kiến:** `Game.Application/Rooms/*`, `Game.Api/Endpoints/RoomEndpoints.cs`, `Game.Domain/Rooms/*`, `Game.Server/Matches/*`, `Game.Realtime/Connections/*`, `client/src/ui/room/*`.

**Test bắt buộc:** create/join/leave, room full, chỉ host start, hai room chạy đồng thời không thấy entity của nhau, disconnect/rejoin, host leave, cleanup finished room. Không cho user ở room A gửi command cho room B.

**Hoàn tất khi:** ít nhất hai match độc lập chạy trong cùng process. Quy tắc late join `AlivePlayers > 10` chưa thể áp dụng với cap 10; bật sau khi tăng cap và thêm spawn an toàn/protection.

**Kết quả 2026-10-11:** có REST tạo/liệt kê/vào/rời/ghép nhanh, host bắt đầu và kết thúc thủ công; mỗi phòng có `MatchRuntime` riêng, SignalR group và binding room cho từng kết nối. Phòng thường chặn vào muộn, phòng ghép nhanh cho vào khi chưa đủ 10 người. Reconnect giữ chỗ 30 giây và khôi phục vị trí/HP/cooldown; host rời thì chuyển quyền; phòng trống và phòng đã kết thúc được dọn. Test hai phòng song song xác nhận không lẫn movement, snapshot và shot; test trình duyệt xác nhận tạo/vào/bắt đầu. Spectator bị từ chối theo policy hiện tại. State phòng nằm trong memory một process, chưa có Redis/persistence hoặc tải nhiều process. Xem [ROOMS.md](ROOMS.md).

## Phase 5 – Pistol, projectile, damage và death – ĐÃ LÀM

**Việc triển khai:** nạp `weapons.json`; `WeaponDefinition` + behavior registry; Pistol với fire rate, ammo, reload; server spawn/move/despawn projectile và collision; `DamageService` pipeline; HP tối đa 100; kill attribution, drop state và spectator. Client chỉ gửi `fire`/aim, render projectile/HUD/event.

**File dự kiến:** `config/weapons.json`, `Game.Domain/Weapons/*`, `Game.Server/Combat/{WeaponSystem,DamageService}.cs`, `Projectiles/*`, `Networking/SnapshotBuilder.cs`, `client/src/game/entities/*`, `ui/hud/*`.

**Test bắt buộc:** bắn vượt fire rate không tạo thêm đạn; ammo/reload đúng; hit server trừ HP một lần; client tự gửi damage/HP không có tác dụng; người chết không bắn/nhặt/move; projectile hết range/lifetime biến mất. Test damage service và projectile collision riêng.

**Hoàn tất khi:** hai người có thể bắn nhau bằng Pistol và thấy death/kill event nhất quán.

**Kết quả 2026-10-11:** `data/weapons.json` cấu hình năm vũ khí, dung lượng băng, đạn dự trữ, tốc độ bắn và thời gian nạp. Server trừ đạn khi nhận phát bắn hợp lệ, tự bắt đầu nạp khi bóp cò với băng rỗng, chặn bắn trong lúc nạp/chết, chuyển đúng số viên từ dự trữ sau thời gian nạp. `DamageService` xử lý HP và trạng thái chết; server ghi số hạ/gục và phát `Kill` tới đúng phòng. `AmmoChanged` chỉ tới người sở hữu. HUD có đạn, nút/phím R, kill feed; lúc chết camera theo người chơi còn sống trong tầm nhìn đến khi hồi sinh. Probe mô phỏng xác nhận cooldown, mỗi viên trừ máu một lần, hạ gục một lần, chặn hành động khi chết, nạp đạn, hồi sinh và đạn hết tầm. Kiểm thử SignalR hai tài khoản xác nhận sự kiện đạn/nạp/hạ gục và các loại đạn cũ. Chưa có nhặt vật phẩm hoặc rơi đồ; đó là Phase 6.

## Phase 6 — loot và Health Kit — ĐÃ LÀM

**Việc triển khai:** `ItemDefinition` + `IGameItemBehavior` registry; map loot spawn points; world item state; Health Kit server heal đến tối đa 100; pickup distance/availability/inventory validation; cooldown/despawn/respawn policy; event pickup và HUD. Thiết kế loot table để sau này thêm weapon/ammo/trap.

**File dự kiến:** `config/items.json`, `loot_tables.json`, `Game.Server/Items/*`, `Loot/*`, `Game.Domain/Items/*`, `client/src/game/entities/WorldItem*`, HUD.

**Test bắt buộc:** hai người nhặt cùng item thì chỉ một người nhận; nhặt quá xa/bằng entity ID sai/bởi player chết bị từ chối; heal không vượt 100; item remove khỏi snapshot sau pickup.

**Hoàn tất khi:** Health Kit xuất hiện trên map và được server xác nhận khi nhặt.

**Kết quả hiện tại:** `data/items.json` định nghĩa cứu thương (+40 HP), pin radar và hộp đạn, tầm nhặt 80, số tối đa và số cấp đầu trận. `data/loot_tables.json` có 16 điểm. `LootSystem` xác nhận nhặt và revision; `MatchRuntime` giữ túi đồ, áp hiệu ứng khi gọi `UseItem`, giữ số lượng qua reconnect. Client vẽ ba loại item và có túi đồ chạm được, phím E/Q/T/G. Probe và test SignalR kiểm tra tranh nhặt, stack, dùng item và hồi sinh loot. Xem [GAMEPLAY.md](GAMEPLAY.md).

## Phase 7 — safe zone, match lifecycle và winner — ĐÃ LÀM

**Việc triển khai:** `game_rules.json` chứa phase duration/damage; `SafeZoneSystem` chọn vòng đích nằm trong vòng trước, warning/shrink/stable, damage theo dt; match start/end, winner/placement; persist `match_history`, `match_players`, `player_statistics` một lần ngoài tick; result screen và quay lobby.

**File đã có:** `data/game_rules.json`, `Game.Server/Zones/*`, `Matches/MatchLifecycle.cs`, `Game.Infrastructure/Persistence/EfMatchResultStore.cs` và migration `202610110001_MatchResults`, `client/src/game/render/ZoneRenderer.ts`, `client/src/ui/MatchResultScreen.tsx`. Chi tiết luật và schema: [MATCHES.md](MATCHES.md).

**Test bắt buộc:** zone không tăng bán kính/ra ngoài map, damage đúng 1/2/4/7/12 HP/s theo config, warning đến trước shrink, winner chỉ chốt một lần, DB lưu kết quả một lần khi retry, match A lỗi không hỏng match B.

**Kết quả 2026-10-11:** phòng online có vòng bo 5 giai đoạn Warning/Shrinking/Stable, sát thương 1/2/4/7/12 HP/s, người chết không hồi sinh, tự chốt winner/placement hoặc host kết thúc thủ công. Server phát `ZoneState` và `MatchEnded`; PostgreSQL lưu lịch sử và cộng thống kê ngoài tick bằng transaction có kiểm tra ghi trùng. API kết quả chỉ cho người tham gia đọc. Client vẽ vòng hiện tại/đích trên map và minimap, cảnh báo ngoài bo, hiển thị bảng kết quả và quay sảnh. Probe C# qua luật bo/kết quả; test hai client và DB qua `npm run test:match`; probe DB `npm run test:match:store` xác nhận retry không cộng thống kê hai lần. Migration đã áp dụng trên DB phát triển. Chưa có thử đủ 10 người thật đồng thời, đo tải dài hạn, hay outbox bền vững nếu process chết trước khi lưu.

## Phase 8 — troll item và super item — CHƯA LÀM

**Việc triển khai:** `StatusEffectManager` với duration/magnitude/stack policy; Nail Trap, Super Glue, Stink Bomb, Banana Trap, Fake Loot Box, Magnet, EMP, Teleport Box, Chicken Mode; super item Map Barrage/Giant Laser/Loot Rain/Chaos Mode thông qua behavior registry. Mỗi effect có cảnh báo/counter-play và server validate. Ưu tiên làm 2–3 item một đợt nhỏ, playtest rồi cân bằng trước khi thêm hết.

**File dự kiến:** `config/items.json`, `Game.Domain/StatusEffects/*`, `Game.Server/StatusEffects/*`, `Items/Behaviors/*`, `client/src/game/effects/*`, audio/particle manager.

**Test bắt buộc:** effect hết hạn, stack policy đúng; spawn protection bị hủy khi bắn; teleport chọn vị trí hợp lệ; super item có warning trước damage; không item nào tước hoàn toàn khả năng điều khiển ngoài thời gian/rule đã công bố. Playtest khả năng né/trả đòn.

**Hoàn tất khi:** item tạo tình huống hài hước nhưng người chơi hiểu nguyên nhân, thời gian tác dụng và cách đối phó.

## Phase 9 — interest management, tối ưu mạng và tải — CHƯA LÀM

**Việc triển khai:** spatial grid 512×512, vùng quan tâm gồm cell hiện tại và lân cận có biên đệm; lọc player/projectile/item/effect trước khi build snapshot; event global riêng; đo snapshot bytes, dropped input, CPU, GC, tick p95/p99; pool object phía client. Sau đo tải có thể thêm binary serializer/delta snapshot, giữ versioning.

**File dự kiến:** `Game.Server/World/SpatialGrid.cs`, `Networking/{InterestManager,SnapshotBuilder}.cs`, `Game.Realtime/Serialization/*`, client network/render pools, benchmark/load tools.

**Test bắt buộc:** entity vào/ra AOI không nhấp nháy hoặc mất hit event, người ở xa không nhận state không cần thiết, 10 người ổn định; tăng dần đến 50 với bot/load client và theo dõi tick dưới ngân sách 33,33 ms cùng packet size. Không nâng max player chỉ vì một lần build thành công.

**Hoàn tất khi:** sức chứa 50 đã được đo qua 50 kết nối thật và tải nhiều phòng kéo dài; hiện mới có cap/điểm spawn/luật bo và probe server. Khi dùng nhiều server, room routing qua Redis/server registry nhưng movement vẫn tới owner server.

## Phase 10 — identity, logo, cosmetics và số liệu — CHƯA LÀM

**Việc triển khai:** bảng profile/cosmetic/ownership/statistics/achievement/leaderboard bằng migration; logo chọn từ bộ có sẵn, unlock hoặc mua bằng currency game; hiển thị trên xe, tên, kill feed, leaderboard, profile và result; vehicle skin/banner/title/emote/effect theo cùng catalog. Server validate ownership và reward. Không mở upload logo tùy ý ở MVP.

**Phần đã có từ Phase 7:** bảng `player_statistics` cộng tổng trận/thắng/kill/death khi lưu kết quả. Chưa có endpoint hồ sơ, bảng xếp hạng, cosmetic hoặc reward.

**File dự kiến:** `Game.Application/Profiles/*`, `Leaderboard/*`, `Game.Infrastructure/Persistence` entity/migration, `Game.Api/Endpoints/*`, `client/src/ui/{profile,inventory,leaderboard}/*`, Phaser cosmetic renderer.

**Test bắt buộc:** client không trang bị cosmetic chưa sở hữu; reward không cộng hai lần; logo giống nhau ở mọi màn; leaderboard pagination/sort đúng; match statistics bền vững sau restart.

**Hoàn tất khi:** profile và lịch sử vẫn đúng sau đăng xuất/đăng nhập trên máy khác, cosmetic không ảnh hưởng luật combat.

## Quy trình bàn giao sau mỗi phase

1. Build solution/client; chạy test liên quan đến rule mới; chạy ít nhất một vòng kiểm thử tay theo **Hoàn tất khi**.
2. Cập nhật `docs/ARCHITECTURE.md` theo implementation thực tế; không để hợp đồng dự kiến thành tài liệu khẳng định đã có.
3. Cập nhật `docs/HANDOFF.md`: trạng thái, file mới, migration/config, lệnh chạy, test và rủi ro còn lại.
4. Ghi thay đổi breaking protocol và cách nâng version khi client/server không thể dùng chung contract cũ.
5. Chỉ bắt đầu phase tiếp theo sau khi phase hiện tại chạy được từ một checkout mới với hướng dẫn trong `docs/SETUP.md`.
