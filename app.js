(() => {
  'use strict';
  const M = window.Maze;
  const $ = (sel) => document.querySelector(sel);

  const canvas = $('#maze');
  const ctx = canvas.getContext('2d');

  const SIZES = { easy: 10, medium: 16, hard: 24 };
  const FOG_RADIUS = { easy: 4.5, medium: 3.8, hard: 3.2 }; // 칸 단위 시야
  const SPEED = 6; // 초당 이동하는 칸 수
  const RADIUS = 0.27; // 플레이어 반지름 (칸 단위)
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
  };

  let state = null;
  let fog = false;
  let tickId = null;
  let dirty = true;
  const held = { up: false, down: false, left: false, right: false };

  // ---------- 기록 (localStorage는 막혀 있을 수 있으니 try/catch) ----------
  const bestKey = () => `maze-best:${$('#difficulty').value}:${fog ? 'fog' : 'clear'}`;
  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(bestKey())) || null;
    } catch (e) {
      return null;
    }
  }
  function saveBest(rec) {
    try {
      localStorage.setItem(bestKey(), JSON.stringify(rec));
    } catch (e) { /* 저장 불가여도 게임은 계속 */ }
  }

  const fmt = (ms) => {
    const t = Math.floor(ms / 100);
    const s = Math.floor(t / 10);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${t % 10}`;
  };

  // ---------- 게임 진행 ----------
  function newGame() {
    const diff = $('#difficulty').value;
    const n = SIZES[diff];
    state = { diff, maze: M.generate(n, n) };
    resetRun();
  }

  function resetRun() {
    const { maze } = state;
    Object.assign(state, {
      x: (maze.start % maze.cols) + 0.5,
      y: Math.floor(maze.start / maze.cols) + 0.5,
      visited: new Set([maze.start]),
      travelled: 0,
      t0: 0,
      elapsed: 0,
      done: false,
    });
    for (const k in held) held[k] = false;
    $('#win').hidden = true;
    clearInterval(tickId);
    tickId = setInterval(() => {
      if (state.t0 && !state.done) {
        state.elapsed = performance.now() - state.t0;
        renderStats();
      }
    }, 100);
    updateBest();
    renderStats();
    dirty = true;
  }

  const cellIndex = () => {
    const { maze } = state;
    const cx = Math.min(maze.cols - 1, Math.max(0, Math.floor(state.x)));
    const cy = Math.min(maze.rows - 1, Math.max(0, Math.floor(state.y)));
    return cy * maze.cols + cx;
  };

  // 매 프레임: 눌린 방향으로 부드럽게 이동하고 벽에는 미끄러진다
  function update(dt) {
    if (!state || state.done) return;
    const ix = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    const iy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
    if (!ix && !iy) return;
    const len = Math.hypot(ix, iy);
    const stepLen = SPEED * dt;
    const p = M.moveCircle(state.maze, state.x, state.y, (ix / len) * stepLen, (iy / len) * stepLen, RADIUS);
    const moved = Math.hypot(p.x - state.x, p.y - state.y);
    if (moved < 1e-4) return;
    if (!state.t0) state.t0 = performance.now();
    state.x = p.x;
    state.y = p.y;
    state.travelled += moved;
    state.visited.add(cellIndex());
    dirty = true;
    renderStats();
    const { maze } = state;
    const ex = (maze.exit % maze.cols) + 0.5;
    const ey = Math.floor(maze.exit / maze.cols) + 0.5;
    if (Math.hypot(state.x - ex, state.y - ey) < 0.4) win();
  }

  function win() {
    state.done = true;
    state.elapsed = performance.now() - state.t0;
    clearInterval(tickId);
    for (const k in held) held[k] = false;
    const best = loadBest();
    const isNew = !best || state.elapsed < best.ms;
    if (isNew) saveBest({ ms: Math.round(state.elapsed), dist: Math.round(state.travelled) });
    updateBest();
    renderStats();
    const lines = [
      `시간 ${fmt(state.elapsed)} · 이동 거리 ${Math.round(state.travelled)}칸 (최단 ${state.maze.shortest}칸)`,
      isNew ? '🏆 새 최고 기록이에요!' : `최고 기록 ${fmt(best.ms)}`,
    ];
    $('#win-msg').textContent = lines.join('\n');
    $('#win').hidden = false;
  }

  // ---------- 화면 정보 ----------
  function renderStats() {
    $('#time').textContent = fmt(state.elapsed);
    $('#moves').textContent = Math.round(state.travelled);
  }

  function updateBest() {
    const best = loadBest();
    $('#best').textContent = best ? fmt(best.ms) : '-';
  }

  // ---------- 그리기 ----------
  function resizeCanvas() {
    const size = canvas.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  function draw() {
    if (!state) return;
    const { maze, visited } = state;
    const size = canvas.clientWidth;
    const cs = size / maze.cols;
    const px = state.x;
    const py = state.y;
    const R = FOG_RADIUS[state.diff];
    const dist = (i) => Math.hypot((i % maze.cols) + 0.5 - px, Math.floor(i / maze.cols) + 0.5 - py);
    const isVisible = (i) => !fog || dist(i) <= R + 0.7;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0b0f1a';
    ctx.fillRect(0, 0, size, size);

    const total = maze.cols * maze.rows;
    const cellXY = (i) => [(i % maze.cols) * cs, Math.floor(i / maze.cols) * cs];

    ctx.lineWidth = cs * 0.09;
    ctx.lineCap = 'round';

    function drawWalls(i, alpha) {
      const [x, y] = cellXY(i);
      const w = maze.walls[i];
      ctx.strokeStyle = `rgba(143,180,255,${alpha})`;
      ctx.beginPath();
      if (w & 1) { ctx.moveTo(x, y); ctx.lineTo(x + cs, y); }
      if (w & 2) { ctx.moveTo(x + cs, y); ctx.lineTo(x + cs, y + cs); }
      if (w & 4) { ctx.moveTo(x, y + cs); ctx.lineTo(x + cs, y + cs); }
      if (w & 8) { ctx.moveTo(x, y); ctx.lineTo(x, y + cs); }
      ctx.stroke();
    }

    function drawTrail(i) {
      const [x, y] = cellXY(i);
      ctx.fillStyle = 'rgba(255,179,71,0.12)';
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
    }

    // 1) 보이는 영역: 지나온 길 + 벽
    for (let i = 0; i < total; i++) {
      if (!isVisible(i)) continue;
      if (visited.has(i)) drawTrail(i);
      drawWalls(i, 1);
    }

    // 2) 출구 (안개 모드에서는 시야 안에 들어와야 보임)
    if (isVisible(maze.exit)) {
      const [x, y] = cellXY(maze.exit);
      ctx.save();
      ctx.shadowColor = '#4cd98a';
      ctx.shadowBlur = cs * 0.8;
      ctx.fillStyle = '#4cd98a';
      ctx.fillRect(x + cs * 0.22, y + cs * 0.22, cs * 0.56, cs * 0.56);
      ctx.restore();
    }

    // 3) 안개: 플레이어 주변만 밝게, 바깥은 어둡게 + 지나온 길만 흐리게 남김
    if (fog) {
      const cx = px * cs;
      const cy = py * cs;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * cs);
      g.addColorStop(0, 'rgba(11,15,26,0)');
      g.addColorStop(0.55, 'rgba(11,15,26,0)');
      g.addColorStop(1, 'rgba(11,15,26,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      for (const i of visited) {
        if (isVisible(i)) continue;
        drawTrail(i);
        drawWalls(i, 0.28);
      }
    }

    // 4) 시작점 표시와 플레이어
    {
      const [sx, sy] = cellXY(maze.start);
      ctx.strokeStyle = 'rgba(255,179,71,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx + cs / 2, sy + cs / 2, cs * 0.18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = cs * 0.9;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(px * cs, py * cs, RADIUS * cs, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------- 프레임 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    if (dirty) {
      dirty = false;
      draw();
    }
    requestAnimationFrame(frame);
  }

  // ---------- 이벤트 ----------
  function setFog(on) {
    fog = on;
    const b = $('#fog-toggle');
    b.textContent = fog ? '안개 ON' : '안개 OFF';
    b.setAttribute('aria-pressed', String(fog));
  }

  $('#new-game').addEventListener('click', newGame);
  $('#win-new').addEventListener('click', newGame);
  $('#restart').addEventListener('click', () => resetRun());
  $('#difficulty').addEventListener('change', newGame);
  $('#fog-toggle').addEventListener('click', () => {
    setFog(!fog);
    newGame(); // 안개 여부에 따라 기록이 따로라서 새 미로로 시작
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!$('#win').hidden) {
      if (k === 'Enter' && !e.repeat) newGame();
      return;
    }
    if (KEYS[k]) {
      e.preventDefault();
      held[KEYS[k]] = true;
    } else if (e.repeat) {
      return;
    } else if (k === 'r') resetRun();
    else if (k === 'n') newGame();
    else if (k === 'f') {
      setFog(!fog);
      newGame();
    }
  });

  document.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYS[k]) held[KEYS[k]] = false;
  });

  // 창을 벗어나면 키가 눌린 채로 남지 않게
  window.addEventListener('blur', () => {
    for (const k in held) held[k] = false;
  });

  // 방향 버튼: 누르고 있는 동안 이동
  for (const dir of ['up', 'down', 'left', 'right']) {
    const btn = $(`#d-${dir}`);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      held[dir] = true;
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      btn.addEventListener(ev, () => {
        held[dir] = false;
      });
    }
  }

  window.addEventListener('resize', resizeCanvas);

  resizeCanvas();
  newGame();
  requestAnimationFrame(frame);
})();
