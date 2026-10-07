# Yêu cầu sản phẩm và gameplay

Đây là bản gom yêu cầu để không mất ý định ban đầu khi chuyển máy/phiên. **Nó không khẳng định các tính năng đã được code.** Trạng thái triển khai nằm trong [IMPLEMENTED.md](IMPLEMENTED.md) và thứ tự làm trong [PHASES.md](PHASES.md).

## 1. Tầm nhìn

Game online multiplayer 2D top-down dễ chơi, vui và hỗn loạn, dùng phương tiện chiến đấu tự chế. Cảm giác kết hợp arena shooter, battle royale, loot ngẫu nhiên và item troll có cơ hội phản đòn. Art style cartoon đơn giản, màu rõ, nét viền đậm, hài hước; hình ảnh tham khảo gần đây gợi bảng màu pastel và phố xá ấm. Không sao chép asset, tên, nhân vật hoặc gameplay độc quyền của game khác.

Thứ tự ưu tiên: gameplay vui → realtime ổn định → server authoritative → kiến trúc rõ ràng → thêm weapon/item/map/mode dễ → tăng từ MVP lên production mà không viết lại core. Placeholder shape/sprite ở MVP là đủ để kiểm tra gameplay.

## 2. Stack và trách nhiệm

- Backend: .NET 10, ASP.NET Core, C#, PostgreSQL, Redis, SignalR/WebSocket, EF Core, JWT, Docker.
- Client: TypeScript, Phaser 3, Vite; React cho auth/lobby/profile/shop/room/leaderboard/settings, không chạy gameplay loop trong React.
- Server có quyền quyết định movement hợp lệ, HP/damage/death, ammo/weapon, projectile hit, item pickup, safe zone và kết quả. Client gửi input rồi render/predict.
- Persistent account/cosmetics/history nằm trong PostgreSQL. Redis giữ room directory/presence/server discovery/cache. Match runtime nằm trong memory của game server; không ghi movement/projectile từng tick xuống DB và không phát movement qua Redis Pub/Sub.

## 3. Player identity và cosmetics

Account có `PlayerId`, `Username`, `DisplayName`, avatar, vehicle skin, logo, banner, title, emote, kill effect, projectile effect. Mỗi người có một logo chọn từ catalog có sẵn. Logo hiển thị trên xe, cạnh tên, kill feed, leaderboard, profile và kết quả cuối trận. Logo có thể được mở khóa hoặc mua bằng currency trong game; server kiểm tra ownership. MVP **không upload ảnh tùy ý** để tránh moderation. Custom upload chỉ nghiên cứu sau.

Phương tiện/nhân vật gợi ý: xe tăng mini, xe máy gắn súng, xe đẩy siêu thị gắn rocket, xe ba bánh, xe rác, xe công nông, robot bánh xích, thùng rác có động cơ hoặc UFO tự chế. Đây là gợi ý tạo hình, không phải danh sách asset đã có.

## 4. Room và trận

Room fields: `RoomId`, `RoomCode`, `RoomName`, `HostPlayerId`, `Status`, `CurrentPlayers`, `AlivePlayers`, `MaxPlayers`, `MapId`, `CreatedAt`. Command: create/join/leave/quick join/spectate. States: `Waiting`, `Starting`, `Playing`, `Ending`, `Finished`. Mục tiêu lâu dài tối đa **50 người/room**; vertical slice đầu tiên **10 người**. Nhiều room/match chạy cùng lúc, mỗi match có runtime cô lập.

Late join vào `Playing` chỉ khi `AlivePlayers > 10` và `CurrentPlayers < 50`; server chọn spawn hợp lệ tránh enemy gần đó, cấp spawn protection vài giây. Bắn chủ động làm mất protection ngay. Với cap 10 ở vertical slice, late join vào trận đang chơi mặc nhiên chưa bật.

Flow: login → lobby → room browser/create/join → waiting → match start/spawn → loot/combat/bo thu → death/final battle → winner/result → lobby. Match chỉ ghi kills/deaths/placement/damage/playtime/winner/rewards khi kết thúc.

