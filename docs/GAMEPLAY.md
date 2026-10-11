# Gameplay, map và túi đồ

## Vũ khí và xe

Trong trận, chọn súng bằng phím `1`–`9` hoặc vuốt/chạm thanh súng trên điện thoại. Nút `i` cạnh súng đang chọn mở mô tả, sát thương, nhịp bắn, tầm bắn, băng đạn, đạn dự trữ và thời gian nạp. `R` nạp đạn. Mọi chỉ số dưới đây lấy từ `data/weapons.json`; server quyết định sát thương và đạn thực tế. 30 tick bằng một giây.

| Phím | Vũ khí | Sát thương/trúng | Nhịp bắn | Tầm | Băng/dự trữ | Nạp | Đặc tính |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Súng trường | 25 HP | 7 tick | 1800 | 12/60 | 45 tick | Đạn bay cân bằng |
| 2 | Laser | 25 HP | 12 tick | 2800 | 6/24 | 60 tick | Tia trúng tức thời |
| 3 | Tên lửa | 40 HP | 30 tick | 2200 | 3/12 | 75 tick | Nổ bán kính 110 |
| 4 | Pháo | 45 HP | 45 tick | 1350 | 2/8 | 90 tick | Đạn cầu vồng, nổ bán kính 145 |
| 5 | Súng bùn | 0 HP | 20 tick | 1200 | 5/20 | 60 tick | Vũng bùn làm chậm khoảng 4 giây |
| 6 | Liên thanh | 12 HP | 3 tick | 1500 | 30/150 | 60 tick | Đạn bay, nhịp bắn cao |
| 7 | Bắn tỉa | 65 HP | 45 tick | 3000 | 4/20 | 75 tick | Tia tức thời, tầm xa |
| 8 | Lựu đạn | 35 HP | 30 tick | 1000 | 4/16 | 75 tick | Ném qua vật cản, nổ bán kính 180 |
| 9 | Xung điện | 15 HP | 5 tick | 700 | 15/75 | 45 tick | Tia tức thời, tầm gần |

Mỗi người bắt đầu với 100 HP. Xe trong phòng online không tự mất máu khi đứng yên: sát thương đến từ người chơi khác hoặc bo sau khi thu; bo ban đầu phủ toàn bản đồ. Vị trí xuất hiện của người chơi được giãn xa để tránh giao tranh ngay lúc vào; vụ nổ của chính người bắn không gây sát thương cho người đó. Phòng online loại xe khi HP về 0 và cho xem trận; phòng `development` hồi sinh để thử súng.

Tài liệu này mô tả trạng thái hiện tại của Scrap Street. Mọi phòng online dùng server .NET làm nguồn sự thật; chế độ khám phá và tập bắn offline chạy trong trình duyệt. Gameplay và giao diện cùng đọc `data/map.json`; server nhúng cùng dữ liệu khi build.

## Bản đồ và hiển thị

- Map rộng **4000 × 3000 world unit**, tile trang trí 80. Tọa độ binary dùng `u16` với độ phân giải 1/16 unit, vì vậy kích thước tối đa theo protocol v6 là khoảng 4095,94 unit mỗi trục. Muốn tăng nữa phải đổi protocol và codec hai phía.
- `data/map.json` chứa kích thước, nhà, bụi, cây và đèn đường. Nhà chặn xe/đạn; bụi che người chơi ở xa; cây và đèn đường chỉ là trang trí. `MapRenderer` vẽ đường, vỉa, vạch qua đường, cửa sổ, mái, cửa ra vào và lớp cỏ. Map có thêm khu nhà ở phía đông và nam, cùng loot spawn tại các khu này.
- Xe được vẽ ở tỷ lệ 0,78 so với art cũ. Camera trên màn hình hẹp zoom 0,64 để thấy thêm địa hình. Va chạm server vẫn dùng bán kính/hộp cũ; tỷ lệ chỉ thay đổi hình vẽ.
- `LightingRenderer` vẽ chu kỳ ngày đêm hoặc chế độ cố định ngày/đêm (`N`). Đèn pha (`L` hoặc nút bản đồ) là nguồn sáng cục bộ và một lệnh gửi server. Khi bật, mục tiêu **trong bụi** có thể bị lộ nếu ở trong nón hướng ngắm ±0,34 rad, cách tối đa 570 unit và không bị nhà chắn. Server lọc snapshot theo tầm nhìn; client tin kết quả lọc đó. Radar hiện toàn bộ đối thủ trong 6 giây. Đây là cơ chế phát hiện mục tiêu, không phải phá hủy bụi.
- Minimap dùng kích thước map thật, hiện bo hiện tại, bo đích, vùng nguy hiểm, item, tầm nhìn và vệt khám phá. Vùng ngoài bo được phủ màu cả trên bản đồ chính và minimap.

