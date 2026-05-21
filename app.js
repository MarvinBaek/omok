// ===== 게임 상수 =====
const SIZE = OmokRules.SIZE;
const CELL = 600 / (SIZE + 1);
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

// ===== 상태 =====
let roomId = null;
let isHost = false;
let myViewerId = 'v_' + Math.random().toString(36).slice(2, 8);
let roomRef = null;
let board = OmokRules.createBoard();
let turn = 1;
let gameOver = false;
let votes = {};
let voteTime = 20;
let renjuRule = false;
let voteDeadline = null;
let localTimer = null;
let forbiddenSpots = [];
let presenceRef = null;
let viewerCount = 0;
let winLine = [];
let scoreHost = 0;
let scoreViewer = 0;

// ===== Firebase 연결 확인 =====
db.ref('.info/connected').on('value', (snap) => {
  const connected = snap.val();
  const lobbyStatus = document.getElementById('lobby-status');
  if (connected) {
    lobbyStatus.textContent = '✅ Firebase 연결됨 — 방을 만들거나 입장하세요';
    document.getElementById('btn-host').disabled = false;
    document.getElementById('btn-join-toggle').disabled = false;
  } else {
    lobbyStatus.textContent = '⏳ Firebase 연결 중...';
  }
});

// ===== 비밀번호 검증 =====
let pwdAttempts = 0;
let pwdLockedUntil = 0;

async function tryCreateRoom() {
  if (Date.now() < pwdLockedUntil) {
    const left = Math.ceil((pwdLockedUntil - Date.now()) / 1000);
    document.getElementById('pwd-error').textContent = `잠금됨. ${left}초 후 다시 시도하세요.`;
    return;
  }
  const pwd = document.getElementById('pwd-input').value;
  if (!pwd) {
    document.getElementById('pwd-error').textContent = '비밀번호를 입력하세요';
    return;
  }
  const hash = await sha256(pwd + PWD_SALT);
  if (hash !== HOST_PWD_HASH) {
    pwdAttempts++;
    if (pwdAttempts >= 5) {
      pwdLockedUntil = Date.now() + 60000;
      pwdAttempts = 0;
      document.getElementById('pwd-error').textContent = '5회 실패. 1분간 잠금됩니다.';
    } else {
      document.getElementById('pwd-error').textContent = `비밀번호가 틀렸습니다 (${pwdAttempts}/5)`;
    }
    document.getElementById('pwd-input').value = '';
    return;
  }
  pwdAttempts = 0;
  document.getElementById('pwd-error').textContent = '';
  createRoom(hash);
}

// ===== UI 핸들러 =====
document.getElementById('btn-host').addEventListener('click', () => {
  document.getElementById('host-pwd-area').classList.remove('hidden');
  document.getElementById('join-area').classList.add('hidden');
  document.getElementById('pwd-input').focus();
});
document.getElementById('btn-pwd-cancel').addEventListener('click', () => {
  document.getElementById('host-pwd-area').classList.add('hidden');
  document.getElementById('pwd-input').value = '';
  document.getElementById('pwd-error').textContent = '';
});
document.getElementById('btn-pwd-submit').addEventListener('click', tryCreateRoom);
document.getElementById('pwd-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryCreateRoom();
});
document.getElementById('btn-join-toggle').addEventListener('click', () => {
  document.getElementById('join-area').classList.toggle('hidden');
  document.getElementById('host-pwd-area').classList.add('hidden');
});
document.getElementById('btn-join').addEventListener('click', () => {
  const id = document.getElementById('room-input').value.trim().toLowerCase();
  if (id) joinRoom(id);
});
document.getElementById('room-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const id = document.getElementById('room-input').value.trim().toLowerCase();
    if (id) joinRoom(id);
  }
});
document.getElementById('btn-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(roomId);
  const b = document.getElementById('btn-copy');
  b.textContent = '복사됨!';
  setTimeout(() => b.textContent = 'ID 복사', 1500);
});
document.getElementById('btn-copy-link').addEventListener('click', () => {
  const link = window.location.origin + window.location.pathname + '?room=' + roomId;
  navigator.clipboard.writeText(link);
  const b = document.getElementById('btn-copy-link');
  b.textContent = '복사됨!';
  setTimeout(() => b.textContent = '링크 복사', 1500);
});
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!isHost) return;
  resetGame();
});
document.getElementById('time-slider').addEventListener('input', (e) => {
  voteTime = parseInt(e.target.value);
  document.getElementById('time-val').textContent = voteTime + '초';
  if (isHost) roomRef.child('meta/voteTime').set(voteTime);
});
document.getElementById('rule-toggle').addEventListener('change', (e) => {
  renjuRule = e.target.checked;
  if (isHost) roomRef.child('meta/renju').set(renjuRule);
  forbiddenSpots = OmokRules.computeForbidden(board, renjuRule, turn, gameOver);
  drawBoard();
});

