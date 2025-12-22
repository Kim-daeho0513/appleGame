import * as draws from './draw.js';
import * as utils from './util.js';

// 직사각형 영역 내의 숫자 합과 유효한(0이 아닌) 칸의 개수를 계산합니다.
export function sumAndCountInRect(board, rect) {
    let sum = 0;
    let nonZeroCount = 0;
    if (!rect || !board) return { sum, nonZeroCount };

    for (let r = rect.r1; r <= rect.r2; r++) {
        for (let c = rect.c1; c <= rect.c2; c++) {
            const v = board[r][c];
            sum += v;
            if (v !== 0) nonZeroCount++;
        }
    }
    return { sum, nonZeroCount };
}

// O(1) 시간 복잡도로 영역 합을 구하기 위한 Prefix Sum 객체를 생성합니다.
export function buildRectPrefixOps(board) {
    const ROWS = draws.ROWS;
    const COLS = draws.COLS;
    const psSum = Array.from({ length: ROWS + 1 }, () => Array(COLS + 1).fill(0));
    const psNz  = Array.from({ length: ROWS + 1 }, () => Array(COLS + 1).fill(0));

    for (let r = 1; r <= ROWS; r++) {
        for (let c = 1; c <= COLS; c++) {
            const v = board[r - 1][c - 1];
            psSum[r][c] = v + psSum[r - 1][c] + psSum[r][c - 1] - psSum[r - 1][c - 1];
            psNz[r][c]  = (v !== 0 ? 1 : 0) + psNz[r - 1][c] + psNz[r][c - 1] - psNz[r - 1][c - 1];
        }
    }

    return {
        rectSum: (r1, c1, r2, c2) => {
            const R1 = r1 + 1, C1 = c1 + 1, R2 = r2 + 1, C2 = c2 + 1;
            return psSum[R2][C2] - psSum[R1 - 1][C2] - psSum[R2][C1 - 1] + psSum[R1 - 1][C1 - 1];
        },
        rectNz: (r1, c1, r2, c2) => {
            const R1 = r1 + 1, C1 = c1 + 1, R2 = r2 + 1, C2 = c2 + 1;
            return psNz[R2][C2] - psNz[R1 - 1][C2] - psNz[R2][C1 - 1] + psNz[R1 - 1][C1 - 1];
        }
    };
}

// 보드 전체를 순회하며 합이 10인 직사각형이 있는지 찾고 콜백을 실행합니다.
export function forEachRectSum10(board, onRect) {
    if (!board) return false;
    const { ROWS, COLS } = draws;
    const ops = buildRectPrefixOps(board);

    for (let r1 = 0; r1 < ROWS; r1++) {
        for (let r2 = r1; r2 < ROWS; r2++) {
            for (let c1 = 0; c1 < COLS; c1++) {
                for (let c2 = c1; c2 < COLS; c2++) {
                    if (ops.rectNz(r1, c1, r2, c2) === 0) continue;
                    if (ops.rectSum(r1, c1, r2, c2) === 10) {
                        if (onRect({ r1, r2, c1, c2 }) === true) return true;
                    }
                }
            }
        }
    }
    return false;
}

// 현재 보드 상태에서 게임 진행이 가능한지 확인합니다.
export function hasAnyRectSum10(board) {
    return forEachRectSum10(board, () => true);
}

// 게임 종료 시 힌트를 보여주기 위해 합이 10이 되는 모든 칸의 마스크를 생성합니다.
export function computeEndedHighlightMask(board) {
    if (!board) return null;
    const mask = Array.from({ length: draws.ROWS }, () => Array(draws.COLS).fill(false));
    forEachRectSum10(board, ({ r1, r2, c1, c2 }) => {
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
                if (board[r][c] !== 0) mask[r][c] = true;
            }
        }
    });
    return mask;
}

// '합 10'이 최소 하나 이상 존재하는 유효한 보드를 생성합니다.
export function createValidBoard() {
    let newBoard;
    let tries = 0;
    do {
        newBoard = Array.from({ length: draws.ROWS }, () => 
            Array.from({ length: draws.COLS }, utils.rand1to9)
        );
        tries++;
    } while (!hasAnyRectSum10(newBoard) && tries < 100);
    return newBoard;
}