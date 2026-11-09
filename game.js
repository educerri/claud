'use strict';

/* ============================================================
 * Caminhando pelo Circuito
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
const mid = br => ({
  x: (NODES[br.a].x + NODES[br.b].x) / 2,
  y: (NODES[br.a].y + NODES[br.b].y) / 2,
});
const branchesAt = node => BRANCHES.filter(b => b.a === node || b.b === node);
const valueLabel = br => (br.type === 'src' ? `${br.V} V` : `${br.R} Ω`);
const fullName = br => (br.type === 'src' ? `Fonte ${br.id}` : `Resistor ${br.id}`);

/** Corrente (com sinal) que SAI do nó pelo ramo. */
const currentLeaving = (br, node) => (br.a === node ? SOL.I[br.id] : -SOL.I[br.id]);

function direction(from, to) {
  const dx = NODES[to].x - NODES[from].x, dy = NODES[to].y - NODES[from].y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
const ARROWS = { right: '→', left: '←', up: '↑', down: '↓' };
const KEYS = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down' };

/* ---------- Desenho (SVG) ---------- */

const svg = document.getElementById('circuit');
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function drawBranch(br) {
  const a = NODES[br.a], b = NODES[br.b], m = mid(br);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };   // ao longo do ramo
  const n = { x: -u.y, y: u.x };                              // perpendicular
  const at = (s, t = 0) => `${m.x + u.x * s + n.x * t},${m.y + u.y * s + n.y * t}`;
  const g = el('g', { class: 'branch', id: `br-${br.id}` });

  if (br.type === 'res') {
    const pts = [`${a.x},${a.y}`, at(-30)];
    for (let k = 0; k < 6; k++) pts.push(at(-25 + k * 10, k % 2 ? 9 : -9));
    pts.push(at(30), `${b.x},${b.y}`);
    g.append(el('polyline', { class: 'wire', points: pts.join(' ') }));
  } else {
    g.append(el('polyline', { class: 'wire', points: `${a.x},${a.y} ${b.x},${b.y}` }));
    g.append(el('circle', { class: 'wire src-body', cx: m.x, cy: m.y, r: 24 }));
    const [px, py] = at(11).split(','), [nx, ny] = at(-11).split(',');
    g.append(el('text', { class: 'polarity', x: px, y: py }, '+'));
    g.append(el('text', { class: 'polarity', x: nx, y: ny }, '−'));
  }

  // Seta de corrente (aparece depois que o componente é visitado).
  const dir = SOL.I[br.id] >= 0 ? 1 : -1;
  const s = -len / 4;
  g.append(el('polygon', {
    class: 'flow',
    points: [at(s + 9 * dir), at(s - 6 * dir, 7), at(s - 6 * dir, -7)].join(' '),
  }));

  // Rótulos: fora do circuito nos ramos externos, à direita nos internos.
  const horizontal = Math.abs(u.x) > 0.5;
  let lx = m.x, ly = m.y, anchor = 'middle';
  if (horizontal) ly += a.y < 200 ? -34 : 34;
  else if (a.x < 200) { lx -= 36; anchor = 'end'; }
  else { lx += 36; anchor = 'start'; }
  g.append(el('text', { class: 'label', x: lx, y: ly, 'text-anchor': anchor }, `${br.id} · ${valueLabel(br)}`));
  g.append(el('text', { class: 'sublabel', id: `sub-${br.id}`, x: lx, y: ly + 16, 'text-anchor': anchor }, '? A'));
  svg.append(g);
}

function drawCircuit() {
  svg.replaceChildren();
  BRANCHES.forEach(drawBranch);
  for (const [name, p] of Object.entries(NODES)) {
    svg.append(el('circle', { class: 'node', id: `node-${name}`, cx: p.x, cy: p.y, r: 6 }));
    svg.append(el('text', { class: 'node-label', x: p.x, y: p.y < 200 ? p.y - 14 : p.y + 24 }, name));
  }
  svg.append(el('circle', { id: 'player', r: 13 }));
  svg.append(el('text', { id: 'player-sign' }, '+'));
}

function placePlayer(x, y) {
  state.px = x; state.py = y;
  const p = document.getElementById('player'), t = document.getElementById('player-sign');
  p.setAttribute('cx', x); p.setAttribute('cy', y);
  t.setAttribute('x', x); t.setAttribute('y', y);
}

