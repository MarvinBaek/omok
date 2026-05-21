// ===== 오목 룰 (순수 로직, UI 무관) =====
// 외부에서 OmokRules.checkWin(board, x, y, color) 형태로 호출
const OmokRules = (function() {
  const SIZE = 15;

  // 방향에서 같은 색 연속 개수
  function countInDir(board, x, y, dx, dy, color) {
    let count = 0;
    for (let i = 1; i < 6; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[nx][ny] !== color) break;
      count++;
    }
    return count;
  }

  // 승리 시 5목 좌표 배열 반환, 없으면 null
  function checkWinWithLine(board, x, y, color, renjuRule) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx, dy] of dirs) {
      const forward = countInDir(board, x, y, dx, dy, color);
      const backward = countInDir(board, x, y, -dx, -dy, color);
      const c = 1 + forward + backward;
      const wins = (renjuRule && color === 1) ? (c === 5) : (c >= 5);
      if (wins) {
        const line = [];
        for (let i = -backward; i <= forward; i++) {
          line.push([x + dx * i, y + dy * i]);
        }
        return line;
      }
    }
    return null;
  }

  function checkWin(board, x, y, color, renjuRule) {
    return !!checkWinWithLine(board, x, y, color, renjuRule);
  }

  // 6목 이상 (장목)
  function checkOverline(board, x, y, color) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx, dy] of dirs) {
      const c = 1 + countInDir(board, x, y, dx, dy, color) + countInDir(board, x, y, -dx, -dy, color);
      if (c >= 6) return true;
    }
    return false;
  }

  // 정확히 5목
  function checkExactFive(board, x, y, color) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx, dy] of dirs) {
      const c = 1 + countInDir(board, x, y, dx, dy, color) + countInDir(board, x, y, -dx, -dy, color);
      if (c === 5) return true;
    }
    return false;
  }

  // 한 방향에서 라인 추출 (-5..+5 범위)
  function getLine(board, x, y, dx, dy, color) {
    const arr = [];
    for (let i = -5; i <= 5; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) arr.push(-1);
      else if (i === 0) arr.push(color);
      else arr.push(board[nx][ny]);
    }
    return arr;
  }

  // 열린 3 개수
  function countOpenThree(board, x, y, color) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    let total = 0;
    for (const [dx, dy] of dirs) {
      const line = getLine(board, x, y, dx, dy, color);
      for (let start = 1; start <= 6; start++) {
        const w = line.slice(start, start + 5);
        if (w.length < 5) break;
        const cc = w.filter(v => v === color).length;
        const ee = w.filter(v => v === 0).length;
        if (cc === 3 && ee === 2 && w[0] === 0 && w[4] === 0) {
          if (start <= 5 && start + 5 > 5) { total++; break; }
        }
      }
    }
    return total;
  }

  // 4 개수 (열린/막힌 모두)
  function countFours(board, x, y, color) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    let total = 0;
    for (const [dx, dy] of dirs) {
      const line = getLine(board, x, y, dx, dy, color);
      let found = false;
      for (let start = 1; start <= 6; start++) {
        const w = line.slice(start, start + 5);
        if (w.length < 5) break;
        const cc = w.filter(v => v === color).length;
        const ee = w.filter(v => v === 0).length;
        if (cc === 4 && ee === 1) {
          if (start <= 5 && start + 5 > 5) { found = true; break; }
        }
      }
      if (found) total++;
    }
    return total;
  }

  // 흑돌 금수 판정 (3-3, 4-4, 장목)
  function isForbidden(board, x, y) {
    if (board[x][y] !== 0) return false;
    board[x][y] = 1; // 가상 착수
    let forbidden = false;
    if (checkExactFive(board, x, y, 1)) {
      forbidden = false; // 5목 완성이면 금수 아님
    } else if (checkOverline(board, x, y, 1)) {
      forbidden = true; // 장목
    } else {
      const threes = countOpenThree(board, x, y, 1);
      const fours = countFours(board, x, y, 1);
      if (threes >= 2 || fours >= 2) forbidden = true;
    }
    board[x][y] = 0; // 원복
    return forbidden;
  }

  // 보드 전체에서 금수 위치 계산
  function computeForbidden(board, renjuRule, turn, gameOver) {
    const spots = [];
    if (!renjuRule || turn !== 1 || gameOver) return spots;
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        if (board[x][y] === 0 && isForbidden(board, x, y)) {
          spots.push(x + ',' + y);
        }
      }
    }
    return spots;
  }

  // 빈 보드 생성
  function createBoard() {
    return Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
  }

  // 보드 직렬화 (Firebase 저장용)
  function serialize(board) {
    return board.map(row => row.join('')).join('|');
  }
  function deserialize(s) {
    if (!s) return createBoard();
    return s.split('|').map(row => row.split('').map(Number));
  }

  return {
    SIZE,
    checkWin,
    checkWinWithLine,
    isForbidden,
    computeForbidden,
    createBoard,
    serialize,
    deserialize
  };
})();
