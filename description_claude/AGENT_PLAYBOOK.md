# Playbook cho AI agent tiếp theo

Tài liệu này dành cho một AI agent (Claude Code hoặc tương đương) sẽ tiếp
tục sửa/thêm tính năng cho dự án này. Nó mô tả **cách thực sự làm việc**
trên repo này, không chỉ nghiệp vụ (xem 3 file kia cho nghiệp vụ/kiến
trúc).

## 1. Quy tắc bắt buộc (từ `AGENTS.md`/`CLAUDE.md` ở gốc repo — đọc file
   gốc trước, đây chỉ là tóm tắt)

- **Phạm vi**: chỉ làm đúng task được giao, không tự mở rộng, không thêm
  tính năng "tiện thể" ngoài yêu cầu.
- **Tiền**: không bao giờ dùng `float`. `Decimal` ở tầng ứng dụng, số
  nguyên `*_scaled` (×10.000, `MONEY_SCALE`) ở tầng lưu trữ. Không làm
  tròn ngầm — từ chối giá trị >4 chữ số thập phân. Xem `app/core/money.py`
  và `ARCHITECTURE.md`.
- **Database**: Alembic là nguồn xác thực schema duy nhất. Không bao giờ
  gọi `Base.metadata.create_all()`, không sửa schema SQLite thủ công,
  không xoá/reset DB thật.
- **Dữ liệu nhạy cảm**: **KHÔNG đọc/tóm tắt/copy/truyền/sửa** `data/**`,
  `.env*`, bank statement thật, file Money Lover/MISA thật, backup, hay
  credentials/API key — trừ khi task hiện tại yêu cầu rõ ràng. Test luôn
  dùng fixture tổng hợp/ẩn danh. Không bao giờ đưa dữ liệu tài chính thật
  vào prompt, log, snapshot test, commit message, hay tài liệu sinh ra.
- **Git**: không bao giờ `commit`/`push`/`reset`/`clean`/`rebase`/rewrite
  history trừ khi được yêu cầu rõ ràng. Không bao giờ stage/commit
  `data/**`, `.env*`, credentials, sao kê/import/export/backup thật.
  Không tự động commit — luôn báo cáo lại cho người dùng trước.
- **Trước khi sửa**: đọc đúng file liên quan tới task, chạy test hiện có,
  báo cáo nếu baseline đã fail sẵn (đừng tự sửa lỗi không liên quan tới
  task).
- **Khi sửa**: cách triển khai nhỏ nhất đúng yêu cầu; không thêm dependency
  không cần thiết; giữ nguyên hành vi cũ đang pass; không refactor code
  không liên quan; không làm trước các abstraction "có thể sẽ cần".
- **Trước khi coi task backend xong**: `uv run pytest -v`,
  `uv run ruff check .`, `uv run mypy app` — cả ba phải sạch.
- **Trước khi coi task frontend xong**: `npm run lint`, `npm run typecheck`
  (thêm `npm run build` và audit script liên quan nếu đổi UI có ảnh
  hưởng). Tính năng có thao tác nhiều bước qua UI (đặc biệt sửa/xoá) nên
  test bằng Playwright thật (`npm run test:e2e`) trước khi coi là xong —
  bài học từ TASK-042, xem `BUSINESS_RULES.md` §9.
- **Báo cáo cuối task**: file đã đổi, kết quả test/ruff/mypy,
  `git diff --stat`, giả định/vấn đề gặp phải.

## 2. Mô hình hai-nơi-làm-việc — quan trọng để hiểu môi trường

Dự án này được phát triển qua **hai môi trường tách biệt hoàn toàn**:

1. **Cloud workspace** (`/root/work/personal-finance` trong phiên làm
   việc trên cloud) — nơi chạy test/build/lint **không giới hạn thời
   gian**. Đây là bản mirror để agent code + verify thoải mái, KHÔNG phải
   repo git thật, KHÔNG có `data/finance.db` thật.
2. **Máy thật của người dùng** (`~/Projects/personal-finance` — chỉ truy
   cập được qua công cụ device-bridge, ví dụ `device_bash` trong công cụ
   Cowork) — đây mới là **repo git thật** và nơi `data/finance.db` thật
   tồn tại. Công cụ này bị giới hạn nghiêm ngặt: **mỗi lệnh tối đa 45
   giây, không giữ state giữa các lệnh** (mỗi lần gọi là một `bash -c`
   mới, phải `cd` lại từ đầu mỗi lần), và có `$HOME` riêng biệt với `~`
   trong ngữ cảnh đó — ví dụ phải dùng
   `cd "$HOME/mnt/Projects/personal-finance"`, không phải `cd ~/Projects/personal-finance`.