function movePlayer(to, done) {
  state.busy = true;
  const from = { x: state.px, y: state.py }, t0 = performance.now(), dur = 450;
  const step = now => {
    const t = Math.min(1, (now - t0) / dur), e = t * t * (3 - 2 * t);
    placePlayer(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    if (t < 1) requestAnimationFrame(step);
    else { state.busy = false; done(); }
  };
  requestAnimationFrame(step);
}

/* ---------- Estado e interface ---------- */

const panel = document.getElementById('panel');
const state = {};

function updateHud() {
  document.getElementById('hud-pot').textContent = `${fmt(state.potential)} V`;
  document.getElementById('hud-visited').textContent = `${state.visited.size}/${BRANCHES.length}`;
  document.getElementById('hud-steps').textContent = state.steps;
  document.getElementById('hud-loops').textContent = state.loops;
}

function highlight(branchId, nodeName) {
  for (const b of BRANCHES) {
    const g = document.getElementById(`br-${b.id}`);
    g.classList.toggle('active', b.id === branchId);
    g.classList.toggle('visited', state.visited.has(b.id));
    if (state.visited.has(b.id)) {
      document.getElementById(`sub-${b.id}`).textContent = `${fmt(Math.abs(SOL.I[b.id]))} A`;
    }
  }
  for (const n of Object.keys(NODES)) {
    document.getElementById(`node-${n}`).classList.toggle('here', n === nodeName);
  }
}

function render(html, actions) {
  panel.innerHTML = html;
  const row = document.createElement('div');
  row.className = 'actions';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.innerHTML = a.label;
    if (a.cls) btn.className = a.cls;
    if (a.dir) btn.dataset.dir = a.dir;
    btn.addEventListener('click', () => { if (!state.busy) a.run(); });
    row.append(btn);
  }
  panel.append(row);
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
    h += `<p>Sua viagem começa aqui, <strong>dentro da fonte ${br.id}</strong>. Você é uma carga positiva
      e vai percorrer o circuito no sentido convencional da corrente.</p>
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
      Em cada quina você escolhe para onde seguir. Objetivo: passar por todos os 10 componentes.</p>`;
  } else {
    h += `<p>A fonte mantém <strong>${br.V} V</strong> entre seus polos. Você a atravessou
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
  const withFlow = dv <= 0;
  return `<h2><span class="tag">Resistor</span>${br.id} — ${br.R} Ω</h2>
    <p>O resistor se opõe à passagem da corrente e transforma energia elétrica em calor.
       Pela <strong>Lei de Ohm</strong>, a tensão nele é proporcional à corrente:</p>
    <div class="formula">V = R · I = ${br.R} Ω × ${fmt(I)} A = ${fmt(V)} V
      &nbsp;&nbsp;|&nbsp;&nbsp; P = V · I = ${fmt(V * I)} W</div>
    <p>${withFlow
      ? 'Você atravessou <strong>no mesmo sentido da corrente</strong> (do potencial maior para o menor)'
      : 'Você atravessou <strong>contra a corrente</strong> (do potencial menor para o maior)'},
       então seu potencial ${deltaText(dv)}.</p>
    <div class="formula">V(${from}) = ${fmt(SOL.pot[from])} V &nbsp;→&nbsp; V(${to}) = ${fmt(SOL.pot[to])} V
      &nbsp;&nbsp;(ΔV = ${signed(dv)} V)</div>`;
}

function showComponent(br, from, first = false) {
  const to = other(br, from);
  state.visited.add(br.id);
  if (!first) state.steps++;
  highlight(br.id, null);
  updateHud();
  const html = br.type === 'src' ? sourceHtml(br, from, to, first) : resistorHtml(br, from, to);
  render(html, [{
    label: first ? `Sair pelo polo + e seguir o circuito ▶` : `Continuar até o nó ${to} ▶`,
    cls: 'primary',
    run: () => movePlayer(NODES[to], () => arriveNode(to, br)),
  }]);
}

function arriveNode(node, cameBy) {
  state.potential = SOL.pot[node];

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

  highlight(null, node);
  updateHud();

  if (state.visited.size === BRANCHES.length && !state.won) {
    state.won = true;
    showVictory(node, cameBy, loopNote);
  } else {
    showNode(node, cameBy, loopNote);
  }
}

function showNode(node, cameBy, loopNote = '') {
  const brs = branchesAt(node);
  const inn = brs.filter(b => currentLeaving(b, node) < 0);
  const out = brs.filter(b => currentLeaving(b, node) >= 0);
  const term = b => `${fmt(Math.abs(SOL.I[b.id]))} A (${b.id})`;
  const junction = brs.length > 2;

  let h = `<h2><span class="tag">${junction ? 'Nó' : 'Quina'}</span>Ponto ${node} —
    potencial ${fmt(SOL.pot[node])} V</h2>${loopNote}`;
  h += junction
    ? `<p>Aqui três ramos se encontram e a corrente se ${inn.length > 1 ? 'junta' : 'divide'}.
       Pela <strong>Lei de Kirchhoff das Correntes</strong>, tudo que entra no nó tem que sair:</p>`
    : `<p>Uma quina simples: só há um caminho, então a mesma corrente que entra é a que sai.</p>`;
  h += `<div class="formula">entra: ${inn.map(term).join(' + ')} &nbsp;=&nbsp; sai: ${out.map(term).join(' + ')}</div>
    <p>Para qual lado você quer seguir?</p>`;

  const actions = brs.map(b => {
    const dest = other(b, node), dir = direction(node, dest);
    const leaving = currentLeaving(b, node) >= 0;
    const hint = b.id === cameBy.id ? 'voltar por onde veio' : (leaving ? 'a favor da corrente' : 'contra a corrente');
    return {
      dir,
      cls: state.visited.has(b.id) ? 'seen' : '',
      label: `<span class="arrow">${ARROWS[dir]}</span>${b.id} (${valueLabel(b)})<small>${hint}</small>`,
      run: () => {
        highlight(b.id, null);
        movePlayer(mid(b), () => showComponent(b, node));
      },
    };
  });
  render(h, actions);
}

function showVictory(node, cameBy, loopNote) {
  const rows = BRANCHES.map(b => {
    const I = Math.abs(SOL.I[b.id]);
    const V = b.type === 'src' ? b.V : b.R * I;
    const role = b.type === 'res' ? 'dissipa' : (SOL.I[b.id] >= 0 ? 'fornece' : 'absorve');
    return `<tr><td>${b.id} (${valueLabel(b)})</td><td>${fmt(I)} A</td><td>${fmt(V)} V</td>
      <td>${fmt(V * I)} W</td><td>${role}</td></tr>`;
  }).join('');
  const supplied = BRANCHES.filter(b => b.type === 'src')
    .reduce((s, b) => s + b.V * SOL.I[b.id], 0);
  const dissipated = BRANCHES.filter(b => b.type === 'res')
    .reduce((s, b) => s + b.R * SOL.I[b.id] ** 2, 0);

  render(`<h2>🏆 Circuito completo!</h2>${loopNote}
    <p>Você passou pelos 10 componentes em <strong>${state.steps} passos</strong> e fechou
       <strong>${state.loops}</strong> malha(s). Resumo do circuito:</p>
    <table>
      <tr><th>Componente</th><th>Corrente</th><th>Tensão</th><th>Potência</th><th></th></tr>
      ${rows}
    </table>
    <p><strong>Conservação de energia:</strong> as fontes fornecem ao todo ${fmt(supplied)} W
       e os resistores dissipam ${fmt(dissipated)} W. Nada se perde!</p>`,
  [
    { label: 'Continuar explorando', cls: 'primary', run: () => showNode(node, cameBy) },
    { label: '↺ Jogar de novo', run: start },
  ]);
}

/* ---------- Teclado ---------- */

document.addEventListener('keydown', ev => {
  if (state.busy) return;
  let btn = null;
  if (KEYS[ev.key]) btn = panel.querySelector(`button[data-dir="${KEYS[ev.key]}"]`);
  else if (ev.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
    btn = panel.querySelector('button.primary');
  }
  if (btn) { ev.preventDefault(); btn.click(); }
});

/* ---------- Início ---------- */

function start() {
  Object.assign(state, {
    visited: new Set(), steps: 0, loops: 0, path: [], won: false, busy: false,
    potential: SOL.pot.E,
  });
  drawCircuit();
  const m = mid(BY_ID.V1);
  placePlayer(m.x, m.y);
  showComponent(BY_ID.V1, 'E', true);
}

start();