## 5. Map và camera

Map lớn hơn màn hình, camera follow. Map production dùng tilemap, tách `MapDefinition`, collision, decoration, spawn, loot spawn và special area layer. Nội dung có đường chính/nhỏ, ngõ, bãi đất, nhà, tường, cây, bụi, ao, cầu, thùng, chướng ngại, khu loot và khu nguy hiểm. `MapDefinition` phải cho phép thêm map không sửa GameLoop. Phase 1 mới có map Graphics placeholder 2400×1600.

## 6. Movement và input

WASD/phím mũi tên để di chuyển, chuột để ngắm, click trái bắn, click phải dùng secondary item, Space dùng active item. Movement có acceleration, max speed, rotation, slow, boost, knockback. Server validate speed/collision/state. Client dự đoán local, reconciliation theo input sequence; remote players dùng interpolation buffer. Không teleport player theo mỗi network packet. Input không chứa position/damage/HP do client tự quyết.

Server simulation bắt đầu 30 tick/s, network snapshot 10–20/s tùy trạng thái. Input dự kiến có `SequenceNumber`, `ClientTick`, `MoveX`, `MoveY`, `AimAngle`, `Fire`, `UseItem`. Snapshot có `ServerTick`, `LastProcessedInput`, self state và entity gần. JSON/payload đơn giản ban đầu, giữ đường chuyển sang binary serializer.

## 7. Player state và HUD

Runtime player: identity/connection, position/rotation/velocity, health/max health (mẫu 100), current weapon/ammo, inventory, status, kills/assists, alive, spawn protection, last input sequence. HUD có HP bar, weapon/ammo, active item, status, minimap, alive count, kill count. Lobby có PLAY, CREATE ROOM, ROOM LIST, PROFILE, COSMETICS, LEADERBOARD, SETTINGS. Room browser có name, players/alive, status, ping và join. Kill feed hiển thị attacker, weapon, victim và logo phù hợp.

## 8. Weapon, projectile và damage

`WeaponDefinition`: ID, name, damage, fire rate, projectile speed/count, spread, magazine, reload, range, rarity, knockback. Behavior được đăng ký, không hard-code từng súng vào Player. MVP đi theo thứ tự Pistol trước, rồi SMG, Shotgun, Rifle, RocketLauncher, GrenadeLauncher. Weapon hài hước có thể thêm sau (ví dụ dép launcher, cá thối, nồi cơm rocket, chổi machine gun), tên cuối cùng do playtest quyết định.

Projectile runtime: ID, owner, weapon, position/velocity, damage, radius, spawn/expire time. Server move/collision/hit/damage/despawn; client render và pool sprite. `DamageService` xử lý validate → modifier → armor/shield → HP → status → death → kill attribution → event; type gồm projectile, explosion, trap, zone, status, collision. HP <= 0: set dead, bỏ combat, drop loot, cập nhật alive/scoreboard, broadcast kill, có thể spectate.

## 9. Loot, item và status

`LootTable` theo rarity `Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`, `Chaos`; category `Weapon`, `Ammo`, `Healing`, `Armor`, `Utility`, `Trap`, `SuperItem`. Server spawn/despawn. Pickup flow: request entity ID → kiểm tra alive, khoảng cách, item tồn tại/available, inventory → apply → remove → broadcast. Client không tự xác nhận.

`ItemDefinition` + `IGameItemBehavior` + `ItemBehaviorRegistry`; logic item không rải `if(item == ...)` trong loop. `StatusEffectDefinition`, instance và manager có effect ID, duration, stack policy, magnitude, source player. Policies `Replace`, `RefreshDuration`, `Stack`, `Ignore`. Các effect dự kiến: Slow, Stun, Burn, Poison, Glue, Slip, SpeedBoost, DamageBoost, Shield, SpawnProtection, VisionReduction.

Troll items dự kiến:

