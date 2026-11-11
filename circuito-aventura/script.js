(() => {
  // ---------- Geometria do circuito ----------
  // Três ramos em paralelo entre o nó A (em cima) e o nó B (embaixo):
  //   Ramo 1 (esquerda): fonte V1 + R1 + R2 em série
  //   Ramo 2 (centro):   R3
  //   Ramo 3 (direita):  fonte V2 + R4
  // Solução: VA = 9 V  ->  I1 = 2,5 A | I3 = 3 A | I4 = 0,5 A  (I1 + I4 = I3)
  const L = 110, M = 400, R = 690, T = 110, B = 410;

  const segments = [
    { o: 'h', y: T, a: L, b: R },   // fio de cima
    { o: 'h', y: B, a: L, b: R },   // fio de baixo
    { o: 'v', x: L, a: T, b: B },   // ramo 1
    { o: 'v', x: M, a: T, b: B },   // ramo 2
    { o: 'v', x: R, a: T, b: B },   // ramo 3
  ];

  const sources = [
    { name: 'V1', value: 24, x: L, y: 260, labelSide: -1 },
    { name: 'V2', value: 12, x: R, y: 330, labelSide: 1 },
  ];

  const nodes = [
    { name: 'A', x: M, y: T, ly: -22 },
    { name: 'B', x: M, y: B, ly: 34 },
  ];

  const resistorDefs = [
    { name: 'R1', ohms: 2, x: 255, y: T, o: 'h',
      text: 'Você chegou ao primeiro resistor do ramo 1. Qual é a corrente que passa por ele?',
      data: ['Tensão em R1: V = 5 V', 'R1 = 2 Ω'],
      answer: 2.5, wrong: [10, 0.4],
      explain: 'I = 5 ÷ 2 = 2,5 A' },
    { name: 'R2', ohms: 4, x: 255, y: B, o: 'h',
      text: 'Segundo resistor do ramo 1, em série com R1. Qual é a corrente aqui?',
      data: ['Tensão em R2: V = 10 V', 'R2 = 4 Ω'],
      answer: 2.5, wrong: [40, 0.4],
      explain: 'I = 10 ÷ 4 = 2,5 A — igual a R1, pois em série a corrente é a mesma!' },
    { name: 'R3', ohms: 3, x: M, y: 260, o: 'v',
      text: 'Resistor do ramo central, ligado entre os nós A e B. Qual é a corrente nele?',
      data: ['Tensão entre A e B: V = 9 V', 'R3 = 3 Ω'],
      answer: 3, wrong: [27, 0.33],
      explain: 'I = 9 ÷ 3 = 3 A' },
    { name: 'R4', ohms: 6, x: R, y: 190, o: 'v',
      text: 'Resistor do ramo 3, entre a fonte V2 e o nó A. Qual é a corrente nele?',
      data: ['Tensão em R4: V = V2 − VA = 12 − 9 = 3 V', 'R4 = 6 Ω'],
      answer: 0.5, wrong: [18, 2],
      explain: 'I = 3 ÷ 6 = 0,5 A' },
  ];

  // ---------- Estado ----------
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);
  const fmt = n => String(n).replace('.', ',');

  const SPEED = 190, TOL = 10, START = { x: L, y: 205 };
  let player, lives, resistors, state, startTime, elapsed, current, hint;
  const held = [];   // direções pressionadas (a última tem prioridade)

  function reset() {
    player = { x: START.x, y: START.y, dir: 'up', step: 0 };
    lives = 3;
    resistors = resistorDefs.map(r => ({ ...r, solved: false }));
    current = null; hint = '';
    elapsed = 0; startTime = performance.now();
    held.length = 0;
    updateHud();
  }

  function updateHud() {
    $('lives').innerHTML = [0, 1, 2].map(i => `<span class="${i < lives ? '' : 'lost'}">❤️</span>`).join('');
    $('progress').textContent = `Resistores: ${resistors.filter(r => r.solved).length}/4`;
    const s = Math.floor(elapsed);
    $('timer').textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ---------- Movimento preso aos fios ----------
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function move(dir, dist) {
    const [dx, dy] = DIRS[dir];
    for (const s of segments) {
      if (dx !== 0 && s.o === 'h') {
        if (Math.abs(player.y - s.y) > TOL || player.x < s.a - TOL || player.x > s.b + TOL) continue;
        if ((dx > 0 && player.x >= s.b) || (dx < 0 && player.x <= s.a)) continue;
        player.y = s.y;
        player.x = Math.max(s.a, Math.min(s.b, player.x + dx * dist));
        return true;
      }
      if (dy !== 0 && s.o === 'v') {
        if (Math.abs(player.x - s.x) > TOL || player.y < s.a - TOL || player.y > s.b + TOL) continue;
        if ((dy > 0 && player.y >= s.b) || (dy < 0 && player.y <= s.a)) continue;
        player.x = s.x;
        player.y = Math.max(s.a, Math.min(s.b, player.y + dy * dist));
        return true;
      }
    }
    return false;
  }

  function update(dt) {
    if (state !== 'play') return;
    elapsed = (performance.now() - startTime) / 1000;

    // tenta a direção mais recente; se não der, tenta as anteriores
    for (let i = held.length - 1; i >= 0; i--) {
      if (move(held[i], SPEED * dt)) { player.dir = held[i]; player.step += dt * 10; break; }
    }

    // chegou a um resistor ainda não resolvido?
    for (const r of resistors) {
      if (!r.solved && Math.hypot(player.x - r.x, player.y - r.y) < 24) { openQuiz(r); break; }
    }

    // dica nos nós
    hint = '';
    for (const n of nodes) {
      if (Math.hypot(player.x - n.x, player.y - n.y) < 34) hint = `Nó ${n.name}: siga reto ou vire!`;
    }
    updateHud();
  }

  // ---------- Popup de pergunta ----------
  function openQuiz(r) {
    state = 'quiz'; current = r; held.length = 0;
    $('qTitle').textContent = `Resistor ${r.name}`;
    $('qText').textContent = r.text;
    $('qData').innerHTML = r.data.map(d => `<span class="chip">${d}</span>`).join('');
    $('qFormula').textContent = 'I = V ÷ R';
    $('feedback').textContent = ''; $('feedback').className = '';
    $('continueBtn').style.display = 'none';

    const opts = [r.answer, ...r.wrong].sort(() => Math.random() - 0.5);
    $('qOptions').innerHTML = '';
    opts.forEach((v, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<kbd>${i + 1}</kbd> ${fmt(v)} A`;
      b.onclick = () => answer(b, v);
      $('qOptions').appendChild(b);
    });
    $('quiz').classList.add('show');
  }

  function answer(btn, value) {
    if (state !== 'quiz' || btn.disabled) return;
    const fb = $('feedback');
    if (value === current.answer) {
      btn.classList.add('right');
      [...$('qOptions').children].forEach(b => b.disabled = true);
      fb.className = 'ok';
      fb.textContent = `✔ Correto! ${current.explain}`;
      current.solved = true;
      state = 'solved';
      $('continueBtn').style.display = '';
      $('continueBtn').focus();
    } else {
      btn.classList.add('wrong'); btn.disabled = true;
      lives--;
      const card = $('quizCard');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 400);
      if (lives <= 0) {
        fb.className = 'no'; fb.textContent = '✖ Errado! Você ficou sem vidas...';
        state = 'over'; updateHud();
        setTimeout(() => { $('quiz').classList.remove('show'); endGame(false); }, 900);
        return;
      }
      fb.className = 'no';
      fb.textContent = `✖ Errado! Você perdeu uma vida. Use I = V ÷ R e tente de novo.`;
    }
    updateHud();
  }

  function closeQuiz() {
    if (state !== 'solved') return;
    $('quiz').classList.remove('show');
    if (resistors.every(r => r.solved)) { endGame(true); return; }
    // desconta o tempo parado no popup
    startTime = performance.now() - elapsed * 1000;
    state = 'play';
  }

  function endGame(win) {
    state = 'over';
    $('endIcon').textContent = win ? '🏆' : '💥';
    $('endTitle').textContent = win ? 'Circuito concluído!' : 'Curto-circuito!';
    $('endText').innerHTML = win
      ? `Você resolveu os 4 resistores em <b>${Math.floor(elapsed)} s</b> com <b>${lives}</b> vida(s) restante(s).`
      : 'Suas vidas acabaram. Revise a fórmula <b>I = V ÷ R</b> e tente outra vez!';
    $('endExtra').textContent = win
      ? 'Repare na Lei de Kirchhoff no nó A: I1 + I4 = I3  →  2,5 A + 0,5 A = 3 A.'
      : '';
    $('endScreen').classList.add('show');
  }

  // ---------- Desenho ----------
  function drawWires() {
    ctx.lineCap = 'round';
    for (const pass of [{ w: 12, c: 'rgba(224,178,82,.13)' }, { w: 5, c: '#e0b252' }]) {
      ctx.lineWidth = pass.w; ctx.strokeStyle = pass.c;
      ctx.beginPath();
      for (const s of segments) {
        if (s.o === 'h') { ctx.moveTo(s.a, s.y); ctx.lineTo(s.b, s.y); }
        else { ctx.moveTo(s.x, s.a); ctx.lineTo(s.x, s.b); }
      }
      ctx.stroke();
    }
  }

  function label(text, x, y, color = '#e8f5ee', size = 15, align = 'center') {
    ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  function drawResistor(r, t) {
    const len = 64, amp = 11;
    const color = r.solved ? '#4de3a0' : '#ffb347';
    ctx.save();
    ctx.translate(r.x, r.y);
    if (r.o === 'v') ctx.rotate(Math.PI / 2);
    // apaga o fio por baixo
    ctx.fillStyle = '#0d2119'; ctx.fillRect(-len / 2, -amp - 6, len, amp * 2 + 12);
    // brilho pulsante quando pendente
    if (!r.solved) {
      ctx.fillStyle = `rgba(255,179,71,${0.10 + 0.10 * Math.sin(t * 4)})`;
      ctx.beginPath(); ctx.roundRect(-len / 2 - 4, -amp - 10, len + 8, amp * 2 + 20, 10); ctx.fill();
    }
    // zigue-zague
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-len / 2, 0);
    const n = 6, step = len / n;
    for (let i = 0; i < n; i++) ctx.lineTo(-len / 2 + step * (i + 0.5), i % 2 ? amp : -amp);
    ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.restore();

    const txt = `${r.name} = ${r.ohms} Ω`;
    const cur = r.solved ? `I = ${fmt(r.answer)} A` : 'I = ?';
    if (r.o === 'h') {
      const up = r.y === T ? -1 : 1;
      label(txt, r.x, r.y + up * 32);
      label(cur, r.x, r.y + up * 52, color, 14);
    } else {
      const side = r.x === R ? 1 : 1;
      label(txt, r.x + side * 26, r.y - 10, '#e8f5ee', 15, 'left');
      label(cur, r.x + side * 26, r.y + 10, color, 14, 'left');
    }
  }

  function drawSource(s) {
    ctx.fillStyle = '#0d2119'; ctx.strokeStyle = '#6fc3ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(s.x, s.y, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    label('+', s.x, s.y - 10, '#ff8a8a', 18);
    label('−', s.x, s.y + 10, '#8ab8ff', 20);
    const align = s.labelSide < 0 ? 'right' : 'left';
    label(s.name, s.x + s.labelSide * 34, s.y - 10, '#6fc3ff', 15, align);
    label(`${s.value} V`, s.x + s.labelSide * 34, s.y + 10, '#e8f5ee', 15, align);
  }

  function drawNode(n) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0b252'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(n.x, n.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    label(`Nó ${n.name}`, n.x, n.y + n.ly, '#8fb3a2', 14);
  }

  function drawPlayer(t) {
    const { x, y } = player;
    const bob = Math.sin(player.step) * 1.5;
    // halo
    const g = ctx.createRadialGradient(x, y, 4, x, y, 30);
    g.addColorStop(0, 'rgba(120,220,255,.55)'); g.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
    // corpo
    ctx.fillStyle = '#5fd0ff'; ctx.strokeStyle = '#0b3550'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y + bob, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // olhos olhando na direção do movimento
    const [dx, dy] = DIRS[player.dir];
    for (const ex of [-5, 5]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + ex + dx * 2, y + bob - 2 + dy * 2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b3550';
      ctx.beginPath(); ctx.arc(x + ex + dx * 3.5, y + bob - 2 + dy * 3.5, 2, 0, Math.PI * 2); ctx.fill();
    }
    // faísca orbitando
    const a = t * 5;
    ctx.fillStyle = '#fff59d';
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * 20, y + Math.sin(a) * 20, 3, 0, Math.PI * 2); ctx.fill();
  }

  function draw(t) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    // grade de fundo estilo placa
    ctx.fillStyle = 'rgba(77,227,160,.07)';
    for (let gx = 20; gx < cv.width; gx += 30)
      for (let gy = 20; gy < cv.height; gy += 30) ctx.fillRect(gx, gy, 2, 2);

    label('RAMO 1', (L + M) / 2 - 20, 260, 'rgba(143,179,162,.35)', 20);
    label('RAMO 2', M - 62, 330, 'rgba(143,179,162,.35)', 14);
    label('RAMO 3', (M + R) / 2 + 20, 260, 'rgba(143,179,162,.35)', 20);

    drawWires();
    resistors.forEach(r => drawResistor(r, t));
    sources.forEach(drawSource);
    nodes.forEach(drawNode);
    drawPlayer(t);

    if (hint && state === 'play') {
      ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
      const w = ctx.measureText(hint).width + 24;
      ctx.fillStyle = 'rgba(16,38,29,.95)'; ctx.strokeStyle = '#4de3a0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(cv.width / 2 - w / 2, 470, w, 32, 10); ctx.fill(); ctx.stroke();
      label(hint, cv.width / 2, 487, '#4de3a0', 15);
    }
  }

  // ---------- Laço principal ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    draw(now / 1000);
    requestAnimationFrame(loop);
  }

  // ---------- Entrada ----------
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };
  const press = d => { if (state === 'play' && !held.includes(d)) held.push(d); };
  const release = d => { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); };

  addEventListener('keydown', e => {
    if (KEYS[e.key]) { e.preventDefault(); press(KEYS[e.key]); return; }
    if (state === 'quiz' && ['1', '2', '3'].includes(e.key)) {
      const b = $('qOptions').children[+e.key - 1];
      if (b) b.click();
    } else if (state === 'solved' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); closeQuiz();
    }
  });
  addEventListener('keyup', e => { if (KEYS[e.key]) release(KEYS[e.key]); });
  addEventListener('blur', () => held.length = 0);

  document.querySelectorAll('#pad button').forEach(b => {
    const d = b.dataset.d;
    b.addEventListener('pointerdown', e => { e.preventDefault(); press(d); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => release(d)));
  });

  function start() {
    reset();
    $('startScreen').classList.remove('show');
    $('endScreen').classList.remove('show');
    $('quiz').classList.remove('show');
    state = 'play';
  }
  $('startBtn').onclick = start;
  $('restartBtn').onclick = start;
  $('continueBtn').onclick = closeQuiz;

  reset();
  state = 'menu';
  requestAnimationFrame(loop);
})();
