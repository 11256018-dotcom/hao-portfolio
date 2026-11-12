(() => {
  'use strict';

  const canvas = document.getElementById('shooterCanvas');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const panel = document.getElementById('shooterPanel');
  const overlay = document.getElementById('shooterOverlay');
  const msgEl = document.getElementById('shooterMsg');
  const subEl = document.getElementById('shooterSub');
  const hiEl = document.getElementById('shooterHi');
  const livesEl = document.getElementById('shooterLives');

  const KEY = 'haoNeonStrikeBest';
  const TAU = Math.PI * 2;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad = n => String(Math.max(0, Math.floor(n))).padStart(4, '0');

  const S = {
    mode: 'idle', W: 0, H: 0, dpr: 1, time: 0, last: 0, inView: true,
    score: 0, best: 0, wave: 1, lives: 3,
    px: 0, py: 0, targetX: null, pointerDown: false, keys: new Set(),
    fireCd: 0, spawnTimer: 0, invuln: 0, flash: 0,
    bullets: [], ebullets: [], enemies: [], sparks: [], stars: []
  };

  try { S.best = parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { S.best = 0; }
  hiEl.textContent = pad(S.best);

  function updateLives() {
    livesEl.innerHTML = [0, 1, 2]
      .map(i => `<span class="${i < S.lives ? 'on' : 'off'}">♥</span>`)
      .join('');
  }
  updateLives();

  function initStars() {
    S.stars = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(),
      r: rand(0.5, 1.8), a: rand(0.15, 0.75), v: rand(8, 32),
      c: Math.random() < 0.2 ? '#ff9be8' : (Math.random() < 0.35 ? '#8b5cff' : '#bfefff')
    }));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.W = rect.width;
    S.H = rect.height;
    canvas.width = Math.round(S.W * S.dpr);
    canvas.height = Math.round(S.H * S.dpr);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    S.py = S.H - Math.max(38, S.H * 0.11);
    if (!S.px) S.px = S.W / 2;
    S.px = Math.min(Math.max(S.px, 26), Math.max(26, S.W - 26));
    if (!S.stars.length) initStars();
    draw();
  }

  function burst(x, y, count, colors) {
    for (let i = 0; i < count; i++) {
      S.sparks.push({
        x, y,
        vx: rand(-170, 170), vy: rand(-170, 170),
        life: rand(0.4, 1), size: rand(1, 3),
        c: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function drawEnemy(e) {
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.sin(S.time * 1.6 + (e.phase || 0)) * 0.18);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = e.color;
    ctx.fillStyle = 'rgba(4, 1, 10, .65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.92, -r * 0.35);
    ctx.lineTo(r * 0.55, r * 0.55);
    ctx.lineTo(0, r * 0.25);
    ctx.lineTo(-r * 0.55, r * 0.55);
    ctx.lineTo(-r * 0.92, -r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = e.color;
    ctx.fillRect(-r * 0.18, -r * 0.32, r * 0.36, r * 0.36);
    ctx.fillStyle = 'rgba(0, 240, 255, .55)';
    ctx.fillRect(-r * 0.7, r * 0.05, r * 1.4, 1.5);
    ctx.restore();
  }

  function drawShip() {
    if (S.mode === 'over') return;
    if (S.mode === 'run' && S.invuln > 0 && Math.floor(S.time * 14) % 2 === 0) return;
    const bob = S.mode === 'idle' ? Math.sin(S.time * 2) * 3 : 0;
    const y = S.py + bob;

    ctx.save();
    ctx.translate(S.px, y);
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#d7fdff';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(8, -2);
    ctx.lineTo(17, 6);
    ctx.lineTo(6, 4);
    ctx.lineTo(4, 12);
    ctx.lineTo(-4, 12);
    ctx.lineTo(-6, 4);
    ctx.lineTo(-17, 6);
    ctx.lineTo(-8, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 46, 196, .9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(4, 1, 10, .85)';
    ctx.beginPath();
    ctx.arc(0, -4, 2.5, 0, TAU);
    ctx.fill();
    const flame = 8 + Math.random() * 8;
    ctx.shadowColor = '#ff2ec4';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255, 46, 196, .7)';
    ctx.beginPath();
    ctx.moveTo(-4, 12);
    ctx.lineTo(0, 12 + flame);
    ctx.lineTo(4, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (S.mode === 'run' && S.invuln > 0) {
      ctx.strokeStyle = `rgba(0, 240, 255, ${0.22 + 0.14 * Math.sin(S.time * 9)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(S.px, y, 27, 0, TAU);
      ctx.stroke();
    }
  }

  function draw() {
    const { W, H } = S;
    if (!W || !H) return;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#050211');
    bg.addColorStop(0.6, '#080414');
    bg.addColorStop(1, '#04101a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glowA = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.55);
    glowA.addColorStop(0, 'rgba(0, 240, 255, .10)');
    glowA.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, W, H);
    const glowB = ctx.createRadialGradient(W * 0.9, H * 0.75, 0, W * 0.9, H * 0.75, W * 0.5);
    glowB.addColorStop(0, 'rgba(255, 46, 196, .10)');
    glowB.addColorStop(1, 'rgba(255, 46, 196, 0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, W, H);

    const pr = Math.min(W, H) * 0.16;
    ctx.beginPath();
    ctx.arc(W * 0.82, H * 0.28, pr, 0, TAU);
    ctx.fillStyle = 'rgba(139, 92, 255, .05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, .09)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (const s of S.stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    const hy = H - 12;
    const hg = ctx.createLinearGradient(0, hy, 0, H);
    hg.addColorStop(0, 'rgba(0, 240, 255, .14)');
    hg.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, hy, W, 12);
    ctx.strokeStyle = 'rgba(0, 240, 255, .3)';
    ctx.beginPath();
    ctx.moveTo(0, hy);
    ctx.lineTo(W, hy);
    ctx.stroke();

    if (S.mode === 'idle') {
      const demo = [
        { x: W * 0.3, y: H * 0.3, r: 15, color: '#ff2ec4', phase: 0 },
        { x: W * 0.5, y: H * 0.22, r: 17, color: '#8b5cff', phase: 1.4 },
        { x: W * 0.7, y: H * 0.32, r: 14, color: '#42ffa4', phase: 2.6 }
      ];
      demo.forEach(drawEnemy);
    }

    for (const e of S.enemies) drawEnemy(e);

    for (const b of S.ebullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = '#ff2ec4';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff2ec4';
      ctx.fillRect(-b.r * 0.8, -b.r * 0.8, b.r * 1.6, b.r * 1.6);
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#bffcff';
    for (const b of S.bullets) {
      ctx.fillRect(b.x - 1.5, b.y - 10, 3, 12);
    }
    ctx.restore();

    drawShip();

    for (const s of S.sparks) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0, 240, 255, .85)';
    ctx.fillText('SCORE ' + pad(S.score), 16, 25);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 46, 196, .8)';
    ctx.fillText('WAVE ' + String(S.wave).padStart(2, '0'), W / 2, 25);

    if (S.flash > 0) {
      ctx.fillStyle = `rgba(255, 46, 196, ${S.flash * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function updateStars(dt) {
    for (const s of S.stars) {
      s.y += (s.v + (S.mode === 'run' ? 26 : 0)) * dt / S.H;
      if (s.y > 1) { s.y = 0; s.x = Math.random(); }
    }
  }

  function updateSparks(dt) {
    for (const s of S.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.98;
      s.vy *= 0.98;
      s.life -= dt * 1.4;
    }
    S.sparks = S.sparks.filter(s => s.life > 0);
  }

  function spawnEnemy() {
    const r = rand(12, 17);
    const x = rand(r + 16, Math.max(r + 17, S.W - r - 16));
    const colors = ['#ff2ec4', '#8b5cff', '#42ffa4'];
    S.enemies.push({
      x, baseX: x, y: -r - 10, r,
      speed: rand(34, 58) + S.wave * 5,
      sway: rand(6, 24),
      swaySpeed: rand(1.1, 2.1),
      phase: rand(0, TAU),
      fireCd: rand(1.2, 2.6),
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function fire() {
    if (S.mode !== 'run' || S.fireCd > 0) return;
    S.fireCd = 0.13;
    const offsets = S.wave >= 7 ? [-9, 0, 9] : (S.wave >= 4 ? [-6, 6] : [0]);
    for (const dx of offsets) {
      S.bullets.push({ x: S.px + dx, y: S.py - 20, vy: -660 });
    }
    for (let i = 0; i < 2; i++) {
      S.sparks.push({
        x: S.px + rand(-4, 4), y: S.py - 18,
        vx: rand(-30, 30), vy: rand(-80, -20),
        life: 0.12, size: 1.5, c: '#bffcff'
      });
    }
  }

  function hurt() {
    if (S.mode !== 'run' || S.invuln > 0) return;
    S.lives -= 1;
    updateLives();
    S.invuln = 2;
    S.flash = 1;
    S.ebullets = [];
    burst(S.px, S.py, 26, ['#00f0ff', '#ff2ec4', '#ffffff']);
    if (S.lives <= 0) endGame();
  }

  function start() {
    S.mode = 'run';
    S.score = 0;
    S.wave = 1;
    S.lives = 3;
    S.invuln = 1.4;
    S.flash = 0;
    S.bullets = [];
    S.ebullets = [];
    S.enemies = [];
    S.sparks = [];
    S.spawnTimer = 0.7;
    S.fireCd = 0;
    S.targetX = null;
    S.pointerDown = false;
    S.px = S.W / 2;
    updateLives();
    panel.classList.add('playing');
    panel.classList.remove('over');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function endGame() {
    if (S.mode !== 'run') return;
    S.mode = 'over';
    const score = Math.floor(S.score);
    if (score > S.best) {
      S.best = score;
      try { localStorage.setItem(KEY, String(score)); } catch (e) {}
      hiEl.textContent = pad(score);
    }
    msgEl.textContent = 'GAME OVER';
    subEl.textContent = `SCORE ${pad(score)} · WAVE ${String(S.wave).padStart(2, '0')} · 按 SPACE / 點擊再挑戰`;
    panel.classList.remove('playing');
    panel.classList.add('over');
    overlay.setAttribute('aria-hidden', 'false');
    burst(S.px, S.py, 40, ['#00f0ff', '#ff2ec4', '#ffffff']);
  }

  function update(dt) {
    S.time += dt;
    updateStars(dt);
    updateSparks(dt);
    S.flash = Math.max(0, S.flash - dt * 2.4);
    S.invuln = Math.max(0, S.invuln - dt);

    if (S.mode !== 'run') return;

    let dir = 0;
    if (S.keys.has('ArrowLeft') || S.keys.has('KeyA')) dir -= 1;
    if (S.keys.has('ArrowRight') || S.keys.has('KeyD')) dir += 1;
    if (dir !== 0) {
      S.px += dir * 380 * dt;
      S.targetX = null;
    } else if (S.targetX !== null) {
      S.px += (S.targetX - S.px) * Math.min(1, dt * 16);
    }
    S.px = Math.max(24, Math.min(S.W - 24, S.px));

    S.fireCd -= dt;
    if (S.keys.has('Space') || S.pointerDown) fire();

    S.wave = 1 + Math.floor(S.score / 750);

    S.spawnTimer -= dt;
    if (S.spawnTimer <= 0) {
      spawnEnemy();
      S.spawnTimer = Math.max(0.36, 1.15 - S.wave * 0.065) * rand(0.85, 1.25);
    }

    for (const e of S.enemies) {
      e.y += e.speed * dt;
      e.x = e.baseX + Math.sin(S.time * e.swaySpeed + e.phase) * e.sway;
      e.x = Math.max(e.r + 6, Math.min(S.W - e.r - 6, e.x));
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.y > S.H * 0.12 && e.y < S.py - 40) {
        const aim = Math.max(-80, Math.min(80, (S.px - e.x) * 0.45));
        S.ebullets.push({
          x: e.x, y: e.y + e.r,
          vx: aim, vy: rand(140, 185) + S.wave * 4, r: 3
        });
        e.fireCd = rand(1.5, 3.2) / (1 + S.wave * 0.06);
      }
    }
    S.enemies = S.enemies.filter(e => e.y < S.H + 40);

    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      b.y += b.vy * dt;
      if (b.y < -20) { S.bullets.splice(i, 1); continue; }
      for (let j = S.enemies.length - 1; j >= 0; j--) {
        const e = S.enemies[j];
        if (Math.abs(b.x - e.x) < e.r && Math.abs(b.y - e.y) < e.r + 5) {
          S.bullets.splice(i, 1);
          S.score += 100 + (S.wave - 1) * 15;
          burst(e.x, e.y, 12, [e.color, '#ffffff']);
          S.enemies.splice(j, 1);
          break;
        }
      }
    }

    for (let i = S.ebullets.length - 1; i >= 0; i--) {
      const b = S.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > S.H + 20 || b.x < -20 || b.x > S.W + 20) {
        S.ebullets.splice(i, 1);
        continue;
      }
      if (S.invuln <= 0 && Math.hypot(b.x - S.px, b.y - S.py) < 13) {
        S.ebullets.splice(i, 1);
        hurt();
        break;
      }
    }

    for (const e of S.enemies) {
      if (Math.hypot(e.x - S.px, e.y - S.py) < e.r + 14) {
        e.y = S.H + 100;
        if (S.invuln <= 0) hurt();
        break;
      }
    }
    S.enemies = S.enemies.filter(e => e.y < S.H + 40);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!S.last) S.last = now;
    const dt = Math.min((now - S.last) / 1000, 0.05);
    S.last = now;
    if (!S.inView || document.hidden) return;
    if (reduceMotion && S.mode === 'idle') return;
    update(dt);
    draw();
  }

  function setTarget(e) {
    const rect = canvas.getBoundingClientRect();
    S.targetX = Math.max(24, Math.min(S.W - 24, ((e.clientX - rect.left) / rect.width) * S.W));
  }

  const blockedTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'];
  window.addEventListener('keydown', e => {
    if (!S.inView) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (blockedTags.includes(tag)) return;
    if (!['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space'].includes(e.code)) return;
    e.preventDefault();
    S.keys.add(e.code);
    if (e.code === 'Space' && !e.repeat && (S.mode === 'idle' || S.mode === 'over')) start();
  });
  window.addEventListener('keyup', e => { S.keys.delete(e.code); });
  window.addEventListener('blur', () => { S.keys.clear(); S.pointerDown = false; });

  canvas.addEventListener('pointermove', e => {
    if (!S.inView || S.mode !== 'run') return;
    setTarget(e);
    if (e.buttons > 0) S.pointerDown = true;
  });
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (S.mode === 'idle' || S.mode === 'over') {
      start();
      setTarget(e);
      S.pointerDown = true;
      return;
    }
    setTarget(e);
    S.pointerDown = true;
    fire();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => {
    canvas.addEventListener(ev, () => { S.pointerDown = false; });
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      S.inView = entries[0].isIntersecting;
      if (!S.inView) { S.keys.clear(); S.pointerDown = false; }
    }, { threshold: 0.15 }).observe(panel);
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(canvas);
  }
  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame(loop);
})();
