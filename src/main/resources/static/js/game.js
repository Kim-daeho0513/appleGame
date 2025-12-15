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

    // ===== 상태 =====
    // phase: idle(대기) -> countdown(3초) -> running(진행) -> ended(시간종료) / cleared(클리어)
    let phase = "idle";

    let board; // 0이면 빈칸
    let score = 0;

    let isDragging = false;
    let dragStart = null; // {r,c}
    let dragEnd = null;   // {r,c}

    let countdownLeft = START_DELAY_SEC;
    let timeLeft = TOTAL_TIME_SEC;

    let countdownInterval = null;
    let timerInterval = null;

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
    function allCleared() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (board[r][c] !== 0) return false;
            }
        }
        return true;
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

    // ===== 좌표/선택 =====
    function cellFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const bx = x - PAD;
        const by = y - PAD;
        if (bx < 0 || by < 0) return null;

        const c = Math.floor(bx / CELL);
        const r = Math.floor(by / CELL);
        if (!inBounds(r, c)) return null;

        return { r, c };
    }

    function rectFromDrag() {
        if (!dragStart || !dragEnd) return null;
        const r1 = Math.min(dragStart.r, dragEnd.r);
        const r2 = Math.max(dragStart.r, dragEnd.r);
        const c1 = Math.min(dragStart.c, dragEnd.c);
        const c2 = Math.max(dragStart.c, dragEnd.c);
        return { r1, r2, c1, c2 };
    }

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

    // ===== 렌더 =====
    function tileColor(v) {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        return isDark ? "#9aa0a6" : "#ffffff";  // 회색 / 흰색
    }

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
        // 배경
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        roundRect(0, 0, canvas.width, canvas.height, 16, "#0f1426", null);

        // 셀
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = PAD + c * CELL;
                const y = PAD + r * CELL;

                roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 10, "rgba(255,255,255,.06)", null);

                const v = board?.[r]?.[c] ?? 0;
                if (v !== 0) {
                    roundRect(x + 6, y + 6, CELL - 12, CELL - 12, 12, tileColor(v), null);

                    ctx.fillStyle = "rgba(10,12,18,.88)";
                    ctx.font = "bold 20px system-ui";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(String(v), x + CELL / 2, y + CELL / 2);
                }
            }
        }

        // 선택 영역(진행중일 때만)
        if (phase === "running") {
            const rect = rectFromDrag();
            if (rect) {
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

        board = null; // 아직 보드 안 보여주기
        score = 0;
        timeLeft = TOTAL_TIME_SEC;
        countdownLeft = START_DELAY_SEC;

        isDragging = false;
        dragStart = dragEnd = null;
        setHUDSelection(null);

        setPhase("idle");
        updateTopHUD();
        draw();
    }

    function startGameWithDelay() {
        if (!(phase === "idle" || phase === "ended" || phase === "cleared")) return;

        clearIntervals();
        score = 0;
        timeLeft = TOTAL_TIME_SEC;
        countdownLeft = START_DELAY_SEC;

        board = null; // 3초 동안은 보드 안 보이게
        setHUDSelection(null);

        setPhase("countdown");
        updateTopHUD();
        draw();

        countdownInterval = setInterval(() => {
            countdownLeft -= 1;
            if (countdownLeft <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;

                // 3초 후 보드 생성
                board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, rand1to9));
                setPhase("running");
                updateTopHUD();
                draw();

                // 타이머 시작
                timerInterval = setInterval(() => {
                    if (phase !== "running") return;
                    timeLeft -= 1;
                    updateTopHUD();

                    if (timeLeft <= 0) {
                        timeLeft = 0;
                        updateTopHUD();
                        setPhase("ended");

                        // 조작 잠금: running이 아니면 입력 핸들러들이 동작 안 함
                        isDragging = false;
                        dragStart = dragEnd = null;
                        setHUDSelection(null);

                        draw();
                    }
                }, 1000);
            } else {
                draw();
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

        score += nonZeroCount * 10;
        updateTopHUD();

        if (allCleared()) {
            setPhase("cleared");
            clearIntervals();
            isDragging = false;
            dragStart = dragEnd = null;
            setHUDSelection(null);
        }
    }

    // ===== 입력(진행중일 때만) =====
    canvas.addEventListener("mousedown", (e) => {
        if (phase !== "running") return;
        const cell = cellFromEvent(e);
        if (!cell) return;

        isDragging = true;
        dragStart = { ...cell };
        dragEnd = { ...cell };

        const rect = rectFromDrag();
        if (rect) setHUDSelection(sumAndCountInRect(rect));
        draw();
    });

    canvas.addEventListener("mousemove", (e) => {
        if (phase !== "running" || !isDragging) return;
        const cell = cellFromEvent(e);
        if (!cell) return;

        dragEnd = { ...cell };
        const rect = rectFromDrag();
        if (rect) setHUDSelection(sumAndCountInRect(rect));
        draw();
    });

    window.addEventListener("mouseup", () => {
        if (phase !== "running" || !isDragging) return;
        isDragging = false;

        tryClearSelection();

        dragStart = dragEnd = null;
        setHUDSelection(null);
        draw();
    });

    canvas.addEventListener("click", (e) => {
        if (phase !== "running") return;
        const cell = cellFromEvent(e);
        if (!cell) return;

        dragStart = { ...cell };
        dragEnd = { ...cell };
        tryClearSelection();
        dragStart = dragEnd = null;
        setHUDSelection(null);
        draw();
    });

    // ===== 버튼 =====
    startBtn.addEventListener("click", startGameWithDelay);
    restartBtn.addEventListener("click", resetToIdle);

    // 초기
    resetToIdle();
})();