// URL에서 방 ID 자동 인식
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) {
  setTimeout(() => {
    if (!roomId) {
      document.getElementById('room-input').value = urlRoom;
      document.getElementById('join-area').classList.remove('hidden');
    }
  }, 500);
}

// 호스트가 탭 닫으려 할 때 경고
window.addEventListener('beforeunload', (e) => {
  if (isHost && roomRef) {
    e.preventDefault();
    e.returnValue = '방이 삭제됩니다. 정말 나가시겠습니까?';
    return e.returnValue;
  }
});

// ===== 방 생성 =====
function createRoom(authHash) {
  roomId = Math.random().toString(36).slice(2, 8);
  isHost = true;
  roomRef = db.ref('rooms/' + roomId);
  console.log('[방 만들기] 시도 - 방 ID:', roomId);
  roomRef.set({
    auth: authHash,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    board: OmokRules.serialize(board),
    turn: 1,
    votes: {},
    meta: {
      voteTime: voteTime,
      renju: renjuRule,
      gameOver: false,
      voteDeadline: 0,
      winner: 0,
      winLine: '[]',
      scoreHost: 0,
      scoreViewer: 0
    }
  }).then(() => {
    console.log('[방 만들기] 성공!');
    enterGame();
  }).catch(err => {
    console.error('[방 만들기] 실패:', err);
    alert('❌ 방 생성 실패\n\n사유: ' + err.message + '\n\nFirebase 콘솔에서 Realtime Database → 규칙을 확인하세요.');
  });
}

// ===== 방 입장 =====
function joinRoom(id) {
  roomId = id;
  isHost = false;
  roomRef = db.ref('rooms/' + roomId);
  roomRef.once('value').then(snap => {
    if (!snap.exists()) {
      alert('해당 방이 존재하지 않습니다: ' + id);
      return;
    }
    enterGame();
  });
}

// ===== 게임 화면 진입 =====
function enterGame() {
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game-area').classList.remove('hidden');
  document.getElementById('role-label').textContent = isHost ? '👑 호스트 (흑돌)' : '👥 시청자 (백돌 투표)';

  if (isHost) {
    document.getElementById('room-id-display').classList.remove('hidden');
    document.getElementById('my-room-id').textContent = roomId;
    const link = window.location.origin + window.location.pathname + '?room=' + roomId;
    document.getElementById('share-link').textContent = link;
    roomRef.onDisconnect().remove();
    console.log('[자동삭제] 호스트 연결 끊기면 방 삭제됨');
  } else {
    document.getElementById('settings-panel').classList.add('hidden');
  }

  roomRef.on('value', onRoomUpdate);

  presenceRef = roomRef.child('presence/' + myViewerId);
  presenceRef.set(true);
  presenceRef.onDisconnect().remove();
  roomRef.child('presence').on('value', (snap) => {
    viewerCount = snap.numChildren();
    document.getElementById('viewer-count').textContent = viewerCount;
  });

  drawBoard();
}

// ===== Firebase 상태 변경 수신 =====
function onRoomUpdate(snap) {
  const data = snap.val();
  if (!data) {
    if (!isHost && roomRef) {
      stopLocalTimer();
      alert('🚪 호스트가 방을 떠났습니다. 방이 종료되었습니다.');
      window.location.href = window.location.origin + window.location.pathname;
    }
    return;
  }
  const wasGameOver = gameOver;
  board = OmokRules.deserialize(data.board);
  turn = data.turn || 1;
  votes = data.votes || {};
  const meta = data.meta || {};
  gameOver = !!meta.gameOver;
  voteTime = meta.voteTime || 20;
  renjuRule = !!meta.renju;
  voteDeadline = meta.voteDeadline || 0;
  winLine = meta.winLine ? JSON.parse(meta.winLine) : [];
  scoreHost = meta.scoreHost || 0;
  scoreViewer = meta.scoreViewer || 0;

  document.getElementById('score-host').textContent = scoreHost;
  document.getElementById('score-viewer').textContent = scoreViewer;

  if (isHost) {
    document.getElementById('time-slider').value = voteTime;
    document.getElementById('time-val').textContent = voteTime + '초';
    document.getElementById('rule-toggle').checked = renjuRule;
  }

  forbiddenSpots = OmokRules.computeForbidden(board, renjuRule, turn, gameOver);
  updateStatus();
  drawBoard();

  if (turn === 2 && !gameOver && voteDeadline > 0) {
    startLocalTimer();
  } else {
    stopLocalTimer();
  }

  if (gameOver && meta.winner && !wasGameOver) {
    showWinModal(meta.winner);
  }
  if (!gameOver && wasGameOver) {
    hideWinModal();
  }

  if (gameOver && meta.winner) {
    document.getElementById('status').textContent =
      (meta.winner === 1 ? '👑 호스트 승리!' : '👥 시청자 승리!');
  }
}