**Hệ quả bắt buộc**: bản mirror ở cloud workspace **có thể bị stale**
(lệch với máy thật) — nó chỉ được đồng bộ thủ công sau mỗi đợt sửa (xem
mục 3). **Trước khi tin nội dung một file đọc được ở cloud workspace là
đúng với thực tế, hãy xác minh bằng `git hash-object`** so sánh hash của
file đó ở cả hai nơi (đọc trên máy thật qua device-bridge, tính hash ở
cloud workspace) — đừng giả định 2 bản giống nhau chỉ vì đường dẫn giống
tên. Đây chính là lý do quy trình đồng bộ ở mục 3 luôn có bước verify
`git hash-object` ở cả hai đầu.

## 3. Quy trình đồng bộ code + commit — đã dùng thành công nhiều đợt

Quy trình này (rút ra từ `docs/qa/QA_STATE.md`, các batch đã hoàn thành)
là cách đưa thay đổi từ cloud workspace sang máy thật **và** commit đúng
vào git thật, đã kiểm chứng qua nhiều lần:

1. **Sửa + verify hoàn toàn ở cloud workspace trước** (pytest/ruff/mypy/
   lint/typecheck/build/E2E đều sạch) — không đồng bộ code chưa verify.
2. Đóng gói các file đã đổi: `tar czf <bundle>.tar.gz <file1> <file2> ...`
   (chỉ định đúng danh sách file đã đổi, không `tar cf toàn bộ repo`).
3. `SendUserFile` để đưa file tar tới người dùng.
4. `device_commit_files` để ghi file tar đó vào một vị trí trên máy thật
   (ví dụ một tên tạm ở gốc repo).
5. Giải nén **ra một thư mục tạm ngoài connected folder** (ví dụ `/tmp`,
   không phải đè trực tiếp lên gốc repo) rồi `cp` từng file đè lên đúng vị
   trí thật trong repo.
   - **Lưu ý quan trọng**: `tar -x` giải nén **trực tiếp đè lên file đã
     tồn tại** trong sandbox `device_bash` này bị lỗi
     `"Cannot open: File exists"` — nhưng `cp` đè file hoạt động bình
     thường. Luôn giải nén ra chỗ trống rồi `cp` từng file, không `tar -x`
     thẳng vào vị trí đích đã có file cũ.
6. **Verify byte-identical**: chạy `git hash-object <file>` cho từng file
   ở cả cloud workspace và máy thật, xác nhận khớp 100% — không tin
   `diff`/kích thước file, dùng hash nội dung git thật.
7. **Commit bằng git plumbing thay vì `git commit` thường** (vì venv
   Python của repo trên máy thật thường không chạy được trực tiếp trong
   sandbox Linux của `device_bash` — shebang trỏ đường dẫn tuyệt đối
   macOS):
   ```bash
   GIT_INDEX_FILE=.git/index.tmp git read-tree <parent-commit-sha>
   GIT_INDEX_FILE=.git/index.tmp git add <đúng danh sách file đã đổi>
   tree=$(GIT_INDEX_FILE=.git/index.tmp git write-tree)
   commit=$(git commit-tree "$tree" -p <parent-commit-sha> -m "...")
   git update-ref refs/heads/master "$commit"
   ```
   **Quan trọng**: `git read-tree` phải nạp từ **commit cha thật**
   (`HEAD` hiện tại), KHÔNG phải copy nguyên `.git/index` hiện có (index
   thật trên máy có thể đang ở trạng thái không khớp working tree, hoặc
   dính lock cũ) — luôn dùng một index file tạm mới tinh
   (`GIT_INDEX_FILE=.git/index.tmp`), không đụng index thật cho tới bước
   cuối.
8. Sau khi `update-ref` xong, `cp .git/index.tmp .git/index` (copy đè
   index tạm lên index thật) để `git status` đọc sạch trở lại — nếu bỏ
   qua bước này, `git status` sẽ báo working tree "khác" HEAD dù nội dung
   file thực ra đã đúng.
9. **Verify cuối**: `git diff-tree --name-only HEAD` phải đúng khớp danh
   sách file đã đổi (không hơn không kém); `git status --short` sạch;
   `git fsck --full` không báo lỗi corruption.
10. Xoá file tar tạm: nếu `device_bash` không cho phép `rm` file mới tạo
    (quirk của sandbox này, không phải quyền hệ thống), **chuyển file vào
    thư mục `_to_delete/`** có sẵn ở gốc repo thay vì cố xoá — không hỏi
    lại quyền xoá nếu người dùng đã từ chối cấp quyền trước đó.

### Quirk đã biết của sandbox `device_bash` — không phải bug thật, đừng cố "sửa"

- **`.git/*.lock` rác vô hại**: mỗi lần `git status`/`git add` chạy trong
  sandbox này, đôi khi để lại file `.git/index.lock` hoặc tương tự (vì
  sandbox không cho phép unlink file vừa tạo xong ngay lập tức). Không
  ảnh hưởng gì tới object/ref thật — **không cố xoá bằng cách reset
  repo**, chỉ cần biết đây là cosmetic.
