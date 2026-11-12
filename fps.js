(() => {
  'use strict';

  const THREE = window.THREE;
  const $ = (sel, root = document) => root.querySelector(sel);

  const dom = {
    canvas: $('#rangeCanvas'),
    hud: $('#hud'),
    hudMode: $('#hudMode'),
    hudGoal: $('#hudGoal'),
    hitmarker: $('#hitmarker'),
    feedback: $('#feedback'),
    hitFlash: $('#hitFlash'),
    menu: $('#menuOverlay'),
    pause: $('#pauseOverlay'),
    results: $('#resultsOverlay'),
    error: $('#errorOverlay'),
    errorText: $('#errorText'),
    startQual: $('#startQual'),
    startPractice: $('#startPractice'),
    resumeBtn: $('#resumeBtn'),
    restartBtn: $('#restartBtn'),
    quitBtn: $('#quitBtn'),
    retryBtn: $('#retryBtn'),
    resultMenuBtn: $('#resultMenuBtn'),
    bestTime: $('#bestTime'),
    rangeStatus: $('#rangeStatus'),
    touchWarning: $('#touchWarning'),
    pauseTime: $('#pauseTime'),
    pauseKills: $('#pauseKills'),
    pauseHs: $('#pauseHs'),
    resultTime: $('#resultTime'),
    resultHs: $('#resultHs'),
    resultAcc: $('#resultAcc'),
    resultShots: $('#resultShots'),
    newBest: $('#newBest')
  };

  function showFatal(message) {
    [dom.menu, dom.pause, dom.results].forEach(el => el.classList.add('is-hidden'));
    dom.error.classList.remove('is-hidden');
    dom.errorText.textContent = message;
    dom.hud.classList.add('is-hidden');
  }

  if (!THREE) {
    showFatal('Three.js 載入失敗。請確認 vendor/three.min.js 存在，或重新整理頁面。');
    return;
  }

  /* ------------------------------------------------------------------ *
   *  Utilities & constants
   * ------------------------------------------------------------------ */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad2 = n => String(Math.floor(n)).padStart(2, '0');
  const pad3 = n => String(Math.floor(n)).padStart(3, '0');
  const formatTime = (seconds, decimals = 1) => {
    const safe = Math.max(0, seconds);
    const mins = Math.floor(safe / 60);
    const secs = safe - mins * 60;
    const str = secs.toFixed(decimals).padStart(decimals === 2 ? 5 : 4, '0');
    return `${pad2(mins)}:${str}`;
  };
  const isDebug = new URLSearchParams(location.search).has('debug');

  const BASE_FOV = 72;
  const PLAYER_Z = 9.2;
  const EYE_HEIGHT = 1.68;
  const TARGET_KILLS = 100;
  const BODY_HP = 3;
  const BOT_COUNT = 7;
  const BEST_KEY = 'haoAimLabBest100';

  let bestTime = 0;
  try { bestTime = parseFloat(localStorage.getItem(BEST_KEY)) || 0; } catch (err) { bestTime = 0; }
  dom.bestTime.textContent = bestTime > 0 ? formatTime(bestTime, 2) : '--:--.--';

  /* ------------------------------------------------------------------ *
   *  Renderer / scene / player
   * ------------------------------------------------------------------ */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    showFatal('WebGL 無法啟動。請改用支援 WebGL 的 Chrome / Edge，或檢查顯示卡設定。');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f10);
  scene.fog = new THREE.FogExp2(0x0b1112, 0.018);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.03, 80);
  const player = new THREE.Group();
  player.position.set(0, 0, PLAYER_Z);
  scene.add(player);
  camera.position.set(0, EYE_HEIGHT, 0);
  camera.rotation.order = 'YXZ';
  player.add(camera);

  let yaw = 0;
  let pitch = -0.025;
  let strafeVel = 0;

  const occluders = [];
  const bots = [];
  const hitTargets = [];

  /* ------------------------------------------------------------------ *
   *  Procedural textures
   * ------------------------------------------------------------------ */
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let seed = 9187;
  const srand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  function makeTexture(canvas, repeatX = 1, repeatY = 1) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = maxAniso;
    return tex;
  }

  function makeWoodTexture(base, dark, light, vertical, plankSize) {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const step = plankSize || 128;
    for (let p = 0; p < size; p += step) {
      const tint = Math.floor(rand(-10, 12));
      ctx.fillStyle = `rgba(${tint > 0 ? 255 : 0}, ${tint > 0 ? 235 : 0}, ${tint > 0 ? 210 : 0}, ${Math.abs(tint) / 90})`;
      if (vertical) ctx.fillRect(p, 0, step, size);
      else ctx.fillRect(0, p, size, step);

      ctx.strokeStyle = dark;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(p + 1, 0);
        ctx.lineTo(p + 1, size);
      } else {
        ctx.moveTo(0, p + 1);
        ctx.lineTo(size, p + 1);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      for (let g = 0; g < 7; g++) {
        const offset = p + rand(8, step - 8);
        const amp = rand(2, 8);
        const length = rand(70, 220);
        const start = rand(0, size - length);
        ctx.strokeStyle = g % 3 === 0 ? light : dark;
        ctx.globalAlpha = rand(0.06, 0.18);
        ctx.lineWidth = rand(0.6, 1.8);
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(offset, start);
          ctx.bezierCurveTo(offset + amp, start + length * 0.33, offset - amp, start + length * 0.66, offset + rand(-2, 2), start + length);
        } else {
          ctx.moveTo(start, offset);
          ctx.bezierCurveTo(start + length * 0.33, offset + amp, start + length * 0.66, offset - amp, start + length, offset + rand(-2, 2));
        }
        ctx.stroke();
      }

      if (srand() < 0.45) {
        const kx = vertical ? p + rand(20, step - 20) : rand(30, size - 30);
        const ky = vertical ? rand(30, size - 30) : p + rand(20, step - 20);
        const r = rand(2, 5);
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = dark;
        for (let ring = 0; ring < 3; ring++) {
          ctx.beginPath();
          ctx.ellipse(kx, ky, r + ring * 1.7, (r + ring * 1.7) * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = srand() < 0.5 ? light : dark;
      ctx.globalAlpha = rand(0.015, 0.06);
      ctx.fillRect(srand() * size, srand() * size, rand(0.6, 2.2), rand(4, 22));
    }
    ctx.globalAlpha = 1;

    return c;
  }

  const wallTex = makeTexture(makeWoodTexture('#8b6340', '#432a17', '#bd8b58', true, 128), 3, 1);
  const floorTex = makeTexture(makeWoodTexture('#5f442e', '#2c1b10', '#99714e', false, 96), 5, 8);
  const ceilingTex = makeTexture(makeWoodTexture('#3d2b1e', '#1c120b', '#65482f', false, 128), 4, 6);
  const plywoodTex = makeTexture(makeWoodTexture('#a67d4e', '#5b3d22', '#d1a06b', true, 170), 4, 1);
  const crateTex = makeTexture(makeWoodTexture('#7b542f', '#3d2612', '#b98751', false, 128), 1, 1);

  const hazardCanvas = document.createElement('canvas');
  hazardCanvas.width = 512;
  hazardCanvas.height = 64;
  {
    const ctx = hazardCanvas.getContext('2d');
    ctx.fillStyle = '#171a18';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#c79a45';
    for (let x = -64; x < 576; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x + 30, 0);
      ctx.lineTo(x + 54, 0);
      ctx.lineTo(x + 24, 64);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 180; i++) ctx.fillRect(rand(0, 512), rand(0, 64), rand(1, 5), rand(1, 3));
    ctx.globalAlpha = 1;
  }
  const hazardTex = makeTexture(hazardCanvas, 1, 1);
  hazardTex.rotation = 0;

  function makeSign(text, sub, accent) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 320;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ece7dc';
    ctx.font = '700 132px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(text, 30, 126);
    ctx.fillStyle = accent || '#ff7a45';
    ctx.fillRect(32, 197, 88, 5);
    ctx.fillStyle = 'rgba(236,231,220,.64)';
    ctx.font = '400 38px "Share Tech Mono", monospace';
    ctx.fillText(sub, 33, 247);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    return tex;
  }

  /* ------------------------------------------------------------------ *
   *  Wall scoreboard canvas
   * ------------------------------------------------------------------ */
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1200;
  boardCanvas.height = 340;
  const boardCtx = boardCanvas.getContext('2d');
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = maxAniso;
  let boardSig = '';

  /* ------------------------------------------------------------------ *
   *  Lighting
   * ------------------------------------------------------------------ */
  scene.add(new THREE.HemisphereLight(0xd7e3df, 0x352317, 0.85));

  const keyLight = new THREE.DirectionalLight(0xffe6c5, 1.65);
  keyLight.position.set(-7, 12, 7);
  keyLight.target.position.set(0, 1, -5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -18;
  keyLight.shadow.camera.right = 18;
  keyLight.shadow.camera.top = 14;
  keyLight.shadow.camera.bottom = -8;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 42;
  keyLight.shadow.bias = -0.0006;
  keyLight.shadow.normalBias = 0.025;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const coolLight = new THREE.DirectionalLight(0x9cc9cf, 0.62);
  coolLight.position.set(-10, 6, -3);
  coolLight.target.position.set(0, 1.5, -8);
  scene.add(coolLight);
  scene.add(coolLight.target);

  const warmLight = new THREE.DirectionalLight(0xffb36b, 0.32);
  warmLight.position.set(8, 5, -13);
  warmLight.target.position.set(0, 1, -9);
  scene.add(warmLight);
  scene.add(warmLight.target);

  /* ------------------------------------------------------------------ *
   *  Materials
   * ------------------------------------------------------------------ */
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.86, metalness: 0.03 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.82, metalness: 0.04 });
  const ceilingMat = new THREE.MeshStandardMaterial({ map: ceilingTex, roughness: 0.9, metalness: 0.02 });
  const plywoodMat = new THREE.MeshStandardMaterial({ map: plywoodTex, roughness: 0.9, metalness: 0.02 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.84, metalness: 0.04 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x4c3320, roughness: 0.8, metalness: 0.03 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x22292a, roughness: 0.46, metalness: 0.72 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x5e686a, roughness: 0.36, metalness: 0.82 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x171c1d, roughness: 0.78, metalness: 0.2 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff7a45, emissive: 0x6b1e06, emissiveIntensity: 0.6, roughness: 0.5 });
  const hazardMat = new THREE.MeshBasicMaterial({ map: hazardTex, toneMapped: false });

  const world = new THREE.Group();
  scene.add(world);

  function addBox(w, h, d, mat, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    (opts.parent || world).add(mesh);
    if (opts.occluder !== false) occluders.push(mesh);
    return mesh;
  }

  /* ------------------------------------------------------------------ *
   *  Room shell
   * ------------------------------------------------------------------ */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -3);
  floor.receiveShadow = true;
  world.add(floor);
  occluders.push(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(20, 30), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 6, -3);
  ceiling.receiveShadow = true;
  world.add(ceiling);
  occluders.push(ceiling);

  addBox(20, 6, 0.4, wallMat, 0, 3, -18.1, { cast: false, receive: false });
  addBox(0.4, 6, 30, wallMat, -10.1, 3, -3, { cast: false, receive: false });
  addBox(0.4, 6, 30, wallMat, 10.1, 3, -3, { cast: false, receive: false });
  addBox(20, 6, 0.4, wallMat, 0, 3, 12.1, { cast: false, receive: false });

  // target wall
  addBox(19.3, 3.45, 0.16, plywoodMat, 0, 1.73, -17.82, { cast: false });
  addBox(19.4, 0.16, 0.24, darkMetalMat, 0, 3.5, -17.7);
  addBox(19.4, 0.2, 0.2, beamMat, 0, 0.1, -17.7);

  // wall framing
  [-8.1, -4.05, 0, 4.05, 8.1].forEach(x => {
    addBox(0.22, 3.48, 0.2, beamMat, x, 1.74, -17.7);
  });
  [-15, -10, -5, 0, 5, 10].forEach(z => {
    addBox(0.24, 6, 0.24, beamMat, -9.84, 3, z);
    addBox(0.24, 6, 0.24, beamMat, 9.84, 3, z);
    addBox(20, 0.26, 0.3, beamMat, 0, 5.84, z);
  });
  [-15, -10, -5, 0, 5, 10].forEach(z => {
    addBox(18.9, 0.1, 0.12, darkMetalMat, 0, 5.68, z, { cast: false });
  });

  // lower wainscot on side walls
  [-9.88, 9.88].forEach(x => {
    addBox(0.08, 1.7, 29.2, plywoodMat, x, 0.88, -3, { cast: false });
    addBox(0.1, 0.12, 29.2, beamMat, x, 1.75, -3, { cast: false });
  });

  // wall stencil signs
  function addWallSign(texture, width, height, x, y, z, rotY = 0) {
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    world.add(mesh);
    return mesh;
  }

  addWallSign(makeSign('RANGE 07', 'SEMI-AUTO // AIM PROTOCOL'), 3.55, 1.11, -6.7, 4.4, -17.62);
  addWallSign(makeSign('AIM LAB', 'PRECISION / DISCIPLINE', '#63d7c7'), 3.3, 1.03, 6.8, 4.35, -17.62);
  addWallSign(makeSign('TRIGGER', 'ONE CLICK // ONE SHOT', '#63d7c7'), 2.4, 0.75, 9.78, 3.2, -7.5, -Math.PI / 2);

  /* ------------------------------------------------------------------ *
   *  Ceiling lamps
   * ------------------------------------------------------------------ */
  const cordGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.45, 6);
  const shadeGeo = new THREE.ConeGeometry(0.36, 0.28, 20, 1, true);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x222a2a, roughness: 0.42, metalness: 0.62, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdcae, toneMapped: false });

  [-4.6, 0, 4.6].forEach(x => {
    const cord = new THREE.Mesh(cordGeo, darkMat);
    cord.position.set(x, 5.25, -6);
    world.add(cord);

    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.set(x, 4.42, -6);
    shade.castShadow = true;
    world.add(shade);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), bulbMat);
    bulb.position.set(x, 4.31, -6);
    world.add(bulb);

    const glow = new THREE.PointLight(0xffc889, 1.35, 12, 2);
    glow.position.set(x, 4.2, -6);
    world.add(glow);
  });

  // soft cool light spill from the left-side windows
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xbddcdc, transparent: true, opacity: 0.92, toneMapped: false });
  const windowGlowMat = new THREE.MeshBasicMaterial({ color: 0xe8f3ee, transparent: true, opacity: 0.18, side: THREE.DoubleSide, toneMapped: false });
  [-3, -8, -13].forEach(z => {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), windowMat);
    pane.position.set(-9.94, 4.1, z);
    pane.rotation.y = Math.PI / 2;
    world.add(pane);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), windowGlowMat);
    glow.position.set(-9.9, 4.05, z);
    glow.rotation.y = Math.PI / 2;
    world.add(glow);

    addBox(2.7, 0.09, 0.1, darkMetalMat, -9.84, 4.94, z, { rotY: Math.PI / 2, cast: false });
    addBox(2.7, 0.09, 0.1, darkMetalMat, -9.84, 3.26, z, { rotY: Math.PI / 2, cast: false });
    addBox(0.09, 1.8, 0.1, darkMetalMat, -9.84, 4.1, z - 1.22, { cast: false });
    addBox(0.09, 1.8, 0.1, darkMetalMat, -9.84, 4.1, z + 1.22, { cast: false });
    addBox(0.08, 1.6, 0.06, darkMetalMat, -9.82, 4.1, z, { cast: false });
  });

  /* ------------------------------------------------------------------ *
   *  Shooting booth / barrier
   * ------------------------------------------------------------------ */
  const barrier = addBox(6.5, 1.16, 0.58, plywoodMat, 0, 0.58, 6.35, { cast: true });
  addBox(6.8, 0.1, 0.72, beamMat, 0, 1.21, 6.35, { cast: true });

  const hazardStrip = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.2), hazardMat);
  hazardStrip.position.set(0, 0.98, 6.642);
  world.add(hazardStrip);

  [-3.18, 3.18].forEach(x => {
    addBox(0.18, 2.35, 4.6, plywoodMat, x, 1.175, 8.55, { cast: true });
    addBox(0.3, 0.1, 4.75, beamMat, x, 2.36, 8.55, { cast: true });
  });

  const boothFoot = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 4.6), new THREE.MeshStandardMaterial({ color: 0x1c2322, roughness: 0.96 }));
  boothFoot.rotation.x = -Math.PI / 2;
  boothFoot.position.set(0, 0.008, 8.55);
  boothFoot.receiveShadow = true;
  world.add(boothFoot);

  const laneLineMat = new THREE.MeshBasicMaterial({ color: 0xd2ad72, transparent: true, opacity: 0.19, toneMapped: false });
  [-2.2, 2.2].forEach(x => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 12), laneLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.012, 0.5);
    world.add(line);
  });
  [-1, -5.5, -10].forEach(z => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(13, 0.055), laneLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.012, z);
    world.add(line);
  });

  /* ------------------------------------------------------------------ *
   *  Crates & barrels (kept away from bot slots)
   * ------------------------------------------------------------------ */
  addBox(1.25, 1.15, 1.25, crateMat, -8.2, 0.575, -1.8, { rotY: 0.16 });
  addBox(0.9, 0.85, 0.9, crateMat, -7.35, 0.425, -2.9, { rotY: -0.22 });
  addBox(1.35, 0.9, 1.1, crateMat, 8.25, 0.45, -3.4, { rotY: -0.1 });
  addBox(1.0, 0.7, 0.9, crateMat, 8.45, 1.23, -3.3, { rotY: 0.24 });
  addBox(1.1, 0.95, 1.2, crateMat, -8.4, 0.475, -12.8, { rotY: 0.2 });
  addBox(1.3, 1.1, 1.0, crateMat, 8.3, 0.55, -14.2, { rotY: -0.18 });

  function addBarrel(x, z, color) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.42 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 1.0, 18), mat);
    barrel.position.set(x, 0.5, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    world.add(barrel);
    occluders.push(barrel);
    [0.24, 0.76].forEach(y => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 20), darkMetalMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(x, y, z);
      world.add(band);
    });
  }
  addBarrel(-7.6, -6.2, 0x35473d);
  addBarrel(7.75, -8.4, 0x3f3b31);
  addBarrel(-8.1, -15.2, 0x35473d);

  /* ------------------------------------------------------------------ *
   *  Wall scoreboard
   * ------------------------------------------------------------------ */
  const boardFrame = addBox(8.1, 2.6, 0.16, darkMetalMat, 0, 4.42, -17.73, { cast: true });
  const boardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7.8, 2.2),
    new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false })
  );
  boardMesh.position.set(0, 4.42, -17.64);
  world.add(boardMesh);

  [[-3.75, 4.42], [3.75, 4.42]].forEach(([x, y]) => {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), metalMat);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(x, y, -17.63);
    world.add(bolt);
  });

  const boardTopGlow = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 0.04), new THREE.MeshBasicMaterial({ color: 0xff7a45, toneMapped: false }));
  boardTopGlow.position.set(0, 5.6, -17.62);
  world.add(boardTopGlow);

  addWallSign(makeSign('ELIMINATION DRILL', 'HEADSHOT x1 // BODY x3 // SEMI-AUTO', '#ff7a45'), 3.6, 1.12, 0, 2.55, -17.62);

  /* ------------------------------------------------------------------ *
   *  Atmospheric dust
   * ------------------------------------------------------------------ */
  {
    const count = 170;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand(-9.3, 9.3);
      pos[i * 3 + 1] = rand(0.5, 5.7);
      pos[i * 3 + 2] = rand(-17.4, 10.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe4bd,
      size: 0.02,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const dust = new THREE.Points(geo, mat);
    dust.frustumCulled = false;
    world.add(dust);
  }

  /* ------------------------------------------------------------------ *
   *  First-person rifle
   * ------------------------------------------------------------------ */
  const gunRoot = new THREE.Group();
  const GUN_BASE = new THREE.Vector3(0.25, -0.235, -0.54);
  const GUN_BASE_ROT = new THREE.Euler(0.025, 0.055, 0.012, 'YXZ');
  gunRoot.position.copy(GUN_BASE);
  gunRoot.rotation.copy(GUN_BASE_ROT);
  gunRoot.scale.setScalar(0.86);
  camera.add(gunRoot);

  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x3d4447, metalness: 0.76, roughness: 0.38 });
  const gunMetalDark = new THREE.MeshStandardMaterial({ color: 0x23292b, metalness: 0.7, roughness: 0.48 });
  const gunBarrel = new THREE.MeshStandardMaterial({ color: 0x7e8588, metalness: 0.92, roughness: 0.26 });
  const gunWood = new THREE.MeshStandardMaterial({ color: 0x714a2b, metalness: 0.06, roughness: 0.62 });
  const gunAccent = new THREE.MeshStandardMaterial({ color: 0xff7a45, emissive: 0x5e1804, emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.45 });

  function gunPart(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    gunRoot.add(mesh);
    return mesh;
  }

  gunPart(new THREE.BoxGeometry(0.078, 0.1, 0.4), gunMetal, 0, 0, -0.1);
  gunPart(new THREE.BoxGeometry(0.064, 0.078, 0.33), gunWood, 0, 0.006, -0.42);
  gunPart(new THREE.CylinderGeometry(0.016, 0.016, 0.36, 12), gunBarrel, 0, 0.018, -0.67, Math.PI / 2);
  gunPart(new THREE.CylinderGeometry(0.024, 0.024, 0.08, 12), gunMetalDark, 0, 0.018, -0.87, Math.PI / 2);
  gunPart(new THREE.BoxGeometry(0.058, 0.092, 0.21), gunWood, 0, -0.014, 0.19);
  gunPart(new THREE.BoxGeometry(0.064, 0.12, 0.035), gunMetalDark, 0, -0.014, 0.305);
  gunPart(new THREE.BoxGeometry(0.052, 0.155, 0.075), gunMetalDark, 0, -0.098, -0.015, 0.18);
  gunPart(new THREE.BoxGeometry(0.05, 0.16, 0.1), gunMetalDark, 0, -0.1, -0.17, -0.12);
  gunPart(new THREE.BoxGeometry(0.036, 0.014, 0.31), gunMetal, 0, 0.063, -0.16);
  gunPart(new THREE.BoxGeometry(0.032, 0.046, 0.035), gunMetalDark, 0, 0.092, 0.015);
  gunPart(new THREE.BoxGeometry(0.028, 0.038, 0.026), gunMetalDark, 0, 0.09, -0.28);
  gunPart(new THREE.BoxGeometry(0.004, 0.022, 0.15), gunAccent, -0.041, 0.014, -0.11);
  gunPart(new THREE.BoxGeometry(0.02, 0.012, 0.02), gunAccent, 0, 0.116, 0.015);

  const muzzleCanvas = document.createElement('canvas');
  muzzleCanvas.width = muzzleCanvas.height = 128;
  {
    const ctx = muzzleCanvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,236,1)');
    g.addColorStop(0.18, 'rgba(255,220,150,.95)');
    g.addColorStop(0.46, 'rgba(255,133,62,.65)');
    g.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(255,241,200,.9)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate((i / 6) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(60, 0);
      ctx.stroke();
      ctx.restore();
    }
  }
  const muzzleTex = new THREE.CanvasTexture(muzzleCanvas);
  muzzleTex.colorSpace = THREE.SRGBColorSpace;
  const muzzleMat = new THREE.SpriteMaterial({
    map: muzzleTex,
    color: 0xffd49a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  const muzzleFlash = new THREE.Sprite(muzzleMat);
  muzzleFlash.position.set(0, 0.018, -0.94);
  muzzleFlash.scale.set(0.28, 0.28, 1);
  muzzleFlash.visible = false;
  muzzleFlash.renderOrder = 20;
  gunRoot.add(muzzleFlash);

  const muzzleLight = new THREE.PointLight(0xffb16a, 0, 3.2, 2);
  muzzleLight.position.set(0, 0.02, -0.9);
  gunRoot.add(muzzleLight);

  const viewLight = new THREE.PointLight(0xffdfc0, 0.5, 2.4, 2);
  viewLight.position.set(0.28, 0.02, -0.45);
  camera.add(viewLight);

  let recoil = 0;
  let recoilVel = 0;
  let fovKick = 0;
  let flashTimer = 0;
  let gunSwayX = 0;

  function kickWeapon() {
    recoil = Math.min(1.35, recoil + 0.82);
    recoilVel = 0;
    fovKick = 1;
    flashTimer = 0.05;
    muzzleFlash.visible = true;
    muzzleFlash.material.rotation = rand(0, Math.PI * 2);
    muzzleLight.intensity = 5.5;
  }

  function updateWeapon(dt, time) {
    recoilVel += (-165 * recoil - 23 * recoilVel) * dt;
    recoil += recoilVel * dt;
    if (Math.abs(recoil) < 0.0002 && Math.abs(recoilVel) < 0.002) {
      recoil = 0;
      recoilVel = 0;
    }

    gunSwayX += ((-strafeVel * 0.00065) - gunSwayX) * Math.min(1, dt * 8);
    const swayY = Math.sin(time * 1.35) * 0.0022;

    gunRoot.position.set(
      GUN_BASE.x + gunSwayX + Math.sin(time * 0.9) * 0.0016,
      GUN_BASE.y + recoil * 0.018 + swayY,
      GUN_BASE.z + recoil * 0.058
    );
    gunRoot.rotation.set(
      GUN_BASE_ROT.x + recoil * 0.105,
      GUN_BASE_ROT.y - gunSwayX * 0.7,
      GUN_BASE_ROT.z + recoil * 0.028
    );

    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) {
        muzzleFlash.visible = false;
        muzzleLight.intensity = 0;
      } else {
        muzzleLight.intensity = 5.5 * (flashTimer / 0.05);
      }
    }

    if (fovKick > 0) {
      fovKick = Math.max(0, fovKick - dt * 7.5);
      camera.fov = BASE_FOV + fovKick * 1.15;
      camera.updateProjectionMatrix();
    }
  }

  /* ------------------------------------------------------------------ *
   *  Sparks / particle bursts
   * ------------------------------------------------------------------ */
  const MAX_PARTS = 280;
  const pPositions = new Float32Array(MAX_PARTS * 3);
  const pColors = new Float32Array(MAX_PARTS * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setDrawRange(0, 0);
  const pMat = new THREE.PointsMaterial({
    size: 0.065,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const particleField = new THREE.Points(pGeo, pMat);
  particleField.frustumCulled = false;
  scene.add(particleField);
  const particles = [];

  function spawnBurst(position, palette, count, power = 3) {
    for (let i = 0; i < count; i++) {
      const color = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      const life = rand(0.35, 0.95);
      particles.push({
        pos: new THREE.Vector3(
          position.x + rand(-0.09, 0.09),
          position.y + rand(-0.09, 0.09),
          position.z + rand(-0.09, 0.09)
        ),
        vel: new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.35), rand(-1, 1)).normalize().multiplyScalar(rand(0.9, power)),
        life,
        maxLife: life,
        color,
        gravity: 4.2,
        size: rand(0.7, 1.5)
      });
    }
    if (particles.length > MAX_PARTS) particles.splice(0, particles.length - MAX_PARTS);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
    }

    const count = Math.min(particles.length, MAX_PARTS);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const fade = Math.max(0, p.life / p.maxLife);
      pPositions[i * 3] = p.pos.x;
      pPositions[i * 3 + 1] = p.pos.y;
      pPositions[i * 3 + 2] = p.pos.z;
      pColors[i * 3] = p.color.r * fade;
      pColors[i * 3 + 1] = p.color.g * fade;
      pColors[i * 3 + 2] = p.color.b * fade;
    }
    pGeo.setDrawRange(0, count);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ *
   *  Robot targets
   * ------------------------------------------------------------------ */
  const SLOT_X = [-5.7, -1.9, 1.9, 5.7];
  const SLOT_Z = [-3.2, -7.8, -12.6];
  const SLOTS = [];
  for (let row = 0; row < SLOT_Z.length; row++) {
    for (let col = 0; col < SLOT_X.length; col++) {
      SLOTS.push({ index: row * SLOT_X.length + col, x: SLOT_X[col], z: SLOT_Z[row] });
    }
  }

  const botGeos = {
    torso: new THREE.CapsuleGeometry(0.235, 0.42, 6, 14),
    hip: new THREE.BoxGeometry(0.32, 0.17, 0.25),
    leg: new THREE.CapsuleGeometry(0.085, 0.5, 4, 10),
    boot: new THREE.BoxGeometry(0.17, 0.13, 0.3),
    shoulder: new THREE.SphereGeometry(0.12, 12, 10),
    arm: new THREE.CapsuleGeometry(0.068, 0.37, 4, 10),
    neck: new THREE.CylinderGeometry(0.055, 0.06, 0.09, 10),
    head: new THREE.SphereGeometry(0.195, 20, 16),
    visor: new THREE.BoxGeometry(0.28, 0.062, 0.08),
    eye: new THREE.BoxGeometry(0.18, 0.014, 0.02),
    chestPlate: new THREE.BoxGeometry(0.34, 0.32, 0.07),
    target: new THREE.CircleGeometry(0.155, 28),
    targetRing: new THREE.TorusGeometry(0.16, 0.012, 6, 28),
    targetCore: new THREE.CircleGeometry(0.052, 18),
    pip: new THREE.CylinderGeometry(0.021, 0.021, 0.012, 10),
    antenna: new THREE.CylinderGeometry(0.006, 0.006, 0.13, 6),
    antennaTip: new THREE.SphereGeometry(0.014, 8, 6),
    shadow: new THREE.CircleGeometry(0.38, 22),
    headHit: new THREE.SphereGeometry(0.28, 8, 6),
    bodyHit: new THREE.BoxGeometry(0.62, 1.5, 0.42)
  };

  const botBodyMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.56, metalness: 0.14 });
  const botSuitMat = new THREE.MeshStandardMaterial({ color: 0x303c40, roughness: 0.7, metalness: 0.18 });
  const botDarkMat = new THREE.MeshStandardMaterial({ color: 0x171e21, roughness: 0.66, metalness: 0.35 });
  const botJointMat = new THREE.MeshStandardMaterial({ color: 0x596469, roughness: 0.4, metalness: 0.7 });
  const botAccentMat = new THREE.MeshStandardMaterial({ color: 0xff7a45, emissive: 0x8c2708, emissiveIntensity: 0.8, roughness: 0.4 });
  const botEyeMat = new THREE.MeshBasicMaterial({ color: 0xffb078, toneMapped: false });
  const botTargetMat = new THREE.MeshStandardMaterial({ color: 0xd8d1c2, roughness: 0.5, metalness: 0.1 });
  const botShadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const botHitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });

  function makeBotMesh(geo, mat) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    return mesh;
  }

  function spawnBot(slotIndex) {
    const slot = SLOTS[slotIndex];
    const group = new THREE.Group();
    const x = slot.x + rand(-0.32, 0.32);
    const z = slot.z + rand(-0.45, 0.45);
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(player.position.x - x, player.position.z - z);

    const torso = makeBotMesh(botGeos.torso, botSuitMat);
    torso.position.y = 1.19;
    group.add(torso);

    const hip = makeBotMesh(botGeos.hip, botSuitMat);
    hip.position.y = 0.84;
    group.add(hip);

    [-0.115, 0.115].forEach(px => {
      const leg = makeBotMesh(botGeos.leg, botSuitMat);
      leg.position.set(px, 0.45, 0);
      leg.castShadow = true;
      group.add(leg);

      const boot = makeBotMesh(botGeos.boot, botDarkMat);
      boot.position.set(px, 0.08, 0.045);
      group.add(boot);
    });

    [-0.3, 0.3].forEach(px => {
      const shoulder = makeBotMesh(botGeos.shoulder, botJointMat);
      shoulder.position.set(px, 1.45, 0);
      group.add(shoulder);

      const arm = makeBotMesh(botGeos.arm, botBodyMat);
      arm.position.set(px * 1.12, 1.15, -0.01);
      arm.rotation.z = px > 0 ? -0.08 : 0.08;
      arm.rotation.x = 0.06;
      group.add(arm);
    });

    const neck = makeBotMesh(botGeos.neck, botJointMat);
    neck.position.y = 1.66;
    group.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.y = 1.8;
    const head = makeBotMesh(botGeos.head, botBodyMat);
    headGroup.add(head);

    const visor = makeBotMesh(botGeos.visor, botDarkMat);
    visor.position.set(0, 0.005, 0.135);
    headGroup.add(visor);

    const eye = new THREE.Mesh(botGeos.eye, botEyeMat);
    eye.position.set(0, 0.008, 0.178);
    headGroup.add(eye);

    const antenna = makeBotMesh(botGeos.antenna, botJointMat);
    antenna.position.set(0.1, 0.19, 0);
    headGroup.add(antenna);
    const antennaTip = new THREE.Mesh(botGeos.antennaTip, botAccentMat);
    antennaTip.position.set(0.1, 0.26, 0);
    headGroup.add(antennaTip);
    group.add(headGroup);

    const chestPlate = makeBotMesh(botGeos.chestPlate, botDarkMat);
    chestPlate.position.set(0, 1.28, 0.21);
    group.add(chestPlate);

    const target = new THREE.Mesh(botGeos.target, botTargetMat);
    target.position.set(0, 1.28, 0.255);
    group.add(target);

    const targetRing = new THREE.Mesh(botGeos.targetRing, botAccentMat);
    targetRing.position.set(0, 1.28, 0.259);
    group.add(targetRing);

    const targetCore = new THREE.Mesh(botGeos.targetCore, botAccentMat);
    targetCore.position.set(0, 1.28, 0.262);
    group.add(targetCore);

    const pips = [];
    [-0.08, 0, 0.08].forEach(px => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff9d6e, toneMapped: false });
      const pip = new THREE.Mesh(botGeos.pip, mat);
      pip.rotation.x = Math.PI / 2;
      pip.position.set(px, 1.055, 0.204);
      group.add(pip);
      pips.push(pip);
    });

    const shadow = new THREE.Mesh(botGeos.shadow, botShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    group.add(shadow);

    // Raycast-only hitboxes (invisible to the camera).
    const headHit = new THREE.Mesh(botGeos.headHit, botHitMat);
    headHit.position.y = 1.8;
    group.add(headHit);
    const bodyHit = new THREE.Mesh(botGeos.bodyHit, botHitMat);
    bodyHit.position.y = 0.82;
    group.add(bodyHit);

    const scale = rand(0.94, 1.05);
    group.scale.setScalar(scale);
    world.add(group);

    const bot = {
      group,
      slotIndex,
      hp: BODY_HP,
      pips,
      headHit,
      bodyHit,
      headGroup,
      baseY: 0,
      phase: rand(0, Math.PI * 2)
    };
    headHit.userData.bot = bot;
    headHit.userData.part = 'head';
    bodyHit.userData.bot = bot;
    bodyHit.userData.part = 'body';
    bots.push(bot);
    hitTargets.push(headHit, bodyHit);
    group.updateMatrixWorld(true);

    spawnBurst(new THREE.Vector3(x, 0.55, z), [0x63d7c7, 0xd9d4c8], 9, 2.1);
    return bot;
  }

  function removeBot(bot) {
    const i = bots.indexOf(bot);
    if (i >= 0) bots.splice(i, 1);
    const hi = hitTargets.indexOf(bot.headHit);
    if (hi >= 0) hitTargets.splice(hi, 1);
    const bi = hitTargets.indexOf(bot.bodyHit);
    if (bi >= 0) hitTargets.splice(bi, 1);
    world.remove(bot.group);
    bot.pips.forEach(p => p.material.dispose());
  }

  function refreshPips(bot) {
    bot.pips.forEach((pip, i) => {
      const on = i < bot.hp;
      pip.material.color.setHex(on ? 0xff9d6e : 0x33231c);
    });
  }

  function pickFreeSlot(exclude) {
    const used = new Set(bots.map(b => b.slotIndex));
    const free = SLOTS.filter(s => !used.has(s.index) && s.index !== exclude).map(s => s.index);
    if (!free.length) {
      const fallback = SLOTS.filter(s => !used.has(s.index)).map(s => s.index);
      return fallback[Math.floor(Math.random() * fallback.length)];
    }
    return free[Math.floor(Math.random() * free.length)];
  }

  function resetBots() {
    while (bots.length) removeBot(bots[0]);
    hitTargets.length = 0;
    const pool = SLOTS.map(s => s.index);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < BOT_COUNT; i++) spawnBot(pool[i]);
  }

  function updateBots(dt, time) {
    for (const bot of bots) {
      bot.headGroup.rotation.y = Math.sin(time * 0.62 + bot.phase) * 0.16;
      bot.group.position.y = Math.sin(time * 1.3 + bot.phase) * 0.006;
      const pulse = 0.72 + Math.sin(time * 2.2 + bot.phase) * 0.22;
      botEyeMat.opacity = 1;
      botAccentMat.emissiveIntensity = pulse;
    }
  }

  resetBots();

  /* ------------------------------------------------------------------ *
   *  Synthesised audio (no external assets)
   * ------------------------------------------------------------------ */
  let audioCtx = null;
  let audioMaster = null;
  let noiseBuffer = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioCtx = new AudioCtor();
      audioMaster = audioCtx.createGain();
      audioMaster.gain.value = 0.5;
      const comp = audioCtx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 18;
      comp.ratio.value = 5;
      comp.attack.value = 0.002;
      comp.release.value = 0.16;
      audioMaster.connect(comp);
      comp.connect(audioCtx.destination);

      const length = Math.floor(audioCtx.sampleRate * 0.6);
      noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playNoise(duration, volume, type, frequency, q = 0.8, delay = 0) {
    if (!audioCtx || !noiseBuffer) return;
    const t = audioCtx.currentTime + delay;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audioMaster);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  function playTone(startFreq, endFreq, duration, volume, type = 'sine', delay = 0) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(audioMaster);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function playShot() {
    if (!audioCtx) return;
    playNoise(0.028, 0.24, 'highpass', 3400, 0.7);
    playNoise(0.075, 0.34, 'highpass', 900, 0.8);
    playNoise(0.16, 0.2, 'lowpass', 760, 0.6);
    playTone(158, 58, 0.11, 0.25, 'triangle');
    playTone(1200, 300, 0.025, 0.06, 'square');
  }

  function playBodyHit() {
    playNoise(0.04, 0.14, 'bandpass', 2200, 1.1);
    playTone(240, 150, 0.055, 0.07, 'square');
  }

  function playHeadshot() {
    playTone(1760, 1760, 0.2, 0.11, 'sine');
    playTone(2630, 2350, 0.16, 0.07, 'sine', 0.012);
    playNoise(0.028, 0.1, 'highpass', 5200, 0.8);
  }

  function playKill() {
    playTone(96, 54, 0.16, 0.16, 'triangle');
    playNoise(0.13, 0.11, 'bandpass', 900, 0.7);
  }

  function playFinish() {
    playTone(523, 523, 0.16, 0.08, 'triangle');
    playTone(659, 659, 0.16, 0.08, 'triangle', 0.13);
    playTone(784, 784, 0.3, 0.09, 'triangle', 0.26);
    playTone(1046, 1046, 0.4, 0.06, 'sine', 0.4);
  }

  function playUi() {
    playTone(680, 880, 0.05, 0.035, 'square');
  }

  /* ------------------------------------------------------------------ *
   *  Session state
   * ------------------------------------------------------------------ */
  const run = {
    mode: 'qualification',
    kills: 0,
    headshots: 0,
    hits: 0,
    shots: 0,
    elapsed: 0,
    running: false,
    startStamp: 0,
    bestBeaten: false
  };
  let phase = 'menu';
  let lastBoardDraw = 0;
  let feedbackTimer = 0;
  let hitmarkerTimer = 0;
  const keys = { left: false, right: false };

  function getElapsedSeconds() {
    return run.elapsed + (run.running ? (performance.now() - run.startStamp) / 1000 : 0);
  }

  function resetRun(mode) {
    run.mode = mode;
    run.kills = 0;
    run.headshots = 0;
    run.hits = 0;
    run.shots = 0;
    run.elapsed = 0;
    run.running = false;
    run.startStamp = 0;
    run.bestBeaten = false;
    updateHud();
    updateBoard(true);
  }

  function updateHud() {
    if (run.mode === 'qualification') {
      dom.hudMode.textContent = 'QUALIFICATION';
      dom.hudGoal.textContent = `TARGET 100 // REMAIN ${pad3(Math.max(0, TARGET_KILLS - run.kills))}`;
    } else {
      dom.hudMode.textContent = 'PRACTICE';
      dom.hudGoal.textContent = `FREE FIRE // KILLS ${pad3(run.kills)}`;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Wall scoreboard drawing
   * ------------------------------------------------------------------ */
  function drawBoard(now) {
    const elapsed = (phase === 'menu' || phase === 'starting') ? 0 :
      (phase === 'running' ? getElapsedSeconds() : run.elapsed);
    const sig = `${phase}|${run.mode}|${elapsed.toFixed(1)}|${run.kills}|${run.headshots}|${run.shots}`;
    if (sig === boardSig) return;
    boardSig = sig;

    const W = boardCanvas.width;
    const H = boardCanvas.height;
    const ctx = boardCtx;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0c1b20');
    bg.addColorStop(0.55, '#081114');
    bg.addColorStop(1, '#101d20');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(250, 170, 20, 250, 170, 430);
    glow.addColorStop(0, 'rgba(99,215,199,.075)');
    glow.addColorStop(1, 'rgba(99,215,199,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(236,231,220,.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(17, 17, W - 34, H - 34);

    ctx.fillStyle = '#ff7a45';
    ctx.fillRect(38, 33, 62, 4);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(236,231,220,.54)';
    ctx.font = '400 21px "Share Tech Mono", monospace';
    ctx.fillText('AIM LAB  //  LIVE RANGE TELEMETRY', 38, 60);

    let modeLabel = 'STANDBY';
    if (phase === 'running') modeLabel = run.mode === 'qualification' ? 'QUALIFICATION' : 'PRACTICE';
    else if (phase === 'paused') modeLabel = 'PAUSED';
    else if (phase === 'resuming') modeLabel = 'LOCKING IN';
    else if (phase === 'results') modeLabel = 'COURSE CLEAR';
    else if (phase === 'starting') modeLabel = 'STANDBY';

    ctx.textAlign = 'right';
    ctx.font = '600 27px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillStyle = phase === 'paused' ? '#ff7a45' : '#63d7c7';
    ctx.fillText(modeLabel, W - 38, 59);

    ctx.strokeStyle = 'rgba(236,231,220,.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(38, 86);
    ctx.lineTo(W - 38, 86);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(236,231,220,.46)';
    ctx.font = '400 20px "Share Tech Mono", monospace';
    ctx.fillText('ELAPSED TIME', 40, 113);
    ctx.fillText('ELIMINATIONS', 700, 113);

    ctx.fillStyle = '#ece7dc';
    ctx.font = '600 118px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(formatTime(elapsed, 1), 34, 203);

    ctx.save();
    ctx.shadowColor = 'rgba(255,122,69,.42)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff9b6a';
    ctx.font = '600 138px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(pad3(run.kills), 696, 198);
    ctx.restore();

    if (run.mode === 'qualification' || phase === 'menu') {
      ctx.fillStyle = 'rgba(236,231,220,.42)';
      ctx.font = '400 24px "Share Tech Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('/ 100', W - 38, 224);
    }

    ctx.strokeStyle = 'rgba(236,231,220,.12)';
    ctx.beginPath();
    ctx.moveTo(628, 105);
    ctx.lineTo(628, 264);
    ctx.stroke();

    const hsRate = run.kills ? (run.headshots / run.kills) * 100 : 0;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(236,231,220,.43)';
    ctx.font = '400 19px "Share Tech Mono", monospace';

    let leftNote = 'AWAITING OPERATIVE // SELECT A DRILL';
    if (phase === 'running') {
      leftNote = run.mode === 'qualification'
        ? `REMAIN ${pad3(Math.max(0, TARGET_KILLS - run.kills))} // TARGET 100`
        : 'FREE FIRE // UNLIMITED';
    } else if (phase === 'paused') {
      leftNote = 'SESSION ON HOLD // RESUME WHEN READY';
    } else if (phase === 'resuming') {
      leftNote = 'RE-ACQUIRING POINTER LOCK';
    } else if (phase === 'results') {
      leftNote = 'DRILL COMPLETE // COURSE CLEAR';
    } else if (phase === 'starting') {
      leftNote = 'LOCKING OPERATIVE';
    }
    ctx.fillText(leftNote, 40, 291);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(99,215,199,.7)';
    ctx.fillText(`HEADSHOT ${hsRate.toFixed(1)}%`, W - 40, 291);

    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255,122,69,.85)';
    ctx.fillRect(38, H - 31, 6, 6);
    ctx.fillStyle = 'rgba(236,231,220,.3)';
    ctx.font = '400 14px "Share Tech Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('RANGE 07 // SEMI-AUTO ONLY', W - 38, H - 27);

    boardTex.needsUpdate = true;
    lastBoardDraw = now || performance.now();
  }

  function updateBoard(force) {
    if (force) boardSig = '';
    drawBoard(performance.now());
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => updateBoard(true));
  }

  /* ------------------------------------------------------------------ *
   *  Shooting & feedback
   * ------------------------------------------------------------------ */
  const raycaster = new THREE.Raycaster();
  const centerAim = new THREE.Vector2(0, 0);
  const tmpTarget = new THREE.Vector3();
  let feedbackTimerId = 0;
  let hitmarkerTimerId = 0;
  let flashTimerId = 0;

  function showFeedback(text, headshot) {
    dom.feedback.textContent = text;
    dom.feedback.classList.remove('show', 'headshot');
    void dom.feedback.offsetWidth;
    dom.feedback.classList.add('show');
    if (headshot) dom.feedback.classList.add('headshot');
    clearTimeout(feedbackTimerId);
    feedbackTimerId = setTimeout(() => {
      dom.feedback.classList.remove('show', 'headshot');
    }, 780);
  }

  function showHitmarker(kind) {
    dom.hitmarker.classList.remove('show', 'headshot', 'kill');
    void dom.hitmarker.offsetWidth;
    if (kind === 'headshot') dom.hitmarker.classList.add('headshot');
    else if (kind === 'kill') dom.hitmarker.classList.add('kill');
    dom.hitmarker.classList.add('show');
    clearTimeout(hitmarkerTimerId);
    hitmarkerTimerId = setTimeout(() => {
      dom.hitmarker.classList.remove('show', 'headshot', 'kill');
    }, 280);
  }

  function flashScreen() {
    dom.hitFlash.classList.remove('flash');
    void dom.hitFlash.offsetWidth;
    dom.hitFlash.classList.add('flash');
    clearTimeout(flashTimerId);
    flashTimerId = setTimeout(() => dom.hitFlash.classList.remove('flash'), 320);
  }

  function killBot(bot, headshot) {
    const slot = bot.slotIndex;
    const burstAt = new THREE.Vector3(bot.group.position.x, 1.25, bot.group.position.z);
    removeBot(bot);
    spawnBurst(
      burstAt,
      headshot ? [0xffd27a, 0xff8a4f, 0xfff1d2] : [0x63d7c7, 0xff9d6e, 0xd9d4c8],
      headshot ? 26 : 17,
      headshot ? 4.4 : 3.4
    );
    playKill();
    run.kills += 1;
    updateHud();
    updateBoard(true);

    if (run.mode === 'qualification' && run.kills >= TARGET_KILLS) {
      showHitmarker('kill');
      finishRun();
      return;
    }

    const nextSlot = pickFreeSlot(slot);
    if (nextSlot !== undefined) spawnBot(nextSlot);
  }

  function applyHit(bot, part, point) {
    if (phase !== 'running' || !bots.includes(bot)) return;
    run.hits += 1;

    if (part === 'head') {
      run.headshots += 1;
      playHeadshot();
      showHitmarker('headshot');
      showFeedback('HEADSHOT', true);
      flashScreen();
      spawnBurst(point, [0xffd27a, 0xff8a4f, 0xfff3dc, 0x63d7c7], 22, 4.1);
      killBot(bot, true);
      return;
    }

    bot.hp -= 1;
    if (bot.hp <= 0) {
      showHitmarker('kill');
      showFeedback('TARGET DOWN', false);
      spawnBurst(point, [0x63d7c7, 0xd9d4c8, 0xff7a45], 13, 3.2);
      killBot(bot, false);
      return;
    }

    refreshPips(bot);
    playBodyHit();
    showHitmarker('body');
    showFeedback(`ARMOR ${bot.hp} / ${BODY_HP}`, false);
    spawnBurst(point, [0x63d7c7, 0x9fb0ad, 0xff7a45], 9, 2.6);
  }

  function fireShot() {
    if (phase !== 'running') return;
    run.shots += 1;
    ensureAudio();
    playShot();
    kickWeapon();

    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(centerAim, camera);
    const obstacles = hitTargets.concat(occluders);
    const intersections = raycaster.intersectObjects(obstacles, false);
    const first = intersections[0];

    if (first) {
      if (first.object.userData.bot) {
        applyHit(first.object.userData.bot, first.object.userData.part, first.point);
      } else {
        spawnBurst(first.point, [0xd9c4a0, 0x8f7a5c, 0xb3a084], 7, 2.3);
      }
    }

    updateHud();
    updateBoard(false);
  }

  /* ------------------------------------------------------------------ *
   *  Pointer lock & session flow
   * ------------------------------------------------------------------ */
  function requestPointerLock() {
    try {
      const promise = dom.canvas.requestPointerLock();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(handleLockFailure);
      }
    } catch (err) {
      handleLockFailure();
    }
  }

  function handleLockFailure() {
    if (phase === 'starting') {
      phase = 'menu';
      dom.hud.classList.add('is-hidden');
      dom.menu.classList.remove('is-hidden');
      dom.rangeStatus.textContent = 'POINTER LOCK 失敗 // 請點擊畫面或改用 Chrome / Edge';
      updateBoard(true);
    } else if (phase === 'resuming') {
      phase = 'paused';
      dom.pause.classList.remove('is-hidden');
      const hint = dom.pause.querySelector('.sheet-hint');
      if (hint) hint.textContent = '無法鎖定滑鼠。請再按一次「繼續訓練」，或按 Esc 後重新進入。';
      updateBoard(true);
    }
  }

  function enterRunning() {
    phase = 'running';
    run.running = true;
    run.startStamp = performance.now();
    updateHud();
    updateBoard(true);
  }

  function startRun(mode) {
    ensureAudio();
    playUi();
    resetRun(mode);
    resetBots();
    boardSig = '';
    dom.menu.classList.add('is-hidden');
    dom.pause.classList.add('is-hidden');
    dom.results.classList.add('is-hidden');
    dom.hud.classList.remove('is-hidden');
    dom.hud.setAttribute('aria-hidden', 'false');
    dom.rangeStatus.textContent = '';
    phase = 'starting';
    updateHud();
    updateBoard(true);
    requestPointerLock();
  }

  function pauseRun() {
    if (phase !== 'running') return;
    run.elapsed = getElapsedSeconds();
    run.running = false;
    run.startStamp = 0;
    phase = 'paused';
    keys.left = false;
    keys.right = false;
    strafeVel = 0;

    dom.pauseTime.textContent = formatTime(run.elapsed, 1);
    dom.pauseKills.textContent = pad3(run.kills);
    dom.pauseHs.textContent = run.kills ? `${Math.round((run.headshots / run.kills) * 100)}%` : '0%';
    dom.pause.classList.remove('is-hidden');
    updateBoard(true);

    if (document.pointerLockElement) document.exitPointerLock();
  }

  function resumeRun() {
    if (phase !== 'paused') return;
    ensureAudio();
    playUi();
    dom.pause.classList.add('is-hidden');
    phase = 'resuming';
    updateBoard(true);
    requestPointerLock();
  }

  function quitToMenu() {
    if (document.pointerLockElement) document.exitPointerLock();
    run.running = false;
    run.startStamp = 0;
    phase = 'menu';
    keys.left = false;
    keys.right = false;
    strafeVel = 0;
    run.mode = 'qualification';
    run.kills = 0;
    run.headshots = 0;
    run.hits = 0;
    run.shots = 0;
    run.elapsed = 0;
    resetBots();
    resetRun('qualification');
    dom.menu.classList.remove('is-hidden');
    dom.pause.classList.add('is-hidden');
    dom.results.classList.add('is-hidden');
    dom.error.classList.add('is-hidden');
    dom.hud.classList.add('is-hidden');
    dom.hud.setAttribute('aria-hidden', 'true');
    dom.rangeStatus.textContent = '場地已重置 // 7 個目標就位';
    updateHud();
    updateBoard(true);
  }

  function finishRun() {
    run.elapsed = getElapsedSeconds();
    run.running = false;
    run.startStamp = 0;
    phase = 'results';
    if (document.pointerLockElement) document.exitPointerLock();

    const hsRate = run.kills ? Math.round((run.headshots / run.kills) * 100) : 0;
    const accuracy = run.shots ? Math.round((run.hits / run.shots) * 100) : 0;

    dom.resultTime.textContent = formatTime(run.elapsed, 2);
    dom.resultHs.textContent = `${hsRate}%`;
    dom.resultAcc.textContent = `${accuracy}%`;
    dom.resultShots.textContent = String(run.shots);

    let newBest = false;
    if (run.mode === 'qualification') {
      if (!bestTime || run.elapsed < bestTime) {
        bestTime = run.elapsed;
        newBest = true;
        try { localStorage.setItem(BEST_KEY, String(bestTime)); } catch (err) { /* storage may be unavailable */ }
      }
      dom.bestTime.textContent = formatTime(bestTime, 2);
    }
    dom.newBest.hidden = !newBest;
    dom.rangeStatus.textContent = `最佳 100 殺：${formatTime(bestTime, 2)}`;

    updateHud();
    updateBoard(true);
    playFinish();

    setTimeout(() => {
      if (phase === 'results') dom.results.classList.remove('is-hidden');
    }, 420);
  }

  /* ------------------------------------------------------------------ *
   *  Input
   * ------------------------------------------------------------------ */
  function onPointerLockChange() {
    const locked = document.pointerLockElement === dom.canvas;
    if (locked) {
      if (phase === 'starting' || phase === 'resuming') enterRunning();
      return;
    }
    if (phase === 'running') pauseRun();
  }

  function onMouseMove(event) {
    if (phase !== 'running' || document.pointerLockElement !== dom.canvas) return;
    yaw -= event.movementX * 0.00215;
    pitch -= event.movementY * 0.00215;
    pitch = clamp(pitch, -1.12, 1.02);
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    if (phase !== 'running') return;
    if (document.pointerLockElement !== dom.canvas) return;
    event.preventDefault();
    // Strictly semi-auto: one mousedown -> one shot. No auto-fire loop,
    // no `buttons` polling, no mouseup follow-up.
    fireShot();
  }

  function onKeyDown(event) {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') keys.left = true;
    else if (event.code === 'KeyD' || event.code === 'ArrowRight') keys.right = true;
  }

  function onKeyUp(event) {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') keys.left = false;
    else if (event.code === 'KeyD' || event.code === 'ArrowRight') keys.right = false;
  }

  function onPointerLockError() {
    handleLockFailure();
  }

  function onVisibilityChange() {
    if (document.hidden && phase === 'running') pauseRun();
  }

  function onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', onPointerLockError);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibilityChange);
  dom.canvas.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('resize', onResize);

  dom.startQual.addEventListener('click', () => startRun('qualification'));
  dom.startPractice.addEventListener('click', () => startRun('practice'));
  dom.resumeBtn.addEventListener('click', resumeRun);
  dom.restartBtn.addEventListener('click', () => startRun(run.mode));
  dom.quitBtn.addEventListener('click', quitToMenu);
  dom.retryBtn.addEventListener('click', () => startRun(run.mode));
  dom.resultMenuBtn.addEventListener('click', quitToMenu);

  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    dom.touchWarning.hidden = false;
  }

  dom.rangeStatus.textContent = 'READY // 7 個目標已部署，選擇模式開始';

  /* ------------------------------------------------------------------ *
   *  Player movement & animation loop
   * ------------------------------------------------------------------ */
  const STRAFE_SPEED = 2.35;
  const STRAFE_LIMIT = 2.25;
  let strafeMoveVel = 0;

  function updatePlayer(dt) {
    const input = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const target = input * STRAFE_SPEED;
    strafeMoveVel += (target - strafeMoveVel) * Math.min(1, dt * 9.5);
    if (Math.abs(strafeMoveVel) < 0.002) strafeMoveVel = 0;

    player.position.x += strafeMoveVel * dt;
    if (player.position.x > STRAFE_LIMIT) {
      player.position.x = STRAFE_LIMIT;
      strafeMoveVel = 0;
    } else if (player.position.x < -STRAFE_LIMIT) {
      player.position.x = -STRAFE_LIMIT;
      strafeMoveVel = 0;
    }

    strafeVel = strafeMoveVel * 20;
  }

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    if (phase === 'running') {
      updatePlayer(dt);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      camera.position.y = EYE_HEIGHT + Math.sin(time * 7.4) * 0.009 * Math.min(1, Math.abs(strafeMoveVel) / STRAFE_SPEED);
    } else {
      strafeVel *= Math.max(0, 1 - dt * 6);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      camera.position.y = EYE_HEIGHT;
    }

    updateBots(dt, time);
    updateWeapon(dt, time);
    updateParticles(dt);
    updateBoard(false);
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------------ *
   *  Debug API (?debug=1) — used by automated browser tests
   * ------------------------------------------------------------------ */
  if (isDebug) {
    window.__AIMLAB = {
      start(mode = 'qualification') {
        ensureAudio();
        phase = 'running';
        run.mode = mode === 'practice' ? 'practice' : 'qualification';
        run.kills = 0;
        run.headshots = 0;
        run.hits = 0;
        run.shots = 0;
        run.elapsed = 0;
        run.running = true;
        run.startStamp = performance.now();
        resetBots();
        dom.menu.classList.add('is-hidden');
        dom.pause.classList.add('is-hidden');
        dom.results.classList.add('is-hidden');
        dom.hud.classList.remove('is-hidden');
        dom.hud.setAttribute('aria-hidden', 'false');
        updateHud();
        updateBoard(true);
        return this.state();
      },
      hit(part = 'head', times = 1) {
        for (let i = 0; i < times; i++) {
          if (phase !== 'running' || !bots.length) break;
          const target = bots[0];
          applyHit(target, part === 'body' ? 'body' : 'head', new THREE.Vector3(
            target.group.position.x,
            part === 'body' ? 1.2 : 1.8,
            target.group.position.z
          ));
        }
        return this.state();
      },
      aimAt(index = 0, part = 'head') {
        const bot = bots[index];
        if (!bot) return false;
        tmpTarget.set(0, part === 'body' ? 1.15 : 1.8, 0);
        bot.group.localToWorld(tmpTarget);
        const origin = new THREE.Vector3(player.position.x, EYE_HEIGHT, player.position.z);
        const dir = tmpTarget.clone().sub(origin).normalize();
        yaw = Math.atan2(-dir.x, -dir.z);
        pitch = Math.asin(clamp(dir.y, -1, 1));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        camera.updateMatrixWorld(true);
        return true;
      },
      fire() {
        fireShot();
        return this.state();
      },
      aimFire(part = 'head', index = 0) {
        if (!this.aimAt(index, part)) return this.state();
        fireShot();
        return this.state();
      },
      pause() { pauseRun(); return this.state(); },
      resume() {
        if (phase !== 'paused') return this.state();
        phase = 'running';
        run.running = true;
        run.startStamp = performance.now();
        dom.pause.classList.add('is-hidden');
        updateBoard(true);
        return this.state();
      },
      quit() { quitToMenu(); return this.state(); },
      finish() { if (phase === 'running') finishRun(); return this.state(); },
      state() {
        return {
          phase,
          mode: run.mode,
          kills: run.kills,
          headshots: run.headshots,
          hits: run.hits,
          shots: run.shots,
          elapsed: Number(getElapsedSeconds().toFixed(2)),
          bots: bots.length,
          targetKills: TARGET_KILLS,
          bestTime,
          resultsVisible: !dom.results.classList.contains('is-hidden'),
          hudVisible: !dom.hud.classList.contains('is-hidden'),
          menuVisible: !dom.menu.classList.contains('is-hidden'),
          pointerLocked: document.pointerLockElement === dom.canvas
        };
      }
    };
  }

  /* ------------------------------------------------------------------ *
   *  Boot
   * ------------------------------------------------------------------ */
  resetRun('qualification');
  updateHud();
  updateBoard(true);
  dom.hud.setAttribute('aria-hidden', 'true');
  animate();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => updateBoard(true));
  }
})();