## Phòng và nhịp trận

Host chọn sức chứa **5, 10, 20, 25 hoặc 50** khi tạo phòng; mặc định và ghép nhanh là 10. Số người dùng để nhân thời gian các bước của bo, chứ không thay đổi tốc độ tick. Thời gian sau là **trần theo lịch bo** khi không có winner sớm; trận có thể kết thúc ngay khi chỉ còn một người sống. Với một người duy nhất, trận chờ thêm người và có thể hết lịch bo mà không tạo winner cho tới khi có đủ người tham gia.

| Sức chứa | Hệ số thời gian | Tổng lịch bo | Mục tiêu thiết kế |
|---:|---:|---:|---|
| 5 | 0,8 | 8 phút | Đấu nhỏ, vào giao tranh sớm |
| 10 | 1,0 | 10 phút | Nhịp tiêu chuẩn |
| 20 | 1,3 | 13 phút | Nhiều thời gian loot và di chuyển |
| 25 | 1,5 | 15 phút | Giảm áp lực đầu trận |
| 50 | 1,9 | 19 phút | Đủ thời gian phân tán trên map lớn |

Đây là **mục tiêu cân bằng do dự án chọn**, cần playtest thực tế. Cơ chế tham khảo là storm nhiều giai đoạn, có thời gian chờ, thời gian đổi kích thước và sát thương theo giây trong [tài liệu Epic về Advanced Storm Controller](https://dev.epicgames.com/documentation/fortnite/using-advanced-storm-controller-beacon-devices-in-fortnite-creative?lang=en-US). Tài liệu đó không quy định các thời lượng trên cho Scrap Street.

## Bo an toàn

`data/game_rules.json` là cấu hình duy nhất. Bo bắt đầu tại `(2000, 1500)`, bán kính `2500`, đi qua đúng bốn góc map: **mọi vị trí trên map đều an toàn lúc đầu**. Trước khi thu, UI vẽ vòng đích. Server chọn vòng đích ngẫu nhiên theo mã trận, giữ nó nằm trong vòng hiện tại và trong map. Mỗi phase gồm `Warning`, `Shrinking`, `Stable`.

| Phase | Warning | Thu | Ổn định | Bán kính đích | Sát thương ngoài bo |
|---:|---:|---:|---:|---:|---:|
| 1 | 60 giây | 40 giây | 20 giây | 1420 | 1 HP/giây |
| 2 | 40 giây | 50 giây | 30 giây | 900 | 2 HP/giây |
| 3 | 30 giây | 60 giây | 30 giây | 500 | 4 HP/giây |
| 4 | 30 giây | 60 giây | 30 giây | 220 | 7 HP/giây |
| 5 | 20 giây | 70 giây | 30 giây | 40 | 12 HP/giây |

Các giây ở bảng là cơ sở cho phòng 10 người. `ZoneSystem` nhân từng thời lượng với hệ số sức chứa, làm tròn sang tick; tốc độ 30 tick/giây. `ZoneDamageSystem` tích phần lẻ nên tổng HP mất sau 30 tick đúng số HP/giây dù tỷ lệ thấp. Khi vào lại bo, phần lẻ được xóa. Server tính damage liên tục và ghi kill do bo; client chỉ hiển thị. Phòng online không hồi sinh; `development` hồi sinh để thử vũ khí, không có bo.

## Túi đồ và loot

`data/items.json` định nghĩa loại, tầm nhặt, thời gian xuất hiện lại, số lượng tối đa và số lượng cấp đầu trận. `data/loot_tables.json` định nghĩa 16 điểm loot. Người chơi online vào trận với **1 túi cứu thương, 1 pin radar và 1 hộp đạn**. Nhặt (`E`, nút trên HUD hoặc nhấn item trên map) chỉ cất vào túi; item biến mất cho cả phòng và tái xuất hiện theo từng loại. Server kiểm tra sống/chết, khoảng cách tối đa 80 unit, item còn sẵn và stack chưa đầy.

| Item | Số tối đa | Dùng bằng | Tác dụng | Hồi sinh |
|---|---:|---|---|---:|
| Túi cứu thương | 3 | Q hoặc chạm ô | +40 HP, tối đa 100; chỉ dùng khi thiếu máu | 30 giây |
| Pin radar | 2 | T hoặc chạm ô | Hiện đối thủ toàn map trong 6 giây; cập nhật cooldown radar 30 giây | 40 giây |
| Hộp đạn | 3 | G hoặc chạm ô | Thêm tối đa một băng cho mỗi vũ khí vào đạn dự trữ, không vượt giới hạn byte | 30 giây |

`InventoryState` và `UseItemResult` đi riêng qua SignalR MessagePack; snapshot di chuyển binary v6 giữ nguyên. Túi đồ nằm trong `PlayerRuntime` và được giữ khi reconnect trong 30 giây. Số lượng và hiệu ứng do server quyết định. `PickupResult.Health`/`ItemPicked.NewHealth` là HP **tại thời điểm nhặt**, không còn mang nghĩa đã hồi máu. `UseItem` trả hiệu ứng đã áp, HP mới, radar và đạn; client không tự cộng máu/đạn. Người chết không nhặt/dùng đồ. Túi đồ hiện trong HUD online với số lượng và phím tắt.

## Công nghệ realtime

SignalR hiện dùng MessagePack Hub Protocol và tự chọn WebSocket khi có thể, với fallback qua Server-Sent Events hoặc Long Polling. Input/snapshot/shot dùng payload nhị phân để giảm byte; lệnh phòng, item và event dùng MessagePack. Client dự đoán di chuyển ở 30 Hz và làm mượt khi hòa giải với server. [Microsoft mô tả WebSocket là transport ưu tiên của SignalR](https://learn.microsoft.com/en-us/aspnet/core/signalr).

Map tĩnh được raster hóa thành texture **một lần khi vào scene** thay vì phát lại hàng nghìn lệnh Phaser Graphics mỗi frame. Client chọn độ phân giải texture theo `MAX_TEXTURE_SIZE` của GPU; xe khác dùng đồng hồ nội suy không đi lùi khi snapshot tới muộn, còn sai lệch nhỏ của xe mình được hòa giải dần. Trong Edge headless mô phỏng màn 390×844 với hai người online, p50/p95 frame từ khoảng 50/66,7 ms trước sửa map xuống 16,7/16,8 ms sau sửa. Đây là số đo tại máy kiểm thử, không phải cam kết FPS trên mọi điện thoại.

Trên một API process, runtime phòng và tick ở memory; PostgreSQL lưu tài khoản và kết quả trận. Redis trong Compose chưa tham gia đường gameplay. Khi chạy nhiều API instance, cần room owner/routing và session affinity hoặc WebSocket-only + skip negotiation; Redis backplane chỉ phân phối sự kiện giữa instance, **không thay thế owner game loop và không tự làm xe mượt hơn**. Xem [hướng dẫn scale SignalR của Microsoft](https://learn.microsoft.com/en-us/aspnet/core/signalr/scale?view=aspnetcore-10.0).

## Kiểm tra và giới hạn

`dotnet run --no-restore --project tests/Game.RoomProbe/Game.RoomProbe.csproj` kiểm tra phòng, loot, bo phủ bốn góc, năm phase, damage và 50 vị trí spawn. `cd client; npm run test:loot` kiểm tra hai client tranh loot và dùng item thật qua SignalR. `npm run test:rooms`, `test:match`, `test:movement`, `test:layout` kiểm tra chức năng liên quan; `test:layout` cần Edge/Chrome CDP cổng 9224. Chạy các integration test tạo tài khoản **lần lượt** để tránh auth rate limit 429 và tránh cùng chia sẻ trận `development`.

Room 50 người đã có sức chứa, spawn và luật bo, nhưng chưa có phép đo 50 kết nối trên điện thoại thật hoặc tải nhiều phòng kéo dài. Tốc độ snapshot dưới tải, nhiệt máy và độ trễ cần được đo trước khi công bố mức tải sản xuất. Kết quả trận lưu PostgreSQL; runtime phòng, túi đồ trong trận và queue ghi kết quả vẫn ở memory nên không sống qua restart process.
