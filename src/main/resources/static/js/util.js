/**
 * 1부터 9 사이의 정수 난수를 반환합니다.
 */
export function rand1to9() {
    return Math.floor(Math.random() * 9) + 1;
}

/**
 * 초 단위의 시간을 MM:SS 형식의 문자열로 변환합니다.
 * @param {number} totalSeconds 
 */
export function formatMMSS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 주어진 행(r), 열(c) 인덱스가 보드 범위 내에 있는지 확인합니다.
 * @param {number} r - 행 인덱스
 * @param {number} c - 열 인덱스
 * @param {number} rows - 전체 행 수
 * @param {number} cols - 전체 열 수
 */
export function inBounds(r, c, rows, cols) {
    return r >= 0 && r < rows && c >= 0 && c < cols;
}