// ===== 캔버스 클릭/터치 =====
function handleBoardClick(e) {
  if (gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const scale = 600 / rect.width;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const px = (clientX - rect.left) * scale;
  const py = (clientY - rect.top) * scale;
  const x = Math.round(px / CELL) - 1;
  const y = Math.round(py / CELL) - 1;
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  if (board[x][y] !== 0) return;

  if (isHost) {
    if (turn !== 1) return;
    if (renjuRule && OmokRules.isForbidden(board, x, y)) {
      document.getElementById('result-msg').textContent = '⛔ 금수 자리입니다';
      return;
    }
    hostPlaceStone(x, y, 1);
  } else {
    if (turn !== 2) return;
    roomRef.child('votes/' + myViewerId).set(x + ',' + y);
    document.getElementById('my-vote-info').textContent = '내 투표: (' + x + ',' + y + ')';
  }
}
canvas.addEventListener('click', handleBoardClick);
// 모바일 터치 지원
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleBoardClick(e);
}, { passive: false });

// ===== 호스트: 돌 두기 =====
function hostPlaceStone(x, y, color) {
  board[x][y] = color;
  const winInfo = OmokRules.checkWinWithLine(board, x, y, color, renjuRule);
  const updates = {
    board: OmokRules.serialize(board),
    turn: color === 1 ? 2 : 1,
    votes: {}
  };
  if (winInfo) {
    updates['meta/gameOver'] = true;
    updates['meta/winner'] = color;
    updates['meta/winLine'] = JSON.stringify(winInfo);
    if (color === 1) updates['meta/scoreHost'] = scoreHost + 1;
    else updates['meta/scoreViewer'] = scoreViewer + 1;
  } else if (updates.turn === 2) {
    updates['meta/voteDeadline'] = Date.now() + voteTime * 1000;
  }
  roomRef.update(updates);
}

// ===== 호스트: 투표 결과 처리 =====
function resolveVote() {
  if (!isHost || turn !== 2 || gameOver) return;
  roomRef.child('votes').once('value').then(snap => {
    const v = snap.val() || {};
    const counts = {};
    Object.values(v).forEach(pos => {
      counts[pos] = (counts[pos] || 0) + 1;
    });
    const entries = Object.entries(counts);
    if (entries.length === 0) {
      roomRef.update({
        turn: 1,
        votes: {},
        'meta/voteDeadline': 0
      });
      document.getElementById('result-msg').textContent = '투표 없음 — 호스트 차례로 넘어갑니다';
      return;
    }
    const max = Math.max(...entries.map(e => e[1]));
    const winners = entries.filter(e => e[1] === max);
    const winner = winners[Math.floor(Math.random() * winners.length)];
    const [x, y] = winner[0].split(',').map(Number);
    document.getElementById('result-msg').textContent =
      `(${x},${y})에 ${max}표 — 백돌 착수${winners.length > 1 ? ` (동률 ${winners.length}개 중 랜덤)` : ''}`;
    hostPlaceStone(x, y, 2);
  });
}

// ===== 로컬 타이머 =====
function startLocalTimer() {
  stopLocalTimer();
  localTimer = setInterval(() => {
    const left = Math.max(0, Math.ceil((voteDeadline - Date.now()) / 1000));
    document.getElementById('status').textContent = '👥 시청자 투표 중 — ' + left + '초';
    if (left <= 0) {
      stopLocalTimer();
      if (isHost) resolveVote();
    }
  }, 200);
}
function stopLocalTimer() {
  if (localTimer) { clearInterval(localTimer); localTimer = null; }
}

// ===== 새 게임 =====
function resetGame() {
  board = OmokRules.createBoard();
  roomRef.update({
    board: OmokRules.serialize(board),
    turn: 1,
    votes: {},
    'meta/gameOver': false,
    'meta/winner': 0,
    'meta/voteDeadline': 0,
    'meta/winLine': '[]'
  });
  document.getElementById('result-msg').textContent = '🎮 새 게임 시작!';
  hideWinModal();
}

