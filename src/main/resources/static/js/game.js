(() => {
    // ===== 설정 =====
    const COLS = 17;
    const ROWS = 10;
    const CELL = 52;
    const PAD = 18;

    const TOTAL_TIME_SEC = 120;  // 2분
    const START_DELAY_SEC = 3;   // 시작 버튼 누르고 3초 뒤 보드 생성

    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");

    const scoreEl = document.getElementById("score");
    const sumEl = document.getElementById("sum");
    const countEl = document.getElementById("count");
    const timerEl = document.getElementById("timer");
    const statusEl = document.getElementById("status");

    const startBtn = document.getElementById("start");
    const restartBtn = document.getElementById("restart");

    canvas.width = PAD * 2 + COLS * CELL;
    canvas.height = PAD * 2 + ROWS * CELL;

    canvas.style.touchAction = "none";

    // ===== 상태 =====
    let phase = "idle";

    let board; // 0이면 빈칸
    let score = 0;

    let isDragging = false;
    let dragStart = null; // {r,c}
    let dragEnd = null;   // {r,c}

    let activePointerId = null;

    let countdownLeft = START_DELAY_SEC;
    let timeLeft = TOTAL_TIME_SEC;

    let countdownInterval = null;
    let timerInterval = null;

    // (추가) 시간 종료 시 "합 10 가능한 칸" 하이라이트 마스크
    let endedHighlightMask = null; // boolean[ROWS][COLS]

    let rafId = null;
    function requestDraw() {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            draw();
        });
    }

    // ===== 유틸 =====
    function rand1to9() {
        return 1 + Math.floor(Math.random() * 9);
    }
    function inBounds(r, c) {
        return r >= 0 && r < ROWS && c >= 0 && c < COLS;
    }
    function formatMMSS(sec) {
        const s = Math.max(0, Math.floor(sec));
        const mm = String(Math.floor(s / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${mm}:${ss}`;
    }

    // (추가) 직사각형 합/비어있지 않은 칸 개수를 O(1)로 구하기 위한 prefix ops 생성
    function buildRectPrefixOps() {
        // prefix sums: psSum / psNz (1-based)
        const psSum = Array.from({ length: ROWS + 1 }, () => Array(COLS + 1).fill(0));
        const psNz  = Array.from({ length: ROWS + 1 }, () => Array(COLS + 1).fill(0));

        for (let r = 1; r <= ROWS; r++) {
            for (let c = 1; c <= COLS; c++) {
                const v = board[r - 1][c - 1];
                psSum[r][c] = v + psSum[r - 1][c] + psSum[r][c - 1] - psSum[r - 1][c - 1];
                psNz[r][c]  = (v !== 0 ? 1 : 0) + psNz[r - 1][c] + psNz[r][c - 1] - psNz[r - 1][c - 1];
            }
        }

        function rectSum(r1, c1, r2, c2) {
            const R1 = r1 + 1, C1 = c1 + 1, R2 = r2 + 1, C2 = c2 + 1;
            return psSum[R2][C2] - psSum[R1 - 1][C2] - psSum[R2][C1 - 1] + psSum[R1 - 1][C1 - 1];
        }
        function rectNz(r1, c1, r2, c2) {
            const R1 = r1 + 1, C1 = c1 + 1, R2 = r2 + 1, C2 = c2 + 1;
            return psNz[R2][C2] - psNz[R1 - 1][C2] - psNz[R2][C1 - 1] + psNz[R1 - 1][C1 - 1];
        }

        return { rectSum, rectNz };
    }

    // (추가) "합이 10인 직사각형"들을 순회하는 공통 루프
    // - onRect({r1,r2,c1,c2})가 true를 반환하면 순회를 중단(early exit)
    function forEachRectSum10(ops, onRect) {
        for (let r1 = 0; r1 < ROWS; r1++) {
            for (let r2 = r1; r2 < ROWS; r2++) {
                for (let c1 = 0; c1 < COLS; c1++) {
                    for (let c2 = c1; c2 < COLS; c2++) {
                        const nz = ops.rectNz(r1, c1, r2, c2);
                        if (nz === 0) continue;

                        if (ops.rectSum(r1, c1, r2, c2) === 10) {
                            const stop = onRect({ r1, r2, c1, c2 });
                            if (stop === true) return true; // stopped early
                        }
                    }
                }
            }
        }
        return false; // finished normally
    }

    // (추가) 시간 종료 후: "합 10을 만들 수 있는 모든 직사각형"에 포함되는 칸 마스크 만들기
    function computeEndedHighlightMask() {
        if (!board) return null;

        const mask = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
        const ops = buildRectPrefixOps();

        forEachRectSum10(ops, ({ r1, r2, c1, c2 }) => {
            for (let r = r1; r <= r2; r++) {
                for (let c = c1; c <= c2; c++) {
                    if (board[r][c] !== 0) mask[r][c] = true;
                }
            }
        });

        return mask;
    }

    // (신규) 화면에서 "합 10"을 만들 수 있는 직사각형이 하나라도 있는지 검사
    function hasAnyRectSum10() {
        if (!board) return false;

        const ops = buildRectPrefixOps();
        const stoppedEarly = forEachRectSum10(ops, () => true); // 하나라도 찾으면 중단
        return stoppedEarly;
    }

    // (신규) "더 이상 10을 만들 수 없을 때" 보드 초기화(재생성)
    // - 점수/시간은 유지하고, 판만 새로 뽑는 방식
    function resetBoardBecauseNoMoves() {
        // 너무 운이 없으면(계속 불가능한 판) 무한루프가 될 수 있으니 제한을 둔다.
        const MAX_TRIES = 30;

        for (let i = 0; i < MAX_TRIES; i++) {

            if (hasAnyRectSum10()) {
                statusEl.textContent = "진행중 (이동 불가 판 → 자동 초기화)";
                requestDraw();
                return;
            }
        }

        // 그래도 안 나오면: 안전하게 전체 리셋(원하는 방식이면 여기만 바꾸면 됨)
        resetToIdle();
    }

    function setHUDSelection(info) {
        if (!info) {
            sumEl.textContent = "-";
            countEl.textContent = "-";
            return;
        }
        sumEl.textContent = String(info.sum);
        countEl.textContent = String(info.nonZeroCount);
    }

    function updateTopHUD() {
        scoreEl.textContent = String(score);
        timerEl.textContent = formatMMSS(timeLeft);
    }

    function clearIntervals() {
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    function setPhase(next) {
        phase = next;

        if (phase === "idle") statusEl.textContent = "대기중";
        if (phase === "countdown") statusEl.textContent = "곧 시작합니다";
        if (phase === "running") statusEl.textContent = "진행중";
        if (phase === "ended") statusEl.textContent = "시간 종료";
        if (phase === "cleared") statusEl.textContent = "클리어!";

        startBtn.disabled = !(phase === "idle" || phase === "ended" || phase === "cleared");
    }

    // ===== 좌표 변환/선택 영역 계산 =====
    function cellFromEvent(e) {
        // 캔버스가 CSS로 확대/축소될 수 있으므로
        // client 좌표를 "실제 캔버스 픽셀 좌표"로 보정한다.
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        // 보드의 (0,0)은 PAD만큼 안쪽에서 시작
        const bx = x - PAD;
        const by = y - PAD;
        if (bx < 0 || by < 0) return null;

        // 셀 인덱스 계산
        const c = Math.floor(bx / CELL);
        const r = Math.floor(by / CELL);
        if (!inBounds(r, c)) return null;

        return { r, c };
    }

    // dragStart~dragEnd를 직사각형(r1~r2, c1~c2)으로 정규화
    function rectFromDrag() {
        if (!dragStart || !dragEnd) return null;
        const r1 = Math.min(dragStart.r, dragEnd.r);
        const r2 = Math.max(dragStart.r, dragEnd.r);
        const c1 = Math.min(dragStart.c, dragEnd.c);
        const c2 = Math.max(dragStart.c, dragEnd.c);
        return { r1, r2, c1, c2 };
    }

    // 직사각형 영역의 합(sum)과 0이 아닌 칸 개수(nonZeroCount) 계산
    // - sum은 "합이 10인지" 판단에 사용
    // - nonZeroCount는 "점수 계산/빈칸만 선택한 경우 방지"에 사용
    function sumAndCountInRect(rect) {
        let sum = 0;
        let nonZeroCount = 0;
        for (let r = rect.r1; r <= rect.r2; r++) {
            for (let c = rect.c1; c <= rect.c2; c++) {
                const v = board[r][c];
                sum += v;
                if (v !== 0) nonZeroCount++;
            }
        }
        return { sum, nonZeroCount };
    }

    // ===== 렌더(Rendering) =====
    // 다크모드 여부에 따라 타일 색을 달리한다.
    // 현재 구현은 "숫자에 따른 색상 변화"는 없고, 모드에 따라 단색만 선택한다.
    function tileColor(v) {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        return isDark ? "#9aa0a6" : "#ffffff";  // 회색 / 흰색
    }

    // 둥근 사각형 그리기(보드/셀/선택 테두리 공통 사용)
    function roundRect(x, y, w, h, r, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // 상태(대기/카운트다운/종료/클리어)에서 화면 위에 안내 오버레이 출력
    function drawMessageOverlay(title, sub) {
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "rgba(255,255,255,.95)";
        ctx.font = "bold 26px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 10);

        if (sub) {
            ctx.font = "14px system-ui";
            ctx.fillStyle = "rgba(255,255,255,.85)";
            ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 18);
        }
    }

    function drawBoard() {
        // 배경(전체 캔버스 초기화 후 판 깔기)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        roundRect(0, 0, canvas.width, canvas.height, 16, "#0f1426", null);

        // 셀 렌더: 보드가 null일 수 있으므로 optional chaining으로 안전 접근
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = PAD + c * CELL;
                const y = PAD + r * CELL;

                // 셀 바닥(약한 하이라이트)
                roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 10, "rgba(255,255,255,.06)", null);

                // 보드가 아직 없으면 0처럼 처리(카운트다운 동안 숫자 숨김)
                const v = board?.[r]?.[c] ?? 0;
                if (v !== 0) {
                    // 타일 본체
                    roundRect(x + 6, y + 6, CELL - 12, CELL - 12, 12, tileColor(v), null);

                    // (추가) 시간 종료 상태에서 "합10 가능 칸" 강조 테두리/글로우
                    const highlight = (phase === "ended" && endedHighlightMask?.[r]?.[c] === true);
                    if (highlight) {
                        // 바깥쪽 글로우(살짝 두껍게)
                        ctx.save();
                        ctx.shadowColor = "rgba(120,200,255,.85)";
                        ctx.shadowBlur = 10;
                        roundRect(
                            x + 5, y + 5, CELL - 10, CELL - 10, 14,
                            null,
                            "rgba(120,200,255,.95)"
                        );
                        ctx.restore();
                    }

                    // 숫자 텍스트
                    ctx.fillStyle = "rgba(10,12,18,.88)";
                    ctx.font = "bold 20px system-ui";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(String(v), x + CELL / 2, y + CELL / 2);
                }
            }
        }

        // 선택 영역 표시(게임 진행 중에만)
        if (phase === "running") {
            const rect = rectFromDrag();
            if (rect) {
                // 매 프레임마다 합/카운트를 계산해 "성공(합=10)" 여부를 색으로 표시
                const { sum, nonZeroCount } = sumAndCountInRect(rect);
                const x = PAD + rect.c1 * CELL + 4;
                const y = PAD + rect.r1 * CELL + 4;
                const w = (rect.c2 - rect.c1 + 1) * CELL - 8;
                const h = (rect.r2 - rect.r1 + 1) * CELL - 8;

                const ok = (sum === 10 && nonZeroCount > 0);
                roundRect(
                    x, y, w, h, 14,
                    "rgba(255,255,255,.02)",
                    ok ? "rgba(120,255,170,.85)" : "rgba(255,180,120,.85)"
                );
            }
        }

        // 상태별 오버레이
        if (phase === "idle") {
            drawMessageOverlay("시작을 눌러주세요", "시작 후 3초 뒤 게임이 시작됩니다");
        } else if (phase === "countdown") {
            drawMessageOverlay(`${countdownLeft}...`, "준비!");
        } else if (phase === "ended") {
            drawMessageOverlay("시간 종료", "이제 격자를 수정할 수 없습니다");
        } else if (phase === "cleared") {
            drawMessageOverlay("클리어!", "다시 시작을 눌러 새 판을 시작하세요");
        }
    }


    function draw() {
        drawBoard();
    }

    // ===== 게임 흐름 =====
    function resetToIdle() {
        clearIntervals();

        board = null;
        score = 0;
        timeLeft = TOTAL_TIME_SEC;
        countdownLeft = START_DELAY_SEC;

        isDragging = false;
        activePointerId = null;
        dragStart = dragEnd = null;
        setHUDSelection(null);

        // (추가) 하이라이트 초기화
        endedHighlightMask = null;

        setPhase("idle");
        updateTopHUD();
        requestDraw();
    }

    function startGameWithDelay() {
        if (!(phase === "idle" || phase === "ended" || phase === "cleared")) return;

        clearIntervals();
        score = 0;
        timeLeft = TOTAL_TIME_SEC;
        countdownLeft = START_DELAY_SEC;

        board = null;
        setHUDSelection(null);

        // (추가) 새 게임 시작 시 하이라이트 초기화
        endedHighlightMask = null;

        setPhase("countdown");
        updateTopHUD();
        requestDraw();

        countdownInterval = setInterval(() => {
            countdownLeft -= 1;
            if (countdownLeft <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;

                board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, rand1to9));
                setPhase("running");
                updateTopHUD();
                requestDraw();

                // (추가) 시작하자마자 "10을 만들 수 없는 판"이면 즉시 초기화
                if (!hasAnyRectSum10()) resetBoardBecauseNoMoves();

                timerInterval = setInterval(() => {
                    if (phase !== "running") return;
                    timeLeft -= 1;
                    updateTopHUD();

                    if (timeLeft <= 0) {
                        timeLeft = 0;
                        updateTopHUD();

                        // (추가) 종료 순간에 "합10 가능 칸" 계산해 저장
                        endedHighlightMask = computeEndedHighlightMask();

                        setPhase("ended");

                        isDragging = false;
                        activePointerId = null;
                        dragStart = dragEnd = null;
                        setHUDSelection(null);

                        requestDraw();
                    }
                }, 1000);
            } else {
                requestDraw();
            }
        }, 1000);
    }

    // ===== 합이 10이면 삭제(중력/보충 없음) =====
    function tryClearSelection() {
        if (phase !== "running") return;
        const rect = rectFromDrag();
        if (!rect) return;

        const { sum, nonZeroCount } = sumAndCountInRect(rect);
        setHUDSelection({ sum, nonZeroCount });

        if (sum !== 10 || nonZeroCount === 0) return;

        for (let r = rect.r1; r <= rect.r2; r++) {
            for (let c = rect.c1; c <= rect.c2; c++) {
                if (board[r][c] !== 0) board[r][c] = 0;
            }
        }

        score += nonZeroCount;
        updateTopHUD();

        // (교체) allCleared() 대신: 더 이상 10을 만들 수 없으면 초기화
        if (!hasAnyRectSum10()) {
            isDragging = false;
            activePointerId = null;
            dragStart = dragEnd = null;
            setHUDSelection(null);

            resetBoardBecauseNoMoves();
        }
    }

    // ===== 입력(진행중일 때만) =====
    // (추가) Pointer Events로 통합: 모바일 터치/펜/마우스 모두 지원
    canvas.addEventListener("pointerdown", (e) => {
        if (phase !== "running") return;
        if (activePointerId !== null) return; // 멀티터치 방지(첫 포인터만)

        const cell = cellFromEvent(e);
        if (!cell) return;

        activePointerId = e.pointerId;
        canvas.setPointerCapture(activePointerId);

        isDragging = true;
        dragStart = { ...cell };
        dragEnd = { ...cell };

        const rect = rectFromDrag();
        if (rect) setHUDSelection(sumAndCountInRect(rect));
        requestDraw();
    });

    canvas.addEventListener("pointermove", (e) => {
        if (phase !== "running" || !isDragging) return;
        if (activePointerId !== e.pointerId) return;

        const cell = cellFromEvent(e);
        if (!cell) return;

        dragEnd = { ...cell };
        const rect = rectFromDrag();
        if (rect) setHUDSelection(sumAndCountInRect(rect));
        requestDraw();
    });

    function endPointerDrag(e) {
        if (phase !== "running" || !isDragging) return;
        if (activePointerId !== e.pointerId) return;

        isDragging = false;

        // 드래그 종료 시점에 합=10이면 삭제
        // (탭도 start=end로 들어오므로 1칸 선택 클릭과 동일하게 동작)
        tryClearSelection();

        dragStart = dragEnd = null;
        activePointerId = null;
        setHUDSelection(null);
        requestDraw();
    }

    canvas.addEventListener("pointerup", endPointerDrag);
    canvas.addEventListener("pointercancel", endPointerDrag);

    // ===== 버튼 =====
    startBtn.addEventListener("click", startGameWithDelay);
    restartBtn.addEventListener("click", resetToIdle);

    // 초기
    resetToIdle();
})();
