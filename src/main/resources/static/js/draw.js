import * as utils from "./util.js";
import * as logic from "./logic.js";

export const COLS = 5;
export const ROWS = 5;
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
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    roundRect(0, 0, canvas.width, canvas.height, 16, "#0f1426", null);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = PAD + c * CELL;
            const y = PAD + r * CELL;
            roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 10, "rgba(255,255,255,.06)", null);

            const v = board?.[r]?.[c] ?? 0;
            if (v !== 0) {
                const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                roundRect(x + 6, y + 6, CELL - 12, CELL - 12, 12, isDark ? "#9aa0a6" : "#ffffff", null);

                if (phase === "ended" && highlightMask?.[r]?.[c]) {
                    ctx.save();
                    ctx.shadowColor = "rgba(120,200,255,.85)";
                    ctx.shadowBlur = 10;
                    roundRect(x + 5, y + 5, CELL - 10, CELL - 10, 14, null, "rgba(120,200,255,.95)");
                    ctx.restore();
                }

                ctx.fillStyle = "rgba(10,12,18,.88)";
                ctx.font = "bold 20px system-ui";
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
        roundRect(x, y, w, h, 14, "rgba(255,255,255,.02)", ok ? "rgba(120,255,170,.85)" : "rgba(255,180,120,.85)");
    }

    if (phase !== "running") {
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = "bold 26px system-ui";
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