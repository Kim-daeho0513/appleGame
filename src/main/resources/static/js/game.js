import * as draws from './draw.js';
import * as logic from './logic.js';

(() => {
    const leftTime = 120; // 2분
    const countTime = 3; //3초 카운트
    let board = null;
    let score = 0;
    let timeLeft = leftTime;
    let countdownLeft = countTime;
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
    //게임 초기화(다시하기 버튼)
    function resetGame() {
        clearInterval(timerInterval); //게임시간 인터벌 초기화
        clearInterval(countdownInterval); // 카운트 다운 인터벌 초기화
        score = 0; //  점수 초기화
        timeLeft = leftTime; // 게임시간 초기화
        phase = "idle"; // 대기 상태
        board = null; // 점수 계산용 보드 초기화
        endedHighlightMask = null; // 끝나고 하이라이트 나오는 부분 초기화
        draws.updateHUD(score, timeLeft);
        draws.setPhaseUI(phase);
        requestDraw();
    }
    // 게임시작 (시작 버튼)
    function startGame() {
        phase = "countdown"; // 카운트 다운 상태
        countdownLeft = countTime;  //3초 카운트 초기화

        draws.setPhaseUI(phase);
        countdownInterval = setInterval(() => {
            countdownLeft--;
            if (countdownLeft <= 0) {
                clearInterval(countdownInterval);
                board = logic.createValidBoard();
                phase = "running"; // 게임 시작
                startTimer();
            }
            requestDraw();
        }, 1000);
    }
    // 게임 시작 버트
    function startTimer() {
        timerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                phase = "ended";    // 게임 종료 단계
                endedHighlightMask = logic.computeEndedHighlightMask(board);
                clearInterval(timerInterval);
                timeLeft = leftTime;    //2분 초기화
            }
            draws.updateHUD(score, timeLeft);
            draws.setPhaseUI(phase);
            requestDraw();
        }, 1000);
    }
    // 클릭 누르고 있을 때 이벤트
    draws.canvas.addEventListener("pointerdown", (e) => {
        if (phase !== "running") return;
        dragStart = dragEnd = draws.cellFromEvent(e);
        if (dragStart) { isDragging = true; requestDraw(); }
    });
    // 마우스 이동 이벤트
    draws.canvas.addEventListener("pointermove", (e) => {
        //
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