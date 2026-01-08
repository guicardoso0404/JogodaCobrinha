(() => {
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlayTitle");
  const overlayTextEl = document.getElementById("overlayText");
  const btnStart = document.getElementById("btnStart");
  const btnRestart = document.getElementById("btnRestart");
  const btnPause = document.getElementById("btnPause");
  const btnApply = document.getElementById("btnApply");
  const btnFullscreen = document.getElementById("btnFullscreen");

  const difficultyEl = document.getElementById("difficulty");
  const modeEl = document.getElementById("mode");
  const gridEl = document.getElementById("grid");
  const obstaclesEl = document.getElementById("obstacles");

  const overlayCardEl = overlayEl?.querySelector?.(".overlayCard") ?? null;
  const boardEl = document.querySelector(".board");

  function hasGsap() {
    return typeof window !== "undefined" && typeof window.gsap !== "undefined";
  }

  let CELL = 20;

  const SPEED_START_MS = 130;
  const SPEED_MIN_MS = 75;

  const DIFFICULTY = {
    easy: { startMs: 150, minMs: 95, obstacleFactor: 0.6, goldChance: 0.14 },
    normal: { startMs: 130, minMs: 75, obstacleFactor: 1.0, goldChance: 0.12 },
    hard: { startMs: 110, minMs: 60, obstacleFactor: 1.35, goldChance: 0.10 },
  };

  const COLORS = {
    bg: "#0b1220",
    grid: "rgba(255, 255, 255, 0.04)",
    snakeHead: "#60a5fa",
    snakeBody: "#93c5fd",
    apple: "#fb7185",
    appleLeaf: "#34d399",
    text: "rgba(255, 255, 255, 0.85)",
  };

  const DIR = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
  };

  function clampInt(value, min, max) {
    return Math.max(min, Math.min(max, value | 0));
  }

  function samePos(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function loadBest() {
    const raw = localStorage.getItem("snake_best");
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? clampInt(n, 0, 1_000_000) : 0;
  }

  function saveBest(best) {
    localStorage.setItem("snake_best", String(best));
  }

  function loadSettings() {
    const defaults = {
      difficulty: "normal",
      mode: "walls",
      grid: 24,
      obstacles: false,
    };

    try {
      const raw = localStorage.getItem("snake_settings");
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const difficulty = DIFFICULTY[parsed?.difficulty] ? parsed.difficulty : defaults.difficulty;
      const mode = parsed?.mode === "wrap" ? "wrap" : "walls";
      const grid = [20, 24, 30].includes(Number(parsed?.grid)) ? Number(parsed.grid) : defaults.grid;
      const obstacles = Boolean(parsed?.obstacles);
      return { difficulty, mode, grid, obstacles };
    } catch {
      return defaults;
    }
  }

  function saveSettings(settings) {
    localStorage.setItem("snake_settings", JSON.stringify(settings));
  }

  function showOverlay(title, text) {
    overlayTitleEl.textContent = title;
    overlayTextEl.textContent = text;
    overlayEl.setAttribute("aria-hidden", "false");

    if (hasGsap()) {
      const gsap = window.gsap;
      gsap.killTweensOf([overlayEl, overlayCardEl]);
      gsap.fromTo(
        overlayEl,
        { opacity: 0 },
        { opacity: 1, duration: 0.18, ease: "power1.out" }
      );
      if (overlayCardEl) {
        gsap.fromTo(
          overlayCardEl,
          { y: 10, scale: 0.985, opacity: 0 },
          { y: 0, scale: 1, opacity: 1, duration: 0.22, ease: "power2.out" }
        );
      }
    }
  }

  function hideOverlay() {
    if (hasGsap()) {
      const gsap = window.gsap;
      gsap.killTweensOf([overlayEl, overlayCardEl]);
      gsap.to(overlayEl, {
        opacity: 0,
        duration: 0.14,
        ease: "power1.in",
        onComplete: () => overlayEl.setAttribute("aria-hidden", "true"),
      });
      if (overlayCardEl) {
        gsap.to(overlayCardEl, { y: 6, scale: 0.99, opacity: 0, duration: 0.12, ease: "power1.in" });
      }
      return;
    }

    overlayEl.setAttribute("aria-hidden", "true");
  }

  function popScore() {
    if (!hasGsap()) return;
    const gsap = window.gsap;
    gsap.killTweensOf([scoreEl]);
    gsap.fromTo(scoreEl, { scale: 1 }, { scale: 1.12, duration: 0.08, ease: "power1.out", yoyo: true, repeat: 1 });
  }

  function isFullscreen() {
    return Boolean(document.fullscreenElement);
  }

  function updateFullscreenButton() {
    if (!btnFullscreen) return;
    btnFullscreen.textContent = isFullscreen() ? "Sair da tela cheia" : "Tela cheia";
  }

  async function toggleFullscreen() {
    if (!boardEl) return;

    try {
      if (!document.fullscreenEnabled) {
        showOverlay("Tela cheia indisponível", "Seu navegador não permite tela cheia aqui.");
        return;
      }

      if (isFullscreen()) {
        await document.exitFullscreen();
      } else {
        // Mantém overlay/controles dentro da área em tela cheia.
        await boardEl.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      // Se falhar (ex.: bloqueio do navegador), só não quebra o jogo.
      showOverlay("Não foi possível", "O navegador bloqueou a tela cheia.");
    } finally {
      updateFullscreenButton();
    }
  }

  function randomEmptyCell(occupiedSet) {
    // Tenta algumas vezes aleatórias antes de fallback completo.
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const x = (Math.random() * state.gridSize) | 0;
      const y = (Math.random() * state.gridSize) | 0;
      const key = `${x},${y}`;
      if (!occupiedSet.has(key)) return { x, y };
    }

    for (let y = 0; y < state.gridSize; y += 1) {
      for (let x = 0; x < state.gridSize; x += 1) {
        const key = `${x},${y}`;
        if (!occupiedSet.has(key)) return { x, y };
      }
    }

    return null;
  }

  /** @type {{
   *  snake: {x:number,y:number}[],
   *  prevSnake: {x:number,y:number}[]|null,
   *  dir: {x:number,y:number},
   *  pendingDir: {x:number,y:number}|null,
   *  apple: {x:number,y:number,type:"normal"|"gold",ttl:number}|null,
   *  obstacles: Set<string>,
   *  score: number,
   *  best: number,
   *  running: boolean,
   *  paused: boolean,
   *  speedMs: number,
   *  lastTick: number,
   *  gridSize: number,
   *  mode: "walls"|"wrap",
   *  difficulty: "easy"|"normal"|"hard",
   *  obstacleEnabled: boolean,
   *  minSpeedMs: number,
   * }} */
  const state = {
    snake: [],
    prevSnake: null,
    dir: DIR.RIGHT,
    pendingDir: null,
    apple: null,
    obstacles: new Set(),
    score: 0,
    best: loadBest(),
    running: false,
    paused: false,
    speedMs: SPEED_START_MS,
    lastTick: 0,
    gridSize: 24,
    mode: "walls",
    difficulty: "normal",
    obstacleEnabled: false,
    minSpeedMs: SPEED_MIN_MS,
  };

  bestEl.textContent = String(state.best);

  const settings = loadSettings();
  state.gridSize = settings.grid;
  state.mode = settings.mode;
  state.difficulty = settings.difficulty;
  state.obstacleEnabled = settings.obstacles;
  state.speedMs = DIFFICULTY[state.difficulty].startMs;
  state.minSpeedMs = DIFFICULTY[state.difficulty].minMs;

  if (difficultyEl) difficultyEl.value = state.difficulty;
  if (modeEl) modeEl.value = state.mode;
  if (gridEl) gridEl.value = String(state.gridSize);
  if (obstaclesEl) obstaclesEl.checked = state.obstacleEnabled;

  function syncCanvasResolution() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssSize = Math.min(rect.width || 480, rect.height || rect.width || 480);

    // Garante que o canvas interno fique em múltiplos do GRID_SIZE, para o grid não “vazar”.
    const internal = state.gridSize * Math.max(1, Math.floor((cssSize * dpr) / state.gridSize));
    if (canvas.width !== internal || canvas.height !== internal) {
      canvas.width = internal;
      canvas.height = internal;
    }

    CELL = canvas.width / state.gridSize;
    ctx.imageSmoothingEnabled = true;
  }

  function applySettings(next) {
    state.difficulty = next.difficulty;
    state.mode = next.mode;
    state.gridSize = next.grid;
    state.obstacleEnabled = next.obstacles;

    state.speedMs = DIFFICULTY[state.difficulty].startMs;
    state.minSpeedMs = DIFFICULTY[state.difficulty].minMs;

    saveSettings(next);
  }

  function computeObstacleCount() {
    if (!state.obstacleEnabled) return 0;
    const { obstacleFactor } = DIFFICULTY[state.difficulty];
    // Aproximadamente 3% a 6% do tabuleiro, escalando pela dificuldade.
    const base = Math.round(state.gridSize * state.gridSize * 0.035 * obstacleFactor);
    return clampInt(base, 0, Math.floor(state.gridSize * state.gridSize * 0.12));
  }

  function generateObstacles() {
    state.obstacles = new Set();
    if (!state.obstacleEnabled) return;

    const count = computeObstacleCount();
    if (count <= 0) return;

    const mid = (state.gridSize / 2) | 0;
    const safeRadius = Math.max(2, Math.floor(state.gridSize / 8));

    const isInSafeZone = (x, y) => {
      return Math.abs(x - mid) <= safeRadius && Math.abs(y - mid) <= safeRadius;
    };

    const occupied = new Set(state.snake.map((p) => `${p.x},${p.y}`));
    for (let attempt = 0; attempt < count * 40 && state.obstacles.size < count; attempt += 1) {
      const x = (Math.random() * state.gridSize) | 0;
      const y = (Math.random() * state.gridSize) | 0;
      if (isInSafeZone(x, y)) continue;
      const key = `${x},${y}`;
      if (occupied.has(key)) continue;
      state.obstacles.add(key);
    }
  }

  function spawnApple(forceType = null) {
    const occupied = new Set(state.snake.map((p) => `${p.x},${p.y}`));
    for (const k of state.obstacles) occupied.add(k);

    const pos = randomEmptyCell(occupied);
    if (!pos) return null;

    const type = forceType || "normal";
    const ttl = type === "gold" ? 55 : 0;
    return { ...pos, type, ttl };
  }

  function resetGame() {
    const mid = (state.gridSize / 2) | 0;
    state.snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    state.prevSnake = null;
    state.dir = DIR.RIGHT;
    state.pendingDir = null;
    state.score = 0;
    state.speedMs = DIFFICULTY[state.difficulty].startMs;
    state.minSpeedMs = DIFFICULTY[state.difficulty].minMs;
    state.lastTick = 0;

    generateObstacles();
    state.apple = spawnApple("normal");

    scoreEl.textContent = "0";
  }

  function setRunningUi(isRunning) {
    btnStart.disabled = isRunning;
    btnRestart.disabled = !isRunning;
    btnPause.disabled = !isRunning;
  }

  function startGame() {
    if (state.running) return;
    state.running = true;
    state.paused = false;
    setRunningUi(true);
    hideOverlay();
    requestAnimationFrame(loop);
  }

  function endGame(reasonText) {
    state.running = false;
    state.paused = false;
    setRunningUi(false);

    if (state.score > state.best) {
      state.best = state.score;
      bestEl.textContent = String(state.best);
      saveBest(state.best);
    }

    showOverlay("Fim de jogo", reasonText);
    btnRestart.disabled = false;
  }

  function togglePause() {
    if (!state.running) return;

    state.paused = !state.paused;
    if (state.paused) {
      showOverlay("Pausado", "Pressione Espaço para voltar.");
      btnPause.textContent = "Continuar";
    } else {
      hideOverlay();
      btnPause.textContent = "Pausar";
      requestAnimationFrame(loop);
    }
  }

  function trySetDirection(nextDir) {
    // Evita inverter 180° instantâneo.
    if (state.dir.x + nextDir.x === 0 && state.dir.y + nextDir.y === 0) return;
    state.pendingDir = nextDir;
  }

  function onKeyDown(e) {
    const key = e.key.toLowerCase();

    if (key === " ") {
      e.preventDefault();
      togglePause();
      return;
    }

    if (!state.running) {
      if (key === "enter") startGame();
      return;
    }

    switch (key) {
      case "arrowup":
      case "w":
        e.preventDefault();
        trySetDirection(DIR.UP);
        break;
      case "arrowdown":
      case "s":
        e.preventDefault();
        trySetDirection(DIR.DOWN);
        break;
      case "arrowleft":
      case "a":
        e.preventDefault();
        trySetDirection(DIR.LEFT);
        break;
      case "arrowright":
      case "d":
        e.preventDefault();
        trySetDirection(DIR.RIGHT);
        break;
    }
  }

  function tick() {
    state.prevSnake = state.snake.map((p) => ({ x: p.x, y: p.y }));

    if (state.pendingDir) {
      state.dir = state.pendingDir;
      state.pendingDir = null;
    }

    const head = state.snake[0];
    let next = {
      x: head.x + state.dir.x,
      y: head.y + state.dir.y,
    };

    // Bateu na parede
    if (next.x < 0 || next.x >= state.gridSize || next.y < 0 || next.y >= state.gridSize) {
      if (state.mode === "wrap") {
        next = {
          x: (next.x + state.gridSize) % state.gridSize,
          y: (next.y + state.gridSize) % state.gridSize,
        };
      } else {
        endGame("Você bateu na parede.");
        return;
      }
    }

    // Obstáculo
    if (state.obstacles.has(`${next.x},${next.y}`)) {
      endGame("Você bateu em um obstáculo.");
      return;
    }

    // Vai crescer?
    const ateApple = state.apple && samePos(next, state.apple);

    // Corpo atual (se não vai crescer, o último segmento sai e não conta como colisão)
    const bodyToCheck = ateApple ? state.snake : state.snake.slice(0, -1);
    if (bodyToCheck.some((p) => samePos(p, next))) {
      endGame("Você bateu no próprio corpo.");
      return;
    }

    // Move
    state.snake.unshift(next);

    if (ateApple) {
      const gain = state.apple.type === "gold" ? 5 : 1;
      state.score += gain;
      scoreEl.textContent = String(state.score);
      popScore();

      if (hasGsap()) {
        const gsap = window.gsap;
        gsap.killTweensOf([canvas]);
        gsap.fromTo(canvas, { scale: 1 }, { scale: 1.02, duration: 0.08, yoyo: true, repeat: 1, ease: "power1.out" });
      }

      // Acelera levemente conforme pontua
      const startMs = DIFFICULTY[state.difficulty].startMs;
      const target = startMs - state.score * 2.4;
      state.speedMs = clampInt(target, state.minSpeedMs, startMs);

      const chance = DIFFICULTY[state.difficulty].goldChance;
      const spawnGold = Math.random() < chance && state.score >= 4;
      state.apple = spawnApple(spawnGold ? "gold" : "normal");
      if (!state.apple) {
        endGame("Você venceu! Não sobrou espaço no tabuleiro.");
      }
    } else {
      state.snake.pop();
    }

    // TTL da maçã dourada
    if (state.apple && state.apple.type === "gold") {
      state.apple.ttl -= 1;
      if (state.apple.ttl <= 0) {
        state.apple = spawnApple("normal");
      }
    }
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    for (let i = 1; i < state.gridSize; i += 1) {
      const p = i * CELL;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(canvas.width, p);
      ctx.stroke();
    }

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawApple() {
    if (!state.apple) return;

    const x = state.apple.x * CELL;
    const y = state.apple.y * CELL;

    // Corpo
    ctx.save();
    ctx.shadowColor = "rgba(251, 113, 133, 0.35)";
    ctx.shadowBlur = 14;

    if (state.apple.type === "gold") {
      ctx.shadowColor = "rgba(250, 204, 21, 0.45)";
      const gg = ctx.createRadialGradient(
        x + CELL * 0.35,
        y + CELL * 0.35,
        CELL * 0.2,
        x + CELL * 0.5,
        y + CELL * 0.55,
        CELL * 0.8
      );
      gg.addColorStop(0, "#fde68a");
      gg.addColorStop(1, "#f59e0b");
      ctx.fillStyle = gg;
    } else {
      const g = ctx.createRadialGradient(
        x + CELL * 0.35,
        y + CELL * 0.35,
        CELL * 0.2,
        x + CELL * 0.5,
        y + CELL * 0.55,
        CELL * 0.7
      );
      g.addColorStop(0, "#fda4af");
      g.addColorStop(1, COLORS.apple);
      ctx.fillStyle = g;
    }
    roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 8);
    ctx.fill();

    // Folha
    ctx.fillStyle = COLORS.appleLeaf;
    ctx.beginPath();
    ctx.ellipse(x + CELL * 0.65, y + CELL * 0.3, CELL * 0.14, CELL * 0.08, -0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function getInterpolatedPos(index, alpha) {
    const curr = state.snake[index];
    const prevList = state.prevSnake;
    if (!prevList || !prevList.length) return curr;

    const prev = prevList[index] || prevList[prevList.length - 1] || curr;
    return {
      x: lerp(prev.x, curr.x, alpha),
      y: lerp(prev.y, curr.y, alpha),
    };
  }

  function drawObstacles() {
    if (!state.obstacleEnabled || !state.obstacles.size) return;
    ctx.save();
    ctx.fillStyle = "rgba(148, 163, 184, 0.24)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
    ctx.lineWidth = 1;

    for (const key of state.obstacles) {
      const [xs, ys] = key.split(",");
      const ox = Number(xs) * CELL;
      const oy = Number(ys) * CELL;
      roundRect(ox + 3, oy + 3, CELL - 6, CELL - 6, 8);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSnake(alpha) {
    if (state.snake.length === 0) return;

    // Corpo
    for (let i = state.snake.length - 1; i >= 0; i -= 1) {
      const p = getInterpolatedPos(i, alpha);
      const x = p.x * CELL;
      const y = p.y * CELL;

      ctx.save();
      ctx.shadowColor = i === 0 ? "rgba(96, 165, 250, 0.25)" : "rgba(147, 197, 253, 0.16)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = i === 0 ? COLORS.snakeHead : COLORS.snakeBody;
      roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 10);
      ctx.fill();
      ctx.restore();
    }

    // Olhinhos no head
    const head = getInterpolatedPos(0, alpha);
    const hx = head.x * CELL;
    const hy = head.y * CELL;

    const eye = () => {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
    };

    ctx.save();
    ctx.translate(hx + CELL / 2, hy + CELL / 2);

    let angle = 0;
    if (state.dir === DIR.UP) angle = -Math.PI / 2;
    if (state.dir === DIR.DOWN) angle = Math.PI / 2;
    if (state.dir === DIR.LEFT) angle = Math.PI;
    if (state.dir === DIR.RIGHT) angle = 0;

    ctx.rotate(angle);
    ctx.translate(CELL * 0.18, 0);

    ctx.save();
    ctx.translate(CELL * 0.12, -CELL * 0.12);
    eye();
    ctx.restore();

    ctx.save();
    ctx.translate(CELL * 0.12, CELL * 0.12);
    eye();
    ctx.restore();

    ctx.restore();
  }

  function draw(alpha) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fundo
    ctx.save();
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Vignette leve
    ctx.save();
    const vg = ctx.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.2,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.75
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    drawGrid();
    drawObstacles();
    drawApple();
    drawSnake(alpha);

    // Dica pequena quando está rodando
    if (state.running && !state.paused) {
      ctx.save();
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px system-ui";
      ctx.fillText("Espaço: pausar", 12, canvas.height - 14);
      ctx.restore();
    }
  }

  function loop(ts) {
    if (!state.running || state.paused) return;

    syncCanvasResolution();

    if (!state.lastTick) state.lastTick = ts;
    const dt = ts - state.lastTick;

    if (dt >= state.speedMs) {
      // Compensa drift
      state.lastTick = ts - (dt % state.speedMs);
      tick();
    }

    const alpha = Math.max(0, Math.min(1, (ts - state.lastTick) / state.speedMs));
    draw(alpha);

    if (state.running) requestAnimationFrame(loop);
  }

  // UI
  btnStart.addEventListener("click", () => {
    resetGame();
    startGame();
  });

  btnRestart.addEventListener("click", () => {
    resetGame();
    if (!state.running) {
      state.running = true;
      setRunningUi(true);
    }
    state.paused = false;
    btnPause.textContent = "Pausar";
    hideOverlay();
    requestAnimationFrame(loop);
  });

  btnPause.addEventListener("click", () => togglePause());

  if (btnFullscreen) {
    btnFullscreen.addEventListener("click", () => {
      toggleFullscreen();
    });

    document.addEventListener("fullscreenchange", () => {
      updateFullscreenButton();
      // Recalcula resolução do canvas quando muda o tamanho.
      syncCanvasResolution();
      draw(0);
    });
  }

  if (btnApply) {
    btnApply.addEventListener("click", () => {
      const next = {
        difficulty: difficultyEl?.value && DIFFICULTY[difficultyEl.value] ? difficultyEl.value : "normal",
        mode: modeEl?.value === "wrap" ? "wrap" : "walls",
        grid: [20, 24, 30].includes(Number(gridEl?.value)) ? Number(gridEl.value) : 24,
        obstacles: Boolean(obstaclesEl?.checked),
      };

      applySettings(next);
      resetGame();
      // Reinicia mantendo o estado "rodando" se já estava em execução
      if (state.running) {
        state.paused = false;
        btnPause.textContent = "Pausar";
        hideOverlay();
        requestAnimationFrame(loop);
      } else {
        showOverlay("Config aplicado", "Clique em Iniciar para jogar com as novas opções.");
      }
    });
  }

  // Touch: botões direcionais
  const touchButtons = document.querySelectorAll(".touchBtn");
  for (const b of touchButtons) {
    b.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        const dir = e.currentTarget?.dataset?.dir;
        if (dir === "up") trySetDirection(DIR.UP);
        if (dir === "down") trySetDirection(DIR.DOWN);
        if (dir === "left") trySetDirection(DIR.LEFT);
        if (dir === "right") trySetDirection(DIR.RIGHT);
        if (!state.running) startGame();
      },
      { passive: false }
    );
  }

  // Touch: swipe no canvas
  let swipeStart = null;
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      swipeStart = { x: e.clientX, y: e.clientY };
    },
    { passive: true }
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!swipeStart) return;
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < 18) return;

      if (ax > ay) {
        trySetDirection(dx > 0 ? DIR.RIGHT : DIR.LEFT);
      } else {
        trySetDirection(dy > 0 ? DIR.DOWN : DIR.UP);
      }
      swipeStart = null;
      if (!state.running) startGame();
    },
    { passive: true }
  );
  canvas.addEventListener(
    "pointerup",
    () => {
      swipeStart = null;
    },
    { passive: true }
  );

  window.addEventListener("keydown", onKeyDown, { passive: false });

  window.addEventListener("resize", () => {
    syncCanvasResolution();
    draw(0);
  });

  // Inicial
  resetGame();
  setRunningUi(false);
  syncCanvasResolution();
  draw(0);
  updateFullscreenButton();
})();
