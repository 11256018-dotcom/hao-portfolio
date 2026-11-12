(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 年份與台北時間 ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const clockEl = document.getElementById('clock');
  const tickClock = () => {
    if (!clockEl) return;
    clockEl.textContent = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Taipei', hour12: false
    });
  };
  tickClock();
  window.setInterval(tickClock, 1000);

  /* ---------- 捲動進度與導覽列 ---------- */
  const progressEl = document.getElementById('progress');
  const nav = document.getElementById('nav');
  const onScroll = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    if (progressEl) progressEl.style.width = (max > 0 ? (doc.scrollTop / max) * 100 : 0) + '%';
    if (nav) nav.classList.toggle('scrolled', doc.scrollTop > 30);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 行動版選單 ---------- */
  const menuBtn = document.getElementById('menuBtn');
  const navLinks = document.getElementById('navLinks');
  const closeMenu = () => {
    if (!menuBtn || !navLinks) return;
    navLinks.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  };
  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('menu-open', open);
    });
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  }

  /* ---------- 打字機 ---------- */
  const typedEl = document.getElementById('typed');
  if (typedEl) {
    const phrases = ['創意開發者', '前端工程師', '互動設計玩家', '把想法寫成光的程式人'];
    if (reduceMotion) {
      typedEl.textContent = phrases[0];
    } else {
      let phraseIndex = 0;
      let charIndex = 0;
      let deleting = false;
      const step = () => {
        const phrase = phrases[phraseIndex];
        charIndex += deleting ? -1 : 1;
        typedEl.textContent = phrase.slice(0, charIndex);
        let delay = deleting ? 45 : 95;
        if (!deleting && charIndex === phrase.length) {
          deleting = true;
          delay = 1800;
        } else if (deleting && charIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          delay = 400;
        }
        window.setTimeout(step, delay);
      };
      window.setTimeout(step, 700);
    }
  }

  /* ---------- 進場動畫 ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---------- 數字滾動 ---------- */
  const counters = document.querySelectorAll('[data-count]');
  const runCounter = el => {
    const target = parseInt(el.dataset.count, 10) || 0;
    const suffix = el.dataset.suffix || '';
    if (reduceMotion) {
      el.textContent = target + suffix;
      return;
    }
    const duration = 1500;
    const start = performance.now();
    const frame = now => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runCounter(entry.target);
          cio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(el => cio.observe(el));
  } else {
    counters.forEach(runCounter);
  }

  /* ---------- 導覽列 active 狀態 ---------- */
  const navAnchors = document.querySelectorAll('[data-nav]');
  if ('IntersectionObserver' in window && navAnchors.length) {
    const secIO = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navAnchors.forEach(a => a.classList.toggle('active', a.dataset.nav === entry.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['about', 'skills', 'work', 'arcade', 'contact'].forEach(id => {
      const sec = document.getElementById(id);
      if (sec) secIO.observe(sec);
    });
  }

  /* ---------- 自訂游標 ---------- */
  if (canHover && !reduceMotion) {
    const dot = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    if (dot && ring) {
      let mx = window.innerWidth / 2, my = window.innerHeight / 2;
      let rx = mx, ry = my;
      window.addEventListener('mousemove', e => {
        mx = e.clientX;
        my = e.clientY;
        dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      });
      const follow = () => {
        rx += (mx - rx) * 0.18;
        ry += (my - ry) * 0.18;
        ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
        requestAnimationFrame(follow);
      };
      follow();
      document.querySelectorAll('a, button, .project, .skill, #gameCanvas').forEach(el => {
        el.addEventListener('mouseenter', () => ring.classList.add('is-hover'));
        el.addEventListener('mouseleave', () => ring.classList.remove('is-hover'));
      });
    }
  }

  /* ---------- 卡片 3D 傾斜 ---------- */
  if (canHover && !reduceMotion) {
    document.querySelectorAll('.project').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.transform =
          `perspective(900px) rotateX(${(0.5 - py) * 7}deg) rotateY(${(px - 0.5) * 9}deg) translateY(-6px)`;
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---------- 粒子背景 ---------- */
  const canvas = document.getElementById('bg');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    const COLORS = [[0, 240, 255], [255, 46, 196], [139, 92, 255]];
    const TAU = Math.PI * 2;
    let W = 0, H = 0, DPR = 1, points = [], raf = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const maxDist = 150 * DPR;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        for (let j = i + 1; j < points.length; j++) {
          const q = points[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < maxDist) {
            ctx.strokeStyle = `rgba(0, 240, 255, ${((1 - d / maxDist) * 0.22).toFixed(3)})`;
            ctx.lineWidth = 0.6 * DPR;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      for (const p of points) {
        const [r, g, b] = p.c;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.12)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }
    };

    const update = () => {
      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
        else if (p.x > W) { p.x = W; p.vx = -Math.abs(p.vx); }
        if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
        else if (p.y > H) { p.y = H; p.vy = -Math.abs(p.vy); }
      }
      draw();
      raf = requestAnimationFrame(update);
    };

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = Math.floor(window.innerWidth * DPR);
      H = canvas.height = Math.floor(window.innerHeight * DPR);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      const count = Math.max(28, Math.min(90, Math.floor(window.innerWidth / 16)));
      points = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22 * DPR,
        vy: (Math.random() - 0.5) * 0.22 * DPR,
        r: (Math.random() * 1.5 + 0.6) * DPR,
        c: COLORS[Math.floor(Math.random() * COLORS.length)]
      }));
      if (reduceMotion) draw();
    };

    resize();
    if (!reduceMotion) raf = requestAnimationFrame(update);

    let resizeTimer;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        cancelAnimationFrame(raf);
        raf = 0;
        resize();
        if (!reduceMotion) raf = requestAnimationFrame(update);
      }, 150);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!reduceMotion && !raf) {
        raf = requestAnimationFrame(update);
      }
    });
  }

  /* ---------- 封面小遊戲：NEON RUNNER ---------- */
  const gameCanvas = document.getElementById('gameCanvas');
  if (gameCanvas && gameCanvas.getContext) {
    const gctx = gameCanvas.getContext('2d');
    const gamePanel = document.getElementById('gamePanel');
    const gameOverlay = document.getElementById('gameOverlay');
    const gameMsg = document.getElementById('gameMsg');
    const gameSub = document.getElementById('gameSub');
    const gameHi = document.getElementById('gameHi');
    const STORE_KEY = 'haoNeonRunnerBest';
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pad = n => String(Math.max(0, Math.floor(n))).padStart(4, '0');

    const G = {
      mode: 'idle', W: 0, H: 0, dpr: 1, groundY: 0,
      score: 0, best: 0, speed: 0, gap: 0, scroll: 0,
      obstacles: [], sparks: [], stars: [],
      player: { y: 0, vy: 0, onGround: true },
      flash: 0, time: 0, last: 0, inView: true
    };
    try { G.best = parseInt(localStorage.getItem(STORE_KEY), 10) || 0; } catch (e) { G.best = 0; }
    gameHi.textContent = pad(G.best);

    const playerX = () => G.W * 0.17;

    function resizeGame() {
      const rect = gameCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      G.dpr = Math.min(window.devicePixelRatio || 1, 2);
      G.W = rect.width;
      G.H = rect.height;
      gameCanvas.width = Math.round(G.W * G.dpr);
      gameCanvas.height = Math.round(G.H * G.dpr);
      gctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
      G.groundY = Math.round(G.H - Math.max(18, G.H * 0.15));
      if (!G.stars.length) {
        G.stars = Array.from({ length: 40 }, () => ({
          x: Math.random(), y: Math.random(),
          r: rand(0.5, 1.6), a: rand(0.12, 0.7), v: rand(6, 20)
        }));
      }
      drawGame();
    }

    function drawGame() {
      const { W, H, groundY } = G;
      if (!W || !H) return;

      const bg = gctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#060211');
      bg.addColorStop(0.65, '#070413');
      bg.addColorStop(1, '#041019');
      gctx.fillStyle = bg;
      gctx.fillRect(0, 0, W, H);

      const teal = gctx.createRadialGradient(W * 0.18, H * 0.1, 0, W * 0.18, H * 0.1, W * 0.5);
      teal.addColorStop(0, 'rgba(0,240,255,.12)');
      teal.addColorStop(1, 'rgba(0,240,255,0)');
      gctx.fillStyle = teal;
      gctx.fillRect(0, 0, W, H);

      const magenta = gctx.createRadialGradient(W * 0.85, H * 0.85, 0, W * 0.85, H * 0.85, W * 0.45);
      magenta.addColorStop(0, 'rgba(255,46,196,.14)');
      magenta.addColorStop(1, 'rgba(255,46,196,0)');
      gctx.fillStyle = magenta;
      gctx.fillRect(0, 0, W, H);

      const sunR = Math.min(H * 0.26, 42);
      const sunX = W * 0.79;
      const sunY = groundY - H * 0.38;
      const sunGrad = gctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
      sunGrad.addColorStop(0, 'rgba(255,46,196,.5)');
      sunGrad.addColorStop(0.6, 'rgba(139,92,255,.28)');
      sunGrad.addColorStop(1, 'rgba(139,92,255,.04)');
      gctx.save();
      gctx.beginPath();
      gctx.arc(sunX, sunY, sunR, 0, TAU);
      gctx.fillStyle = sunGrad;
      gctx.fill();
      gctx.clip();
      gctx.strokeStyle = 'rgba(6,2,17,.85)';
      gctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const sy = sunY + sunR * 0.15 + i * sunR * 0.16;
        gctx.beginPath();
        gctx.moveTo(sunX - sunR, sy);
        gctx.lineTo(sunX + sunR, sy);
        gctx.stroke();
      }
      gctx.restore();

      for (const s of G.stars) {
        gctx.globalAlpha = s.a;
        gctx.fillStyle = '#9be9ff';
        gctx.fillRect(s.x * W, s.y * (groundY - 10), s.r, s.r);
      }
      gctx.globalAlpha = 1;

      if (G.mode === 'run') {
        gctx.strokeStyle = 'rgba(0,240,255,.12)';
        gctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const y = 16 + i * 17 + ((G.time * 46 + i * 23) % 12);
          const x = ((G.time * (90 + i * 40)) % (W + 120)) - 60;
          gctx.beginPath();
          gctx.moveTo(x, y);
          gctx.lineTo(x + 34 + i * 12, y);
          gctx.stroke();
        }
      }

      gctx.fillStyle = 'rgba(0,240,255,.04)';
      gctx.fillRect(0, groundY, W, H - groundY);
      gctx.save();
      gctx.strokeStyle = 'rgba(0,240,255,.65)';
      gctx.shadowColor = '#00f0ff';
      gctx.shadowBlur = 8;
      gctx.beginPath();
      gctx.moveTo(0, groundY);
      gctx.lineTo(W, groundY);
      gctx.stroke();
      gctx.restore();

      const gap = 44;
      const offset = G.scroll % gap;
      gctx.strokeStyle = 'rgba(0,240,255,.14)';
      gctx.lineWidth = 1;
      for (let x = -offset; x < W + gap; x += gap) {
        gctx.beginPath();
        gctx.moveTo(x, groundY + 2);
        gctx.lineTo(x - 12, H);
        gctx.stroke();
      }
      gctx.strokeStyle = 'rgba(0,240,255,.09)';
      for (let i = 1; i <= 2; i++) {
        const y = groundY + (H - groundY) * (i / 3);
        gctx.beginPath();
        gctx.moveTo(0, y);
        gctx.lineTo(W, y);
        gctx.stroke();
      }

      for (const o of G.obstacles) {
        const y = groundY - o.h;
        gctx.save();
        gctx.fillStyle = 'rgba(255,46,196,.16)';
        gctx.strokeStyle = 'rgba(255,46,196,.95)';
        gctx.lineWidth = 1.5;
        gctx.shadowColor = '#ff2ec4';
        gctx.shadowBlur = 12;
        gctx.fillRect(o.x, y, o.w, o.h);
        gctx.strokeRect(o.x, y, o.w, o.h);
        gctx.shadowBlur = 0;
        gctx.fillStyle = 'rgba(0,240,255,.35)';
        gctx.fillRect(o.x - 2, y + o.h * 0.32, o.w + 4, 2);
        gctx.fillStyle = 'rgba(255,46,196,.6)';
        gctx.beginPath();
        gctx.moveTo(o.x + o.w * 0.5, y + 5);
        gctx.lineTo(o.x + o.w * 0.5 + 3, y + 12);
        gctx.lineTo(o.x + o.w * 0.5 - 3, y + 12);
        gctx.closePath();
        gctx.fill();
        gctx.restore();
      }

      const bob = G.mode === 'idle' ? Math.sin(G.time * 3) * 2.5 : 0;
      const baseY = groundY - G.player.y - 11 - bob;
      gctx.fillStyle = `rgba(0,240,255,${0.22 - Math.min(G.player.y / 320, 0.15)})`;
      gctx.beginPath();
      gctx.ellipse(playerX(), groundY - 2, 18, 3, 0, 0, TAU);
      gctx.fill();

      gctx.save();
      gctx.translate(playerX(), baseY);
      gctx.shadowColor = '#00f0ff';
      gctx.shadowBlur = 16;
      gctx.fillStyle = '#d7fdff';
      gctx.beginPath();
      gctx.moveTo(-11, -9);
      gctx.lineTo(12, 0);
      gctx.lineTo(-11, 9);
      gctx.lineTo(-5, 0);
      gctx.closePath();
      gctx.fill();
      gctx.strokeStyle = 'rgba(255,46,196,.9)';
      gctx.lineWidth = 1.5;
      gctx.stroke();
      if (G.mode === 'run') {
        const flame = 8 + Math.random() * 8;
        gctx.shadowColor = '#ff2ec4';
        gctx.shadowBlur = 10;
        gctx.fillStyle = 'rgba(255,46,196,.8)';
        gctx.beginPath();
        gctx.moveTo(-11, -3.5);
        gctx.lineTo(-11 - flame, 0);
        gctx.lineTo(-11, 3.5);
        gctx.closePath();
        gctx.fill();
      }
      gctx.restore();

      for (const s of G.sparks) {
        gctx.globalAlpha = Math.max(0, s.life);
        gctx.fillStyle = s.c;
        gctx.fillRect(s.x, s.y, s.size, s.size);
      }
      gctx.globalAlpha = 1;

      gctx.font = '11px "Share Tech Mono", monospace';
      gctx.textAlign = 'left';
      gctx.fillStyle = 'rgba(0,240,255,.85)';
      gctx.fillText('SCORE ' + pad(G.score), 14, 21);
      if (G.mode === 'run') {
        gctx.textAlign = 'right';
        gctx.fillStyle = 'rgba(255,46,196,.8)';
        gctx.fillText('SPEED ' + (G.speed / 210).toFixed(1) + 'x', W - 14, 21);
      }

      if (G.flash > 0) {
        gctx.fillStyle = `rgba(255,46,196,${G.flash * 0.35})`;
        gctx.fillRect(0, 0, W, H);
      }
    }

    function updateStars(dt, speed) {
      for (const s of G.stars) {
        s.x -= (s.v + speed * 0.06) * dt / G.W;
        if (s.x < 0) { s.x = 1; s.y = Math.random(); }
      }
    }

    function updateSparks(dt) {
      for (const s of G.sparks) {
        s.vy += 900 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt * 1.6;
      }
      G.sparks = G.sparks.filter(s => s.life > 0);
    }

    function startGame() {
      G.mode = 'run';
      G.score = 0;
      G.speed = 210;
      G.gap = 260;
      G.scroll = 0;
      G.obstacles = [];
      G.sparks = [];
      G.player.y = 0;
      G.player.vy = 0;
      G.player.onGround = true;
      G.flash = 0;
      gamePanel.classList.add('playing');
      gamePanel.classList.remove('over');
      gameOverlay.setAttribute('aria-hidden', 'true');
    }

    function endGame() {
      if (G.mode !== 'run') return;
      G.mode = 'over';
      G.flash = 1;
      const score = Math.floor(G.score);
      if (score > G.best) {
        G.best = score;
        try { localStorage.setItem(STORE_KEY, String(score)); } catch (e) {}
        gameHi.textContent = pad(score);
      }
      gameMsg.textContent = 'GAME OVER';
      gameSub.textContent = `SCORE ${pad(score)} · 按 SPACE / 點擊再挑戰`;
      gamePanel.classList.remove('playing');
      gamePanel.classList.add('over');
      gameOverlay.setAttribute('aria-hidden', 'false');
      const bx = playerX();
      const by = G.groundY - G.player.y - 11;
      for (let i = 0; i < 34; i++) {
        G.sparks.push({
          x: bx, y: by,
          vx: rand(-190, 130), vy: rand(-230, 60),
          life: rand(0.6, 1.4), size: rand(1, 3),
          c: Math.random() < 0.5 ? '#00f0ff' : '#ff2ec4'
        });
      }
    }

    function jump() {
      if (G.mode === 'idle' || G.mode === 'over') { startGame(); return; }
      if (G.player.onGround) {
        G.player.vy = -520;
        G.player.onGround = false;
        for (let i = 0; i < 6; i++) {
          G.sparks.push({
            x: playerX() - 8, y: G.groundY - 3,
            vx: rand(-90, -20), vy: rand(-40, 10),
            life: rand(0.2, 0.45), size: rand(1, 2), c: '#00f0ff'
          });
        }
      }
    }

    function update(dt) {
      G.time += dt;
      updateStars(dt, G.mode === 'run' ? G.speed : 26);
      updateSparks(dt);

      if (G.mode === 'idle') {
        G.scroll += 22 * dt;
        return;
      }
      if (G.mode === 'over') {
        G.flash = Math.max(0, G.flash - dt * 2.2);
        return;
      }

      G.speed = Math.min(460, G.speed + 9 * dt);
      G.score += G.speed * dt * 0.1;
      G.scroll += G.speed * dt;

      if (!G.player.onGround) {
        G.player.vy += 2200 * dt;
        G.player.y -= G.player.vy * dt;
        if (G.player.y <= 0) {
          G.player.y = 0;
          G.player.vy = 0;
          G.player.onGround = true;
        }
      }

      G.gap -= G.speed * dt;
      if (G.gap <= 0) {
        G.obstacles.push({
          x: G.W + 24,
          w: rand(12, 20),
          h: rand(24, Math.min(42, G.H * 0.34))
        });
        G.gap = rand(230, 320) + G.speed * 0.22;
      }

      for (const o of G.obstacles) o.x -= G.speed * dt;
      G.obstacles = G.obstacles.filter(o => o.x + o.w > -20);

      if (Math.random() < 0.35) {
        G.sparks.push({
          x: playerX() - 14, y: G.groundY - G.player.y - 12,
          vx: rand(-90, -25), vy: rand(-20, 20),
          life: rand(0.2, 0.5), size: rand(1, 2.2),
          c: Math.random() < 0.5 ? '#00f0ff' : '#ff2ec4'
        });
      }

      const pLeft = playerX() - 8;
      const pRight = playerX() + 8;
      const pTop = G.groundY - G.player.y - 19;
      const pBottom = G.groundY - G.player.y;
      for (const o of G.obstacles) {
        if (pRight > o.x + 2 && pLeft < o.x + o.w - 2 &&
            pBottom > G.groundY - o.h + 3 && pTop < G.groundY - 2) {
          endGame();
          break;
        }
      }
    }

    function loop(now) {
      requestAnimationFrame(loop);
      if (!G.last) G.last = now;
      const dt = Math.min((now - G.last) / 1000, 0.05);
      G.last = now;
      if (!G.inView || document.hidden) return;
      if (reduceMotion && G.mode === 'idle') return;
      update(dt);
      drawGame();
    }

    window.addEventListener('keydown', e => {
      if (!G.inView) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (!e.repeat) jump();
      }
    });
    gameCanvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      gameCanvas.focus({ preventScroll: true });
      jump();
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        G.inView = entries[0].isIntersecting;
      }, { threshold: 0.15 }).observe(gamePanel);
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(resizeGame).observe(gameCanvas);
    }
    window.addEventListener('resize', resizeGame);

    resizeGame();
    requestAnimationFrame(loop);
  }

  /* ---------- Console 彩蛋 ---------- */
  console.log('%c HAO // SYSTEM ONLINE ', 'background:#00f0ff;color:#04010a;font-weight:bold;padding:4px 10px;border-radius:4px;');
  console.log('%c 想合作？寄信到 hello@hao.dev', 'color:#ff2ec4;font-family:monospace;');
})();