- **`git status` đôi khi hiện trùng dòng** cho cùng một file (cả `D path`
  lẫn `?? path`) ngay sau khi commit xong qua plumbing. Đã xác minh nhiều
  lần đây là artifact vô hại của chính `git status` trong sandbox này —
  xác nhận bằng `git ls-files`, `git fsck --full`, và so khớp nội dung
  commit bằng `md5sum`/`git hash-object`, **không phải index thật bị
  hỏng**. Đừng cố "sửa" bằng cách xoá/tạo lại index thật — càng làm càng
  dễ tạo lỗi thật.
- **Chỉ dùng lệnh git đọc** (`git log`, `git show`, `git diff`, `cat`,
  `find`, `git hash-object`, `git ls-files`, `git fsck`) khi chỉ đang đọc
  mã nguồn để viết tài liệu hay khảo sát — không chạy `git status`,
  `git add`, hay bất kỳ lệnh ghi nào nếu không thực sự đang trong quy
  trình commit ở trên, để tránh tạo thêm lock file không cần thiết.

## 4. Lệnh kiểm thử & baseline mong đợi

```bash
# Backend (từ apps/api, sau khi kích hoạt venv)
uv run pytest -v        # kỳ vọng: 100% pass — số lượng test đổi theo thời gian,
                         # đợt gần nhất ghi nhận (docs/qa/QA_STATE.md, Batch #10,
                         # 2026-08-27): 314 passed. LUÔN CHẠY LẠI để lấy số
                         # thật hiện tại thay vì tin số cũ ghi ở đây hoặc ở
                         # README.md (308) — hai con số này bản thân đã lệch
                         # nhau, bằng chứng số lượng đổi thường xuyên.
uv run ruff check .      # kỳ vọng: sạch
uv run mypy app          # kỳ vọng: sạch

# Frontend (từ apps/web)
npm run lint             # eslint --max-warnings=0
npm run typecheck        # tsc --noEmit
npm run build
npm run test:e2e         # Playwright — đợt gần nhất: 48/48 PASS, chạy trên
                          # finance.test.db riêng, KHÔNG đụng data/finance.db thật
```

Quy tắc bắt buộc khi chạy backend: luôn export `PF_DATABASE_PATH` trỏ tới
một file test (ví dụ `data/finance.test.db`) **trước** khi chạy bất kỳ
lệnh nào — mặc định của `Settings.database_path` là `data/finance.db`
(DB THẬT), không có `.env` nào override sẵn. DB test được tạo bằng
`alembic upgrade head` trên file rỗng (không copy từ DB thật) rồi seed
category mặc định — không bao giờ copy dữ liệu thật sang môi trường test.

Nếu cần migrate DB thật trên máy người dùng (hiếm, rủi ro cao): venv
`.venv/bin/alembic` trên máy thật (macOS) thường **không chạy được** qua
`device_bash` (shebang tuyệt đối macOS, symlink Python gãy trong sandbox
Linux) — cách đã dùng thành công: tự viết đúng DDL mà migration đó sinh
ra và chạy qua `sqlite3` chuẩn, rồi tự cập nhật bảng `alembic_version`
khớp đúng revision, kèm kỷ luật bắt buộc: backup nguyên file trước
(`cp` + ghi lại sha256), ghi số dòng từng bảng liên quan **trước** khi
đổi, chạy ALTER, rồi verify lại: số dòng không đổi, giá trị default đúng
cho toàn bộ dòng có sẵn, `PRAGMA integrity_check` = `ok`,
`alembic_version` đúng revision mới.

## 5. Ghi chú về tài liệu — ai cập nhật `description_claude/`

Có một thư mục song song `description_gemini/` (do một agent khác viết
trước đó) — có thể lệch pha theo thời gian, và **có chứa ít nhất 1 lỗi đã
biết** (nói giá crypto đến từ "CoinMarketCap" — thực ra chính xác hơn thì
cả CoinGecko lẫn CoinMarketCap đều liên quan, mỗi cái một việc khác nhau,
xem `BUSINESS_RULES.md` §6). Đừng copy nguyên câu chữ từ đó mà không tự
kiểm chứng lại với mã nguồn thật.

Thư mục `description_claude/` (5 file này) nên được giữ cập nhật bởi
**agent Claude cụ thể** — bất kỳ khi nào một agent Claude sửa code có ảnh
hưởng tới nội dung đã ghi ở đây (thêm/xoá endpoint, đổi migration, đổi
quy tắc nghiệp vụ, đổi quy trình đồng bộ...), nên cập nhật lại phần tương
ứng trong 5 file này ở cùng đợt sửa, thay vì để tài liệu trôi dần ra khỏi
thực tế mã nguồn như đã từng xảy ra với `docs/BA-SPEC.md` (mốc `v2.00`,
đã cũ hơn code hiện tại ở vài điểm — xem các ghi chú "khác biệt với
BA-SPEC" rải rác trong `BUSINESS_RULES.md`) và `CHANGELOG.md` (mục
`v3.00` nói sai về trang Báo cáo, xem `BUSINESS_RULES.md` §3).
