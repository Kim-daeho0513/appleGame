import * as utils from "./util.js";
import * as logic from "./logic.js";

export const COLS = 17;
export const ROWS = 10;
export const CELL = 52;
export const PAD = 18;

export const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const sumEl = document.getElementById("sum");
const countEl = document.getElementById("count");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
export const startBtn = document.getElementById("start");
export const restartBtn = document.getElementById("restart");
export const inputModeBtn = document.getElementById("inputModeBtn");
export const themeModeBtn = document.getElementById("themeModeBtn");

/**
 * 시스템이 다크모드인지 확인합니다.
 */
export function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function updateThemeUI(isDark) {
    const label = themeModeBtn.querySelector(".label");
    const icon = themeModeBtn.querySelector(".icon");
    if (isDark) {
        document.body.classList.add("dark-mode");
        label.textContent = "밝게";
        icon.textContent = "☀️";
    } else {
        document.body.classList.remove("dark-mode");
        label.textContent = "어둡게";
        icon.textContent = "🌙";
    }
}

export function updateInputModeUI(mode) {
    const label = inputModeBtn.querySelector(".label");
    const icon = inputModeBtn.querySelector(".icon");
    if (mode === "click") {
        label.textContent = "드래그";
        icon.textContent = "👆"; // 혹은 다른 적절한 아이콘
    } else {
        label.textContent = "클릭";
        icon.textContent = "🖱️";
    }
}

canvas.width = PAD * 2 + COLS * CELL;
canvas.height = PAD * 2 + ROWS * CELL;
canvas.style.touchAction = "none";

export function updateHUD(score, timeLeft) {
    scoreEl.textContent = String(score);
    timerEl.textContent = utils.formatMMSS(timeLeft);
}

export function setSelectionHUD(info) {
    if (!info) {
        sumEl.textContent = "-";
        countEl.textContent = "-";
        return;
    }
    sumEl.textContent = String(info.sum);
    countEl.textContent = String(info.nonZeroCount);
}

export function setPhaseUI(phase) {
    if (phase === "idle") statusEl.textContent = "대기중";
    else if (phase === "countdown") statusEl.textContent = "곧 시작합니다";
    else if (phase === "running") statusEl.textContent = "진행중";
    else if (phase === "ended") statusEl.textContent = "시간 종료";
    
    startBtn.disabled = !(phase === "idle" || phase === "ended");
}

function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

export function draw(state) {
    const { board, phase, dragRect, highlightMask, countdownLeft } = state;
    const isDark = document.body.classList.contains("dark-mode");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 테마별 색상 정의
    const colors = {
        bg: isDark ? "#1e1e1e" : "#f0f2f5",          // 전체 배경
        boardBg: isDark ? "#2d2d2d" : "#ffffff",     // 보드판(사과 밑) 배경
        apple: isDark ? "#3d3d3d" : "#ffffff",       // 사과 자체 색상
        text: isDark ? "#e0e0e0" : "#202124",        // 숫자 텍스트
        grid: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", // 격자 가이드라인
        border: isDark ? "#444444" : "#dadce0"       // 사과 테두리(필요시)
    };

    // 1. 캔버스 전체 배경
    roundRect(0, 0, canvas.width, canvas.height, 16, colors.bg, null);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = PAD + c * CELL;
            const y = PAD + r * CELL;
            
            // 2. 사과가 없는 빈 칸 배경 (격자 느낌)
            roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 10, colors.grid, null);

            const v = board?.[r]?.[c] ?? 0;
            if (v !== 0) {
                // 3. 사과 그리기 (그림자 효과 추가하여 입체감 부여)
                ctx.shadowColor = isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.1)";
                ctx.shadowBlur = 4;
                ctx.shadowOffsetY = 2;
                roundRect(x + 6, y + 6, CELL - 12, CELL - 12, 12, colors.apple, !isDark ? colors.border : null);
                ctx.shadowColor = "transparent"; // 그림자 초기화

                // 4. 종료 후 하이라이트 (힌트)
                if (phase === "ended" && highlightMask?.[r]?.[c]) {
                    ctx.save();
                    ctx.shadowColor = "rgba(120,200,255,.85)";
                    ctx.shadowBlur = 10;
                    roundRect(x + 5, y + 5, CELL - 10, CELL - 10, 14, null, "rgba(0,123,255,.8)");
                    ctx.restore();
                }

                // 5. 숫자 텍스트
                ctx.fillStyle = colors.text;
                ctx.font = "bold 22px system-ui";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(v), x + CELL / 2, y + CELL / 2);
            }
        }
    }

    if (phase === "running" && dragRect) {
        const { sum, nonZeroCount } = logic.sumAndCountInRect(board, dragRect);
        const ok = (sum === 10 && nonZeroCount > 0);
        const x = PAD + dragRect.c1 * CELL + 4;
        const y = PAD + dragRect.r1 * CELL + 4;
        const w = (dragRect.c2 - dragRect.c1 + 1) * CELL - 8;
        const h = (dragRect.r2 - dragRect.r1 + 1) * CELL - 8;
        
        // 드래그 영역 색상 (성공/진행중 대비 강화)
        const strokeColor = ok ? "#1030b5" : "#d5c429";
        roundRect(x, y, w, h, 14, "rgba(0,0,0,0.02)", strokeColor);
    }

    if (phase !== "running") {
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = "bold 28px system-ui";
        let msg = phase === "idle" ? "시작을 눌러주세요" : phase === "countdown" ? countdownLeft : "시간 종료";
        ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
    }
}

export function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width) - PAD;
    const y = (e.clientY - rect.top) * (canvas.height / rect.height) - PAD;
    const c = Math.floor(x / CELL);
    const r = Math.floor(y / CELL);
    if (utils.inBounds(r, c, ROWS, COLS)) return { r, c };
    return null;
}

export function rectFromDrag(start, end) {
    if (!start || !end) return null;
    return {
        r1: Math.min(start.r, end.r),
        r2: Math.max(start.r, end.r),
        c1: Math.min(start.c, end.c),
        c2: Math.max(start.c, end.c)
    };
}