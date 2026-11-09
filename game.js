'use strict';

/* ============================================================
 * Caminhando pelo Circuito — visão em primeira pessoa
 * Circuito em escada com 3 malhas, 8 resistores e 2 fontes.
 *
 *   A ──R1── B ──R2── C ──R3── D
 *   │        │        │        │
 *   V1       R4       R5       V2
 *   │        │        │        │
 *   E ──R6── F ──R7── G ──R8── H
 *
 * V1 = 100 V (polo + em A)   V2 = 70 V (polo + em D)
 * ============================================================ */

// Posições no esquema (usadas no minimapa); o mundo 3D usa x/10 e z = -y/10.
const NODES = {
  A: { x: 100, y: 80 },  B: { x: 340, y: 80 },  C: { x: 580, y: 80 },  D: { x: 820, y: 80 },
  E: { x: 100, y: 340 }, F: { x: 340, y: 340 }, G: { x: 580, y: 340 }, H: { x: 820, y: 340 },
};

// Em fontes, "a" é o polo negativo e "b" o polo positivo.
const BRANCHES = [
  { id: 'V1', type: 'src', a: 'E', b: 'A', V: 100 },
  { id: 'V2', type: 'src', a: 'H', b: 'D', V: 70 },
  { id: 'R1', type: 'res', a: 'A', b: 'B', R: 10 },
  { id: 'R2', type: 'res', a: 'B', b: 'C', R: 20 },
  { id: 'R3', type: 'res', a: 'C', b: 'D', R: 10 },
  { id: 'R4', type: 'res', a: 'B', b: 'F', R: 30 },
  { id: 'R5', type: 'res', a: 'C', b: 'G', R: 40 },
  { id: 'R6', type: 'res', a: 'F', b: 'E', R: 5 },
  { id: 'R7', type: 'res', a: 'G', b: 'F', R: 15 },
  { id: 'R8', type: 'res', a: 'H', b: 'G', R: 5 },
];
const BY_ID = Object.fromEntries(BRANCHES.map(b => [b.id, b]));

/* ---------- Física: análise de malhas ---------- */

function solveLinear(M, rhs) {
  const n = rhs.length;
  const A = M.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j <= n; j++) A[r][j] -= k * A[c][j];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

function solveCircuit() {
  const R = id => BY_ID[id].R;
  const V1 = BY_ID.V1.V, V2 = BY_ID.V2.V;
  // Correntes de malha no sentido horário: i1 (esquerda), i2 (meio), i3 (direita).
  const [i1, i2, i3] = solveLinear(
    [
      [R('R1') + R('R4') + R('R6'), -R('R4'), 0],
      [-R('R4'), R('R2') + R('R5') + R('R7') + R('R4'), -R('R5')],
      [0, -R('R5'), R('R3') + R('R8') + R('R5')],
    ],
    [V1, 0, -V2]
  );
  // Corrente de cada ramo no sentido a → b.
  const I = {
    V1: i1, V2: -i3, R1: i1, R2: i2, R3: i3,
    R4: i1 - i2, R5: i2 - i3, R6: i1, R7: i2, R8: i3,
  };
  // Potenciais dos nós, com E como referência (0 V).
  const pot = { E: 0 };
  pot.A = pot.E + V1;
  pot.B = pot.A - R('R1') * i1;
  pot.C = pot.B - R('R2') * i2;
  pot.D = pot.C - R('R3') * i3;
  pot.F = pot.E + R('R6') * i1;
  pot.G = pot.F + R('R7') * i2;
  pot.H = pot.G + R('R8') * i3;
  return { I, pot };
}

const SOL = solveCircuit();

/* ---------- Utilidades ---------- */

const fmt = (x, d = 2) => {
  const s = (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d);
  return s.replace('.', ',').replace('-', '−');
};
const signed = x => (x >= 0 ? '+' : '') + fmt(x);
const other = (br, node) => (br.a === node ? br.b : br.a);
const branchesAt = node => BRANCHES.filter(b => b.a === node || b.b === node);
const valueLabel = br => (br.type === 'src' ? `${br.V} V` : `${br.R} Ω`);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = t => t * t * (3 - 2 * t);

/** Corrente (com sinal) que SAI do nó pelo ramo. */
const currentLeaving = (br, node) => (br.a === node ? SOL.I[br.id] : -SOL.I[br.id]);