// ===== 승리 모달 =====
function showWinModal(winner) {
  const modal = document.getElementById('win-modal');
  const trophy = document.getElementById('modal-trophy');
  const title = document.getElementById('modal-title');
  const subtitle = document.getElementById('modal-subtitle');
  const stats = document.getElementById('modal-stats');

  if (winner === 1) {
    trophy.textContent = '👑';
    title.textContent = '호스트 승리!';
    subtitle.textContent = '흑돌이 5목을 완성했습니다';
  } else {
    trophy.textContent = '🎉';
    title.textContent = '시청자 승리!';
    subtitle.textContent = '집단지성으로 5목 완성!';
  }
  stats.innerHTML = `이번 시즌 전적<br><span style="font-size:18px; color:#ffd54f;">👑 호스트 ${scoreHost}승 — 시청자 ${scoreViewer}승 👥</span>`;

  document.getElementById('modal-buttons-host').style.display = isHost ? 'flex' : 'none';
  document.getElementById('modal-buttons-viewer').style.display = isHost ? 'none' : 'flex';

  modal.classList.remove('hidden');
  fireConfetti();
}
function hideWinModal() {
  document.getElementById('win-modal').classList.add('hidden');
}
function fireConfetti() {
  const colors = ['#ffd54f', '#ff6347', '#4caf50', '#2196f3', '#e91e63', '#ff9800'];
  for (let i = 0; i < 80; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDuration = (2 + Math.random() * 2) + 's';
      c.style.width = (6 + Math.random() * 8) + 'px';
      c.style.height = c.style.width;
      c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }, i * 30);
  }
}
document.getElementById('btn-modal-close').addEventListener('click', hideWinModal);
document.getElementById('btn-modal-close-v').addEventListener('click', hideWinModal);
document.getElementById('btn-modal-newgame').addEventListener('click', () => {
  hideWinModal();
  resetGame();
});

// ===== 그리기 =====
function drawBoard() {
  ctx.fillStyle = '#E8C896';
  ctx.fillRect(0, 0, 600, 600);
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 1;
  for (let i = 0; i < SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(CELL, CELL * (i + 1));
    ctx.lineTo(CELL * SIZE, CELL * (i + 1));
    ctx.moveTo(CELL * (i + 1), CELL);
    ctx.lineTo(CELL * (i + 1), CELL * SIZE);
    ctx.stroke();
  }
  // 화점
  [3, 7, 11].forEach(x => [3, 7, 11].forEach(y => {
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.arc(CELL * (x + 1), CELL * (y + 1), 3, 0, Math.PI * 2);
    ctx.fill();
  }));
  // 금수 표시
  forbiddenSpots.forEach(pos => {
    const [x, y] = pos.split(',').map(Number);
    const cx = CELL * (x + 1), cy = CELL * (y + 1);
    ctx.strokeStyle = '#d32f2f';
    ctx.lineWidth = 2.5;
    const r = CELL * 0.28;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
  });
  // 돌
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      if (board[x][y]) drawStone(x, y, board[x][y]);
    }
  }
  // 승리 라인
  if (gameOver && winLine.length > 0) {
    winLine.forEach(([x, y]) => {
      const cx = CELL * (x + 1), cy = CELL * (y + 1);
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    });
    if (winLine.length >= 2) {
      const [x1, y1] = winLine[0];
      const [x2, y2] = winLine[winLine.length - 1];
      ctx.strokeStyle = 'rgba(255, 213, 79, 0.6)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(CELL * (x1 + 1), CELL * (y1 + 1));
      ctx.lineTo(CELL * (x2 + 1), CELL * (y2 + 1));
      ctx.stroke();
    }
  }
  // 투표 시각화
  if (turn === 2 && !gameOver) {
    const counts = {};
    Object.values(votes).forEach(pos => {
      counts[pos] = (counts[pos] || 0) + 1;
    });
    const maxCount = Math.max(0, ...Object.values(counts));
    Object.entries(counts).forEach(([pos, count]) => {
      const [x, y] = pos.split(',').map(Number);
      const cx = CELL * (x + 1), cy = CELL * (y + 1);
      const isLead = count === maxCount && maxCount > 0;
      ctx.fillStyle = isLead ? 'rgba(220, 50, 50, 0.55)' : 'rgba(50, 100, 220, 0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count, cx, cy);
    });
    if (!isHost && votes[myViewerId]) {
      const [x, y] = votes[myViewerId].split(',').map(Number);
      const cx = CELL * (x + 1), cy = CELL * (y + 1);
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.46, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
function drawStone(x, y, color) {
  const cx = CELL * (x + 1), cy = CELL * (y + 1);
  ctx.beginPath();
  ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = color === 1 ? '#1a1a1a' : '#f5f5f5';
  ctx.fill();
  ctx.strokeStyle = color === 1 ? '#000' : '#888';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function updateStatus() {
  if (gameOver) return;
  const s = document.getElementById('status');
  if (turn === 1) {
    s.textContent = '👑 호스트 차례 (흑돌)' + (renjuRule ? ' — 금수 표시됨' : '');
  } else {
    const left = Math.max(0, Math.ceil((voteDeadline - Date.now()) / 1000));
    s.textContent = '👥 시청자 투표 중 — ' + left + '초';
  }
}

drawBoard();
