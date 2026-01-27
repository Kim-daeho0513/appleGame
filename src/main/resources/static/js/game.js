import * as draws from "./draw.js";
import * as logics from "./logic.js";

// --- 전역 상태 변수 ---
let isDarkMode = draws.getSystemTheme();
let inputMode = "drag"; // "drag" 또는 "click"





window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    isDarkMode = e.matches;
    draws.updateThemeUI(isDarkMode);
});

draws.inputModeBtn.addEventListener("click", () => {
    inputMode = (inputMode === "drag") ? "click" : "drag";
    draws.updateInputModeUI(inputMode);
    // 모드 변경 시 현재 선택 중인 영역 초기화는 IIFE 내부 함수 호출을 통해 처리 (아래 참조)
});

// --- 게임 메인 로직 (IIFE) ---
(() => {
    const leftTime = 120; // 2분
    const countTime = 3;  // 3초 카운트다운
    
    let board = null;
    let score = 0;
    let timeLeft = leftTime;
    let countdownLeft = countTime;
    let phase = "idle";
    
    // 조작 관련 변수
    let isDragging = false;
    let dragStart = null; 
    let dragEnd = null;
    let firstClick = null; // 클릭 모드용
    
    let endedHighlightMask = null;
    let timerInterval = null;
    let countdownInterval = null;

    // 외부 모드 변경 버튼에서 호출할 수 있도록 함수 등록 또는 공유
    draws.inputModeBtn.addEventListener("click", resetSelection);

    function requestDraw() {
        requestAnimationFrame(() => {
            let displayRect = null;
            if (inputMode === "drag" && isDragging) {
                displayRect = draws.rectFromDrag(dragStart, dragEnd);
            } else if (inputMode === "click" && firstClick) {
                // 클릭 모드에서는 첫 클릭 지점부터 현재 마우스 위치(dragEnd)까지를 미리보기로 보여줌
                displayRect = draws.rectFromDrag(firstClick, dragEnd || firstClick);
            }
            
            draws.draw({ 
                board, 
                phase, 
                dragRect: displayRect, 
                highlightMask: endedHighlightMask, 
                countdownLeft 
            });
        });
    }

    function resetSelection() {
        isDragging = false;
        dragStart = null;
        dragEnd = null;
        firstClick = null;
        requestDraw();
    }

    function resetGame() {
        clearInterval(timerInterval);
        clearInterval(countdownInterval);
        score = 0;
        countdownLeft = countTime;
        timeLeft = leftTime;
        phase = "idle";
        board = null;
        endedHighlightMask = null;
        resetSelection();
        draws.updateHUD(score, timeLeft);
        draws.setPhaseUI(phase);
        requestDraw();
    }

    function startGame() {
        if (phase === "running" || phase === "countdown") return;
        resetGame()
        resetSelection();
        phase = "countdown";
        draws.updateHUD(score, timeLeft);
        draws.setPhaseUI(phase);
        requestDraw();

        countdownInterval = setInterval(() => {
            countdownLeft--;
            if (countdownLeft <= 0) {
                clearInterval(countdownInterval);
                board = logics.createValidBoard();
                phase = "running";
                startTimer();
                requestDraw();
                return;
            }
            requestDraw();
        }, 1000);
    }

    function startTimer() {
        timerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                phase = "ended";
                endedHighlightMask = logics.computeEndedHighlightMask(board);
                clearInterval(timerInterval);
            }
            draws.updateHUD(score, timeLeft);
            draws.setPhaseUI(phase);
            requestDraw();
        }, 1000);
    }

    function processSelection(rect) {
        if (!rect || !board) return;
        const { sum, nonZeroCount } = logics.sumAndCountInRect(board, rect);
        if (sum === 10 && nonZeroCount > 0) {
            for (let r = rect.r1; r <= rect.r2; r++) {
                for (let c = rect.c1; c <= rect.c2; c++) {
                    board[r][c] = 0;
                }
            }
            score += nonZeroCount;
            // 맵에 더 이상 합 10이 없으면 보드 재생성
            if (!logics.hasAnyRectSum10(board)) {
                board = logics.createValidBoard();
            }
            draws.updateHUD(score, timeLeft);
        }
    }

    // --- 마우스/터치 이벤트 핸들러 ---
    draws.canvas.addEventListener("pointerdown", (e) => {
        if (phase !== "running") return;
        const cell = draws.cellFromEvent(e);
        
        if (inputMode === "drag") {
            if (cell) {
                dragStart = dragEnd = cell;
                isDragging = true;
                requestDraw();
            }
        } else {
            // 클릭 모드: 캔버스 내부 클릭 처리
            if (!cell) {
                resetSelection(); // 캔버스 내 빈 공간(PAD 영역 등) 클릭 시 초기화
            } else if (!firstClick) {
                firstClick = dragEnd = cell; // 첫 번째 칸 선택
                requestDraw();
            } else {
                // 두 번째 칸 선택 -> 처리
                const rect = draws.rectFromDrag(firstClick, cell);
                processSelection(rect);
                resetSelection();
            }
        }
    });

    // [중요] 캔버스 외부 클릭 감지를 위한 window 리스너
    window.addEventListener("pointerdown", (e) => {
        // 클릭 모드이고 첫 번째 선택이 있는 상태에서, 클릭한 대상이 캔버스가 아닐 때만 초기화
        if (inputMode === "click" && firstClick && e.target !== draws.canvas) {
            resetSelection();
        }
    });

    draws.canvas.addEventListener("pointermove", (e) => {
        if (phase !== "running") return;
        const cell = draws.cellFromEvent(e);

        if (inputMode === "drag" && isDragging) {
            if (cell) {
                dragEnd = cell;
                requestDraw();
            }
        } else if (inputMode === "click" && firstClick) {
            dragEnd = cell; // 가이드라인용 마우스 위치 업데이트
            requestDraw();
        }
    });

    window.addEventListener("pointerup", () => {
        if (inputMode === "drag" && isDragging) {
            const rect = draws.rectFromDrag(dragStart, dragEnd);
            processSelection(rect);
            resetSelection();
        }
    });
    // --- UI 초기 설정 ---
    function init() {
        draws.updateThemeUI(isDarkMode);
        draws.updateInputModeUI(inputMode);
        requestDraw();
    }
    // --- 테마 및 모드 토글 이벤트 ---
    draws.themeModeBtn.addEventListener("click", () => {
        isDarkMode = !isDarkMode;
        draws.updateThemeUI(isDarkMode);
        requestDraw(); // 초기 화면 렌더링
    });

    // 버튼 연결
    draws.startBtn.addEventListener("click", startGame);
    draws.restartBtn.addEventListener("click", resetGame);

    init();
})();