/* ---------- Mundo 3D ---------- */

const WORLD = {};                       // nó -> {x, z}  (z cresce para o "norte" do esquema)
for (const [n, p] of Object.entries(NODES)) WORLD[n] = { x: p.x / 10, z: -p.y / 10 };

const EYE = 5;                          // altura dos olhos acima do fio
const NEAR = 0.3;

for (const br of BRANCHES) {
  const a = WORLD[br.a], b = WORLD[br.b];
  br.len = Math.hypot(b.x - a.x, b.z - a.z);
  br.u = { x: (b.x - a.x) / br.len, z: (b.z - a.z) / br.len };     // sentido a → b
  br.mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  br.half = br.type === 'src' ? 5 : 4;                              // meio comprimento do corpo
  br.rad = br.type === 'src' ? 1.6 : 1.0;                           // raio do corpo
}

/** Ângulo (yaw) para olhar de um nó para outro. 0 = norte, +90° = leste. */
const heading = (from, to) => Math.atan2(WORLD[to].x - WORLD[from].x, WORLD[to].z - WORLD[from].z);

/** Ponto onde a carga para diante do componente, vindo do nó `from`. */
function stopPoint(br, from) {
  const stop = br.half + 7, s = br.a === from ? -stop : stop;
  return { x: br.mid.x + br.u.x * s, z: br.mid.z + br.u.z * s };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = k => Math.round(clamp(((n >> k) & 255) * f, 0, 255));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// Código de cores dos resistores (faixas reais para cada valor).
const CODE = ['#1b1b1b', '#7a4a21', '#d62828', '#f08c00', '#ffd43b',
              '#2f9e44', '#1c7ed6', '#9c36b5', '#868e96', '#f8f9fa'];
const GOLD = '#d4af37';
function bandColors(R) {
  if (R < 10) return [CODE[R], CODE[0], GOLD];
  const s = String(R);
  return [CODE[+s[0]], CODE[+s[1]], CODE[s.length - 2]];
}

function segmentsFor(br) {
  if (br.type === 'src') {
    return [[-5, -4.2, '#aab4c0'], [-4.2, 2.6, '#27456e'], [2.6, 3, '#e8e8e8'], [3, 5, '#c0392b']];
  }
  const body = '#d9b77e', [c1, c2, c3] = bandColors(br.R);
  return [
    [-4, -2.9, body], [-2.9, -2.2, c1], [-2.2, -1.5, body], [-1.5, -0.8, c2], [-0.8, -0.1, body],
    [-0.1, 0.6, c3], [0.6, 2.3, body], [2.3, 3, GOLD], [3, 4, body],
  ];
}

/** Gera as faces (prisma octogonal deitado sobre o fio) de todos os componentes. */
function buildFaces() {
  const faces = [], SIDES = 12;
  for (const br of BRANCHES) {
    const { u, mid, rad } = br, n = { x: u.z, z: -u.x };
    const ring = s => Array.from({ length: SIDES }, (_, k) => {
      const ang = (k + 0.5) * 2 * Math.PI / SIDES, c = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      return [mid.x + u.x * s + n.x * c, rad + y, mid.z + u.z * s + n.z * c];
    });
    const segs = segmentsFor(br);
    for (const [s0, s1, color] of segs) {
      const r0 = ring(s0), r1 = ring(s1);
      for (let k = 0; k < SIDES; k++) {
        const k2 = (k + 1) % SIDES, ny = Math.sin((k + 1) * 2 * Math.PI / SIDES);
        faces.push({ pts: [r0[k], r0[k2], r1[k2], r1[k]], color: shade(color, 0.62 + 0.38 * ny) });
      }
    }
    faces.push({ pts: ring(segs[0][0]), color: shade(segs[0][2], 0.5) });
    faces.push({ pts: ring(segs.at(-1)[1]), color: shade(segs.at(-1)[2], 0.5) });
  }
  for (const f of faces) {
    f.c = [0, 1, 2].map(i => f.pts.reduce((s, p) => s + p[i], 0) / f.pts.length);
  }
  return faces;
}
const FACES = buildFaces();

/* ---------- Câmera e renderização ---------- */

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const cam = { x: 0, y: EYE, z: 0, yaw: 0, walked: 0 };
let W = 0, H = 0, F = 1, HZ = 0, sinY = 0, cosY = 1;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  F = Math.max(W, H * 1.2) * 0.62;
  HZ = H * 0.26;                        // horizonte acima do centro: olhar levemente para baixo
}
window.addEventListener('resize', resize);

