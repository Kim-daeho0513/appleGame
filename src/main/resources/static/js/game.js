import * as draws from './draw.js';
import * as logic from './logic.js';

(() => {
    const leftTime = 20; // 2분
    const countTime = 3; //3초 카운트
    let board = null;
    let score = 0;
    let timeLeft = 30;
    let countdownLeft = 3;
    let phase = "idle";
    let isDragging = false;
    let dragStart = null, dragEnd = null;
    let endedHighlightMask = null;
    let timerInterval = null, countdownInterval = null;

    function requestDraw() {
        requestAnimationFrame(() => {
            const dragRect = isDragging ? draws.rectFromDrag(dragStart, dragEnd) : null;
            draws.draw({ board, phase, dragRect, highlightMask: endedHighlightMask, countdownLeft });
        });
    }

    function resetGame() {
        clearInterval(timerInterval);
        clearInterval(countdownInterval);
        score = 0; timeLeft = leftTime; phase = "idle"; board = null; endedHighlightMask = null;
        draws.updateHUD(score, timeLeft);
        draws.setPhaseUI(phase);
        requestDraw();
    }

    function startGame() {
        phase = "countdown";
        countdownLeft = countTime;  //3초 카운트 초기화

        draws.setPhaseUI(phase);
        countdownInterval = setInterval(() => {
            countdownLeft--;
            if (countdownLeft <= 0) {
                clearInterval(countdownInterval);
                board = logic.createValidBoard();
                phase = "running";
                startTimer();
            }
            requestDraw();
        }, 1000);
    }

    function startTimer() {
        timerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                phase = "ended";
                endedHighlightMask = logic.computeEndedHighlightMask(board);
                clearInterval(timerInterval);
                timeLeft = leftTime;    //2분 초기화
            }
            draws.updateHUD(score, timeLeft);
            draws.setPhaseUI(phase);
            requestDraw();
        }, 1000);
    }

    draws.canvas.addEventListener("pointerdown", (e) => {
        if (phase !== "running") return;
        dragStart = dragEnd = draws.cellFromEvent(e);
        if (dragStart) { isDragging = true; requestDraw(); }
    });

    draws.canvas.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        const cell = draws.cellFromEvent(e);
        if (cell) {
            dragEnd = cell;
            draws.setSelectionHUD(logic.sumAndCountInRect(board, draws.rectFromDrag(dragStart, dragEnd)));
            requestDraw();
        }
    });

    window.addEventListener("pointerup", () => {
        if (!isDragging) return;
        const rect = draws.rectFromDrag(dragStart, dragEnd);
        const { sum, nonZeroCount } = logic.sumAndCountInRect(board, rect);
        if (sum === 10 && nonZeroCount > 0) {
            for (let r = rect.r1; r <= rect.r2; r++) {
                for (let c = rect.c1; c <= rect.c2; c++) board[r][c] = 0;
            }
            score += nonZeroCount * 10;
            if (!logic.hasAnyRectSum10(board)) board = logic.createValidBoard();
            draws.updateHUD(score, timeLeft);
        }
        isDragging = false; dragStart = dragEnd = null;
        draws.setSelectionHUD(null);
        requestDraw();
    });

    draws.startBtn.addEventListener("click", startGame);
    draws.restartBtn.addEventListener("click", resetGame);
    resetGame();
})();