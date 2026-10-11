# Luật trận, vòng bo và kết quả

Xem [GAMEPLAY.md](GAMEPLAY.md) để có bảng thời gian đầy đủ theo phòng 5/10/20/25/50 người, map, item và tầm nhìn. Phòng online dùng `MatchRuntime` competitive: người chết bị loại, không hồi sinh. Trận `development` dành cho kiểm thử có hồi sinh sau 90 tick và không có bo/kết quả.

## Vòng bo

`data/game_rules.json` quy định năm phase. `ZoneSystem` khởi đầu với tâm `(2000,1500)`, bán kính `2500`, phủ toàn bộ map 4000 × 3000. Vòng đích được chọn theo seed mã trận và nằm trong vòng cũ cũng như trong ranh map. Mỗi phase chuyển `Warning` → `Shrinking` → `Stable`, sau đó sang phase tiếp theo. Thời gian cơ sở cho phòng 10 người là 2 phút mỗi phase; phòng 5/20/25/50 nhân lần lượt 0,8/1,3/1,5/1,9. Tổng lịch bo tương ứng 8/10/13/15/19 phút. Damage ngoài bo tăng 1/2/4/7/12 HP mỗi giây.

`ZoneDamageSystem` tích phần lẻ tại 30 tick/giây và xóa khi người chơi quay lại vùng an toàn. Server trừ máu liên tục ở từng tick và có thể tạo kill do bo. Client nhận `ZoneState` khi vào trận và trong lúc chơi để vẽ vòng, vùng nguy hiểm và thời gian còn lại. Vòng bo không do client điều khiển. Trận có thể kết thúc sớm khi chỉ còn một người sống.

## Kết thúc và xếp hạng

`MatchLifecycle` theo dõi người tham gia, HP, kill, death và placement. Khi còn một người sống sau khi có ít nhất hai người tham gia, trận kết thúc tự động. Nếu hết phase 5 mà nhiều người vẫn sống, người thắng được chọn theo HP, rồi kill, rồi ID. Host cũng có thể kết thúc thủ công; trường hợp đó không gán winner. `MatchResult` chỉ tạo một lần. Người rời phòng chủ động trong khi trận đang chơi bị tính loại; mất kết nối tạm thời được giữ chỗ 30 giây.

`MatchManager` phát `MatchEnded` riêng cho phòng và xếp kết quả vào worker lưu DB, tránh I/O trong tick. `EfMatchResultStore` ghi `match_history`, `match_players`, `player_statistics` vào PostgreSQL bằng transaction. Match ID làm khóa chống cộng thống kê hai lần khi retry. API `GET /api/matches/{id}` chỉ trả kết quả cho tài khoản tham gia; người ngoài hoặc kết quả chưa lưu nhận 404. Queue lưu hiện ở memory: nếu process chết trước khi ghi xong, có thể mất kết quả; cần outbox bền vững nếu triển khai sản xuất nhiều máy.

## Kiểm tra

`tests/Game.RoomProbe` kiểm tra bo ban đầu phủ bốn góc, vòng đích nằm trong map, 5 phase, nhịp theo sức chứa, HP/s và winner. `client/tests/match.integration.mjs` kiểm tra phát bo/kết quả qua SignalR và quyền đọc lịch sử. `tests/Game.PersistenceProbe` kiểm tra lưu trùng không cộng thống kê hai lần.
