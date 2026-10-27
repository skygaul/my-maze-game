(function (root) {
  'use strict';

  const N = 1;
  const E = 2;
  const S = 4;
  const W = 8;
  const DIRS = {
    up: { bit: N, opp: S, dx: 0, dy: -1 },
    right: { bit: E, opp: W, dx: 1, dy: 0 },
    down: { bit: S, opp: N, dx: 0, dy: 1 },
    left: { bit: W, opp: E, dx: -1, dy: 0 },
  };

  // 벽 비트마스크: 비트가 켜져 있으면 그 방향이 막혀 있다.
  function canMove(maze, idx, dir) {
    return !(maze.walls[idx] & DIRS[dir].bit);
  }

  // 이동 후의 칸 번호. 막혀 있으면 -1
  function step(maze, idx, dir) {
    if (!canMove(maze, idx, dir)) return -1;
    const d = DIRS[dir];
    return (Math.floor(idx / maze.cols) + d.dy) * maze.cols + (idx % maze.cols) + d.dx;
  }

  // 시작점에서 각 칸까지의 최단 거리(BFS). 닿지 못하면 -1
  function distances(maze, from) {
    const dist = new Int32Array(maze.cols * maze.rows).fill(-1);
    dist[from] = 0;
    const queue = [from];
    for (let h = 0; h < queue.length; h++) {
      const cur = queue[h];
      for (const dir in DIRS) {
        const nxt = step(maze, cur, dir);
        if (nxt >= 0 && dist[nxt] < 0) {
          dist[nxt] = dist[cur] + 1;
          queue.push(nxt);
        }
      }
    }
    return dist;
  }

  // 재귀 백트래킹(스택 방식). 모든 칸이 연결된 미로를 만든다.
  function generate(cols, rows) {
    const total = cols * rows;
    const walls = new Uint8Array(total).fill(15);
    const seen = new Uint8Array(total);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const x = cur % cols;
      const y = Math.floor(cur / cols);
      const opts = [];
      for (const k in DIRS) {
        const d = DIRS[k];
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (!seen[ni]) opts.push([d, ni]);
      }
      if (!opts.length) {
        stack.pop();
        continue;
      }
      const [d, ni] = opts[Math.floor(Math.random() * opts.length)];
      walls[cur] &= ~d.bit;
      walls[ni] &= ~d.opp;
      seen[ni] = 1;
      stack.push(ni);
    }

    const maze = { cols, rows, walls, start: 0, exit: 0, shortest: 0 };
    // 출구는 시작점에서 가장 먼 칸
    const dist = distances(maze, 0);
    let far = 0;
    for (let i = 1; i < total; i++) if (dist[i] > dist[far]) far = i;
    maze.exit = far;
    maze.shortest = dist[far];
    return maze;
  }

  // ---------- 부드러운 이동: 원(플레이어) vs 벽 선분 충돌 ----------
  // 좌표 단위는 '칸'. (x, y)는 원의 중심, 벽은 두께 2*WALL_HALF의 선분이다.
  const WALL_HALF = 0.045;

  function moveCircle(maze, x, y, dx, dy, r) {
    let nx = x + dx;
    let ny = y + dy;
    const cx0 = Math.floor(nx);
    const cy0 = Math.floor(ny);
    const segs = [];
    for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) {
      for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= maze.cols || cy >= maze.rows) continue;
        const w = maze.walls[cy * maze.cols + cx];
        if (w & N) segs.push([cx, cy, cx + 1, cy]);
        if (w & E) segs.push([cx + 1, cy, cx + 1, cy + 1]);
        if (w & S) segs.push([cx, cy + 1, cx + 1, cy + 1]);
        if (w & W) segs.push([cx, cy, cx, cy + 1]);
      }
    }
    const minD = r + WALL_HALF;
    // 벽과 겹치면 가장 가까운 점 반대 방향으로 밀어낸다 (벽을 따라 미끄러짐)
    for (let it = 0; it < 4; it++) {
      let pushed = false;
      for (const [ax, ay, bx, by] of segs) {
        const abx = bx - ax;
        const aby = by - ay;
        let t = ((nx - ax) * abx + (ny - ay) * aby) / (abx * abx + aby * aby);
        t = Math.max(0, Math.min(1, t));
        const qx = ax + abx * t;
        const qy = ay + aby * t;
        const ddx = nx - qx;
        const ddy = ny - qy;
        const d = Math.hypot(ddx, ddy);
        if (d >= minD) continue;
        if (d > 1e-9) {
          nx += (ddx / d) * (minD - d);
          ny += (ddy / d) * (minD - d);
        } else {
          // 선분 위에 정확히 겹친 경우: 이전 위치가 있던 쪽으로 민다
          const ux = -aby;
          const uy = abx;
          const sgn = (x - qx) * ux + (y - qy) * uy >= 0 ? 1 : -1;
          nx += sgn * ux * minD;
          ny += sgn * uy * minD;
        }
        pushed = true;
      }
      if (!pushed) break;
    }
    return { x: nx, y: ny };
  }

  const api = { DIRS, canMove, step, distances, generate, moveCircle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Maze = api;
})(typeof window !== 'undefined' ? window : globalThis);