| Item | Tác dụng cần giữ khi triển khai |
|---|---|
| Nail Trap | Enemy đi qua mất ít HP, chậm lại, xe rung/lệch nhẹ |
| Super Glue | Vùng keo gây slow và giảm traction vài giây |
| Stink Bomb | Cloud che vision nhẹ, aim wobble, giảm movement nhẹ |
| Banana Trap | Xe trượt/quay nhẹ |
| Fake Loot Box | Giống loot, nổ khi enemy cố nhặt |
| Magnet | Hút loot gần player, pickup vẫn do server xác nhận |
| EMP | Tạm vô hiệu một số active item của enemy |
| Teleport Box | Chuyển đến vị trí random hợp lệ gần đó |
| Chicken Mode | Xe thành gà vài giây, chạy nhanh hơn nhưng không bắn |

Không làm hiệu ứng quá mạnh khiến người chơi mất hoàn toàn quyền điều khiển. Mọi effect đều có giới hạn thời gian/magnitude và tín hiệu hình ảnh đủ để hiểu chuyện gì xảy ra.

Super items rất hiếm: `Map Barrage` cảnh báo toàn map rồi sau khoảng 3 giây mới rơi bom với marker né; `Giant Laser` có warning trước khi quét; `Loot Rain` rải loot một vùng; `Chaos Mode` cho modifier tạm thời khoảng 10 giây. Counter-play là yêu cầu thiết kế, không chỉ là hiệu ứng đẹp.

## 10. Safe zone

`SafeZoneState`: `CenterX`, `CenterY`, `CurrentRadius`, `TargetRadius`, `ShrinkStartTime`, `ShrinkEndTime`, `Phase`. Phase là `Waiting`, `Warning`, `Shrinking`, `Stable`; vòng nhỏ dần và server quyết định tâm/radius/damage. Damage mẫu theo phase: **1, 2, 4, 7, 12 HP/s**. Client chỉ render vòng và cảnh báo, server tích lũy damage theo thời gian simulation.

## 11. Networking, nhiều server và anti-cheat

Interest management dùng spatial grid/hash, ví dụ cell 512×512. Snapshot chỉ chứa player/projectile/item/effect quanh connection; kill, zone, match end và super item warning là global event. Một match thuộc một game server owner; Redis cho biết room thuộc server nào khi có nhiều game server. Match runtime phải cô lập lỗi.

Anti-cheat: JWT cho SignalR; PlayerId từ claims; validate sequence, movement speed, fire rate, ammo/reload, pickup distance, cooldown, alive và room membership; rate limit command, giới hạn message/queue. Không tin payload kiểu `Damage=999` hoặc `Position=(x,y)`. Log structured có match/room/player/connection/tick. Metrics chuẩn bị cho active connections/matches, tick duration, snapshot size, messages/s, dropped inputs, latency. Không log từng tick production.

## 12. Hiệu năng, âm thanh và cấu hình

Target cuối: 50 người/room sau load test; tick 30 Hz có khoảng 33,33 ms/tick. Hạn chế LINQ/allocation trong hot loop, dùng spatial partition, pooling và struct khi đo đạc cho thấy có lợi. GameLoop đo tick duration và cảnh báo khi vượt budget. Client AudioManager có nhóm Weapon/Explosion/Vehicle/UI/Item/Ambient và Master/Music/SFX volume. Config data dự kiến: `weapons.json`, `items.json`, `loot_tables.json`, `maps.json`, `game_rules.json`; chưa tồn tại ở Phase 1.

## 13. Event vocabulary

Các event dự kiến: `PlayerJoined`, `PlayerSpawned`, `PlayerMoved`, `WeaponFired`, `ProjectileSpawned`, `ProjectileHit`, `DamageApplied`, `PlayerKilled`, `ItemSpawned`, `ItemPicked`, `StatusApplied`, `ZoneStartedShrinking`, `MatchEnded`. System phát/nhận qua ranh giới rõ ràng; event không phải lý do để phân tán mutable state của cùng match sang nhiều thread.