/** Altura da câmera: sobe ao passar por cima de um componente. */
function cameraHeight() {
  let bump = 0;
  for (const br of BRANCHES) {
    const dx = cam.x - br.mid.x, dz = cam.z - br.mid.z;
    const s = Math.abs(dx * br.u.x + dz * br.u.z), lat = Math.abs(dx * br.u.z - dz * br.u.x);
    if (lat < 1.5 && s < br.half + 3) {
      bump = Math.max(bump, 2 * br.rad * (1 - smooth(clamp((s - br.half) / 3, 0, 1))));
    }
  }
  return EYE + bump + Math.sin(cam.walked * 1.3) * 0.12;
}

const toCam = p => {
  const dx = p[0] - cam.x, dz = p[2] - cam.z;
  return [dx * cosY - dz * sinY, p[1] - cam.y, dx * sinY + dz * cosY];
};
const toScreen = c => [W / 2 + c[0] / c[2] * F, HZ - c[1] / c[2] * F];

/** Recorta o polígono (em coordenadas de câmera) no plano próximo. */
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const pin = p[2] >= NEAR, qin = q[2] >= NEAR;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (NEAR - p[2]) / (q[2] - p[2]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, NEAR]);
    }
  }
  return out;
}

function tracePoly(pts3) {
  const poly = clipNear(pts3.map(toCam));
  if (poly.length < 2) return false;
  ctx.beginPath();
  poly.forEach((c, i) => { const [x, y] = toScreen(c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  return true;
}
function fillPoly(pts3, color) {
  if (!tracePoly(pts3)) return;
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function line3(p, q, color, width) {
  if (!tracePoly([p, q])) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function billboard(pos, text, color, scale) {
  const c = toCam(pos);
  if (c[2] < 1.5 || c[2] > 34) return;
  const px = Math.min(scale * F / c[2], 30);
  if (px < 8) return;
  const [x, y] = toScreen(c);
  ctx.font = `700 ${px}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, px / 5); ctx.strokeStyle = 'rgba(5,10,18,.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function ribbon(br, halfWidth, y, color) {
  const a = WORLD[br.a], b = WORLD[br.b], nx = br.u.z * halfWidth, nz = -br.u.x * halfWidth;
  fillPoly([[a.x + nx, y, a.z + nz], [b.x + nx, y, b.z + nz], [b.x - nx, y, b.z - nz], [a.x - nx, y, a.z - nz]], color);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, '#060a13'); sky.addColorStop(1, '#1b2c4a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, HZ);
  const ground = ctx.createLinearGradient(0, HZ, 0, H);
  ground.addColorStop(0, '#0a1d18'); ground.addColorStop(1, '#12382c');
  ctx.fillStyle = ground; ctx.fillRect(0, HZ, W, H - HZ);
  // Grade da placa.
  for (let x = -12; x <= 104; x += 4) line3([x, 0, -56], [x, 0, 14], 'rgba(120,230,180,.10)', 1);
  for (let z = -56; z <= 14; z += 4) line3([-12, 0, z], [104, 0, z], 'rgba(120,230,180,.10)', 1);
}

function drawWires(time) {
  for (const br of BRANCHES) ribbon(br, 0.85, 0.02, '#061210');
  for (const br of BRANCHES) {
    const color = br.id === state.active ? '#ffd23f' : state.visited.has(br.id) ? '#5ef2b0' : '#b56a2e';
    ribbon(br, 0.5, 0.3, color);
  }
  // Nós: ilhas de solda.
  for (const [name, p] of Object.entries(WORLD)) {
    const pad = Array.from({ length: 8 }, (_, k) => {
      const a = (k + 0.5) * Math.PI / 4;
      return [p.x + Math.cos(a) * 1.5, 0.34, p.z + Math.sin(a) * 1.5];
    });
    fillPoly(pad, name === state.node ? '#ffd23f' : '#9aa7ba');
  }
  // Cargas em movimento nos ramos já visitados (sentido convencional da corrente).
  ctx.fillStyle = '#fffbe0';
  for (const br of BRANCHES) {
    if (!state.visited.has(br.id)) continue;
    const I = SOL.I[br.id], a = WORLD[br.a];
    const offset = ((time / 1000 * (2 + 3 * Math.abs(I)) * Math.sign(I)) % 4 + 4) % 4;
    for (let s = offset; s < br.len; s += 4) {
      if (Math.abs(s - br.len / 2) < br.half) continue;
      const c = toCam([a.x + br.u.x * s, 0.6, a.z + br.u.z * s]);
      if (c[2] < NEAR) continue;
      const [x, y] = toScreen(c), r = clamp(0.22 * F / c[2], 0.8, 9);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }
}

function drawObjects() {
  const items = [];
  for (const f of FACES) {
    const d = Math.hypot(f.c[0] - cam.x, f.c[1] - cam.y, f.c[2] - cam.z);
    items.push({ d, f });
  }
  for (const br of BRANCHES) {
    const top = 2 * br.rad, m = br.mid, d = Math.hypot(m.x - cam.x, m.z - cam.z) - 6;
    const seen = state.visited.has(br.id);
    items.push({ d, text: `${br.id} · ${valueLabel(br)}`, pos: [m.x, top + 5.6, m.z], color: '#ffffff', scale: 1.3 });
    items.push({
      d, text: seen ? `${fmt(Math.abs(SOL.I[br.id]))} A` : '? A',
      pos: [m.x, top + 4.4, m.z], color: seen ? '#5ef2b0' : '#93a4bb', scale: 1,
    });
    if (br.type === 'src') {
      for (const [s, sign] of [[4, '+'], [-4, '−']]) {
        items.push({ d, text: sign, pos: [m.x + br.u.x * s, top + 0.9, m.z + br.u.z * s], color: '#ffd23f', scale: 1.6 });
      }
    }
  }
  for (const [name, p] of Object.entries(WORLD)) {
    items.push({ d: Math.hypot(p.x - cam.x, p.z - cam.z), text: name, pos: [p.x, 2.2, p.z], color: '#ffd23f', scale: 1.2 });
  }
  items.sort((a, b) => b.d - a.d);
  for (const it of items) {
    if (it.f) fillPoly(it.f.pts, it.f.color);
    else billboard(it.pos, it.text, it.color, it.scale);
  }
}

function drawMinimap() {
  const mw = Math.min(170, W * 0.3), mh = mw * 0.46, pad = 12, ox = 10, oy = 10;
  const mx = x => ox + pad + (x - 100) / 720 * (mw - 2 * pad);
  const my = y => oy + pad + (y - 80) / 260 * (mh - 2 * pad);
  ctx.fillStyle = 'rgba(8,13,22,.78)'; ctx.strokeStyle = '#2b3a50'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.rect(ox, oy, mw, mh); ctx.fill(); ctx.stroke();
  for (const br of BRANCHES) {
    const a = NODES[br.a], b = NODES[br.b];
    ctx.strokeStyle = ctx.fillStyle =
      br.id === state.active ? '#ffd23f' : state.visited.has(br.id) ? '#3ddc97' : '#5d7290';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx(a.x), my(a.y)); ctx.lineTo(mx(b.x), my(b.y)); ctx.stroke();
    const cx = mx((a.x + b.x) / 2), cy = my((a.y + b.y) / 2);
    ctx.beginPath();
    if (br.type === 'src') ctx.arc(cx, cy, 4.5, 0, 7); else ctx.rect(cx - 3.5, cy - 3.5, 7, 7);
    ctx.fill();
  }
  // Jogador: triângulo apontando para onde está olhando.
  const px = mx(cam.x * 10), py = my(-cam.z * 10);
  ctx.save(); ctx.translate(px, py); ctx.rotate(cam.yaw);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0e1420'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fill(); ctx.stroke(); ctx.restore();
}

/* ---------- Animação ---------- */

let anims = [];
function animate(duration, fn) {
  return new Promise(resolve => {
    const t0 = performance.now();
    anims.push(now => {
      const t = Math.min(1, (now - t0) / duration);
      fn(smooth(t));
      if (t >= 1) resolve();
      return t < 1;
    });
  });
}

function turnTo(yaw) {
  let diff = (yaw - cam.yaw) % (2 * Math.PI);
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) < 0.01) return Promise.resolve();
  const from = cam.yaw;
  return animate(250 + 100 * Math.abs(diff), e => { cam.yaw = from + diff * e; });
}

function walkTo(p) {
  const from = { x: cam.x, z: cam.z }, dist = Math.hypot(p.x - from.x, p.z - from.z), w0 = cam.walked;
  return animate(Math.max(300, dist * 95), e => {
    cam.x = from.x + (p.x - from.x) * e;
    cam.z = from.z + (p.z - from.z) * e;
    cam.walked = w0 + dist * e;
  });
}

function frame(now) {
  anims = anims.filter(a => a(now));
  cam.y = cameraHeight();
  sinY = Math.sin(cam.yaw); cosY = Math.cos(cam.yaw);
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawWires(now);
  drawObjects();
  drawMinimap();
  requestAnimationFrame(frame);
}

/* ---------- Estado e interface ---------- */

const panel = document.getElementById('panel');
const dpad = document.getElementById('dpad');
const caption = document.getElementById('caption');
const state = { visited: new Set() };
const ARROWS = { up: '↑', left: '←', right: '→', down: '↓' };
const KEYS = { ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down' };

function updateHud() {
  document.getElementById('hud-pot').textContent = `${fmt(state.potential)} V`;
  document.getElementById('hud-visited').textContent = `${state.visited.size}/${BRANCHES.length}`;
  document.getElementById('hud-steps').textContent = state.steps;
  document.getElementById('hud-loops').textContent = state.loops;
}

/** Mostra as setas no centro da tela. Cada ação: {dir, label, seen, run}. */
function setDpad(actions) {
  dpad.replaceChildren();
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.dataset.dir = a.dir;
    if (a.seen) btn.className = 'seen';
    btn.innerHTML = `<span class="arrow">${ARROWS[a.dir]}</span><small>${a.label}</small>`;
    btn.setAttribute('aria-label', `${ARROWS[a.dir]} ${a.label}`);
    btn.addEventListener('click', async () => {
      if (state.busy) return;
      state.busy = true;
      dpad.classList.add('hidden');
      await a.run();
      state.busy = false;
    });
    dpad.append(btn);
  }
  dpad.classList.remove('hidden');
}

function render(html, buttons = []) {
  panel.innerHTML = html;
  const row = document.createElement('div');
  row.className = 'actions';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.addEventListener('click', b.run);
    row.append(btn);
  }
  panel.append(row);
}

/** Direção relativa (na tela) de um ramo para quem está olhando em cam.yaw. */
function relativeDir(yaw) {
  let d = (yaw - cam.yaw) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) < Math.PI / 4) return 'up';
  if (Math.abs(d) > 3 * Math.PI / 4) return 'down';
  return d > 0 ? 'right' : 'left';
}

/* ---------- Telas ---------- */

function deltaText(dv) {
  return dv >= 0
    ? `<span class="up">sobe ${fmt(dv)} V</span>`
    : `<span class="down">cai ${fmt(-dv)} V</span>`;
}

function sourceHtml(br, from, to, first) {
  const dv = SOL.pot[to] - SOL.pot[from];
  const I = Math.abs(SOL.I[br.id]);
  const delivering = SOL.I[br.id] >= 0;
  const P = br.V * I;
  let h = `<h2><span class="tag">Fonte</span>${br.id} — fonte de tensão de ${br.V} V</h2>`;
  if (first) {
    h += `<p>Sua viagem começa aqui, <strong>diante da fonte ${br.id}</strong>. Você é uma carga positiva
      andando por cima dos fios, no sentido convencional da corrente.</p>
      <p><strong>Como a fonte funciona:</strong></p>
      <ul>
        <li>Ela mantém uma diferença de potencial fixa de <strong>${br.V} V</strong> entre o polo − e o polo +,
            não importa quanta corrente passe (fonte ideal).</li>
        <li>Funciona como uma <em>bomba</em>: pega as cargas no polo − (potencial baixo) e as entrega
            no polo + (potencial alto). Cada coulomb sai com ${br.V} J de energia (1 V = 1 J/C).</li>
        <li>Fora da fonte, as cargas "descem" pelo circuito e gastam essa energia nos resistores,
            que a transformam em calor.</li>
      </ul>
      <p>O circuito tem <strong>3 malhas, 8 resistores e 2 fontes</strong> (${BY_ID.V1.V} V e ${BY_ID.V2.V} V).
      Toque na seta <strong>↑</strong> para atravessar a fonte. Em cada quina você escolhe o lado.
      Objetivo: passar pelos 10 componentes.</p>`;
  } else {
    h += `<p>A fonte mantém <strong>${br.V} V</strong> entre seus polos. Você vai atravessá-la
      ${dv >= 0 ? 'do polo − para o polo +' : 'do polo + para o polo −'}, então seu potencial ${deltaText(dv)}.</p>`;
  }
  h += `<div class="formula">V(${from}) = ${fmt(SOL.pot[from])} V &nbsp;→&nbsp; V(${to}) = ${fmt(SOL.pot[to])} V
    &nbsp;&nbsp;(ΔV = ${signed(dv)} V)</div>`;
  h += delivering
    ? `<p>Corrente pela fonte: <strong>${fmt(I)} A</strong>, saindo pelo polo +. Ela <strong>fornece</strong>
       P = V·I = ${br.V} × ${fmt(I)} = <strong>${fmt(P)} W</strong> ao circuito.</p>`
    : `<p>Corrente pela fonte: <strong>${fmt(I)} A</strong>, <em>entrando</em> pelo polo +. Aqui a outra fonte
       "vence": ${br.id} <strong>absorve</strong> P = ${fmt(P)} W, como uma bateria sendo carregada.</p>`;
  return h;
}

function resistorHtml(br, from, to) {
  const dv = SOL.pot[to] - SOL.pot[from];
  const I = Math.abs(SOL.I[br.id]);
  const V = br.R * I;
  return `<h2><span class="tag">Resistor</span>${br.id} — ${br.R} Ω</h2>
    <p>O resistor se opõe à passagem da corrente e transforma energia elétrica em calor
       (as faixas coloridas indicam o valor). Pela <strong>Lei de Ohm</strong>:</p>
    <div class="formula">V = R · I = ${br.R} Ω × ${fmt(I)} A = ${fmt(V)} V
      &nbsp;&nbsp;|&nbsp;&nbsp; P = V · I = ${fmt(V * I)} W</div>
    <p>${dv <= 0
      ? 'Você vai atravessá-lo <strong>no mesmo sentido da corrente</strong> (do potencial maior para o menor)'
      : 'Você vai atravessá-lo <strong>contra a corrente</strong> (do potencial menor para o maior)'},
       então seu potencial ${deltaText(dv)}.</p>
    <div class="formula">V(${from}) = ${fmt(SOL.pot[from])} V &nbsp;→&nbsp; V(${to}) = ${fmt(SOL.pot[to])} V
      &nbsp;&nbsp;(ΔV = ${signed(dv)} V)</div>`;
}

/** A carga está parada diante do componente `br`, tendo vindo do nó `from`. */
function showComponent(br, from, first = false) {
  const to = other(br, from);
  state.visited.add(br.id);
  state.active = br.id;
  state.node = null;
  updateHud();
  caption.textContent = `Diante de ${br.id} · ${valueLabel(br)}`;
  render(br.type === 'src' ? sourceHtml(br, from, to, first) : resistorHtml(br, from, to));
  setDpad([{
    dir: 'up',
    label: 'Atravessar',
    run: async () => {
      caption.textContent = `Atravessando ${br.id}…`;
      await walkTo(WORLD[to]);
      state.steps++;
      arriveNode(to, br);
    },
  }]);
}

function arriveNode(node, cameBy) {
  state.potential = SOL.pot[node];
  state.active = null;
  state.node = node;

  // Detecta malha fechada (voltar a um nó já presente no caminho atual).
  let loopNote = '';
  const idx = state.path.indexOf(node);
  if (idx >= 0) {
    const loop = state.path.slice(idx);
    if (loop.length >= 3) {
      state.loops++;
      loopNote = `<div class="note"><strong>Malha fechada!</strong> Você percorreu
        ${loop.join(' → ')} → ${node} e voltou exatamente a ${fmt(SOL.pot[node])} V.
        É a <strong>Lei de Kirchhoff das Tensões</strong>: a soma de todas as subidas e quedas
        de tensão em um caminho fechado é zero.</div>`;
    }
    state.path.length = idx + 1;
  } else {
    state.path.push(node);
  }
  updateHud();

  let victory = '';
  if (state.visited.size === BRANCHES.length && !state.won) {
    state.won = true;
    victory = victoryHtml();
  }
  showNode(node, cameBy, victory + loopNote, Boolean(victory));
}

function showNode(node, cameBy, prefix = '', won = false) {
  const brs = branchesAt(node);
  const inn = brs.filter(b => currentLeaving(b, node) < 0);
  const out = brs.filter(b => currentLeaving(b, node) >= 0);
  const term = b => `${fmt(Math.abs(SOL.I[b.id]))} A (${b.id})`;
  const junction = brs.length > 2;

  caption.textContent = `${junction ? 'Nó' : 'Quina'} ${node} · ${fmt(SOL.pot[node])} V`;
  let h = `${prefix}<h2><span class="tag">${junction ? 'Nó' : 'Quina'}</span>Ponto ${node} —
    potencial ${fmt(SOL.pot[node])} V</h2>`;
  h += junction
    ? `<p>Aqui três ramos se encontram e a corrente se ${inn.length > 1 ? 'junta' : 'divide'}.
       Pela <strong>Lei de Kirchhoff das Correntes</strong>, tudo que entra no nó tem que sair:</p>`
    : `<p>Uma quina simples: só há um caminho, então a mesma corrente que entra é a que sai.</p>`;
  h += `<div class="formula">entra: ${inn.map(term).join(' + ')} &nbsp;=&nbsp; sai: ${out.map(term).join(' + ')}</div>
    <p>Para qual lado você quer seguir? Use as setas no centro da tela
       (↓ volta por onde veio).</p>`;
  render(h, won ? [{ label: '↺ Jogar de novo', run: start }] : []);

  setDpad(brs.map(b => {
    const dest = other(b, node), yaw = heading(node, dest);
    return {
      dir: relativeDir(yaw),
      label: `${b.id} · ${valueLabel(b)}`,
      seen: state.visited.has(b.id),
      run: async () => {
        state.active = b.id;
        state.node = null;
        caption.textContent = `Indo para ${b.id}…`;
        await turnTo(yaw);
        await walkTo(stopPoint(b, node));
        showComponent(b, node);
      },
    };
  }));
}

function victoryHtml() {
  const rows = BRANCHES.map(b => {
    const I = Math.abs(SOL.I[b.id]);
    const V = b.type === 'src' ? b.V : b.R * I;
    const role = b.type === 'res' ? 'dissipa' : (SOL.I[b.id] >= 0 ? 'fornece' : 'absorve');
    return `<tr><td>${b.id} (${valueLabel(b)})</td><td>${fmt(I)} A</td><td>${fmt(V)} V</td>
      <td>${fmt(V * I)} W</td><td>${role}</td></tr>`;
  }).join('');
  const supplied = BRANCHES.filter(b => b.type === 'src').reduce((s, b) => s + b.V * SOL.I[b.id], 0);
  const dissipated = BRANCHES.filter(b => b.type === 'res').reduce((s, b) => s + b.R * SOL.I[b.id] ** 2, 0);
  return `<h2>🏆 Circuito completo!</h2>
    <p>Você passou pelos 10 componentes em <strong>${state.steps} passos</strong> e fechou
       <strong>${state.loops}</strong> malha(s). Resumo do circuito:</p>
    <div class="table-wrap"><table>
      <tr><th>Componente</th><th>Corrente</th><th>Tensão</th><th>Potência</th><th></th></tr>
      ${rows}
    </table></div>
    <p><strong>Conservação de energia:</strong> as fontes fornecem ao todo ${fmt(supplied)} W
       e os resistores dissipam ${fmt(dissipated)} W. Nada se perde!</p>
    <p>Você pode continuar explorando pelas setas.</p><hr>`;
}

/* ---------- Teclado ---------- */

document.addEventListener('keydown', ev => {
  if (state.busy) return;
  const dir = KEYS[ev.key] || (ev.key === 'Enter' && dpad.children.length === 1 ? 'up' : null);
  const btn = dir && dpad.querySelector(`button[data-dir="${dir}"]`);
  if (btn) { ev.preventDefault(); btn.click(); }
});

/* ---------- Início ---------- */

function start() {
  Object.assign(state, {
    visited: new Set(), steps: 0, loops: 0, path: [], won: false, busy: false,
    active: null, node: null, potential: SOL.pot.E,
  });
  const p = stopPoint(BY_ID.V1, 'E');
  Object.assign(cam, { x: p.x, z: p.z, yaw: heading('E', 'A'), walked: 0 });
  showComponent(BY_ID.V1, 'E', true);
}

resize();
start();
requestAnimationFrame(frame);
