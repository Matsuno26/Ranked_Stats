// Page Stats : aperçu + graphique de progression par jeu.

const GAME_INFO = {
  valorant: { name: 'Valorant', short: 'V' },
  overwatch: { name: 'Overwatch 2', short: 'OW' },
  rocketleague: { name: 'Rocket League', short: 'RL' },
  r6: { name: 'Rainbow Six Siege', short: 'R6' },
};

const MIN = 60e3; const HOUR = 3600e3; const DAY = 86400e3;
const SCALES = {
  minute: { count: 60, label: 'la dernière heure', unit: 'min', tick: 10 },
  hour: { count: 24, label: 'les dernières 24 h', unit: 'h', tick: 3 },
  day: { count: 30, label: 'les 30 derniers jours', unit: 'jour', tick: 5 },
  week: { count: 12, label: 'les 12 dernières semaines', unit: 'semaine', tick: 2 },
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('statranked.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('statranked.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

let data = null;
let scale = store.get('scale', 'hour');
const selectedQueue = store.get('queues', {});

/* ------------------------------------------------------------- Calculs */

// Début de chaque intervalle (aligné : minute pile, heure pile, minuit, lundi).
function buckets(now = Date.now()) {
  const { count } = SCALES[scale];
  const d = new Date(now);
  const starts = [];
  if (scale === 'minute' || scale === 'hour') {
    const size = scale === 'minute' ? MIN : HOUR;
    const cur = Math.floor(now / size) * size;
    for (let i = count - 1; i >= 0; i--) starts.push(cur - i * size);
    return starts.map((s) => ({ start: s, end: s + size }));
  }
  d.setHours(0, 0, 0, 0);
  if (scale === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const step = scale === 'week' ? 7 : 1;
  for (let i = count - 1; i >= 0; i--) {
    const s = new Date(d); s.setDate(d.getDate() - i * step);
    const e = new Date(s); e.setDate(s.getDate() + step);
    starts.push({ start: s.getTime(), end: e.getTime() });
  }
  return starts;
}

// Dernier point avant t (index), recherche binaire.
function lastBefore(points, t) {
  let lo = 0; let hi = points.length - 1; let ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (points[m].t < t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

function series(points) {
  const bs = buckets();
  return bs.map((b) => {
    const iEnd = lastBefore(points, b.end);
    const iStart = lastBefore(points, b.start);
    const end = iEnd >= 0 ? points[iEnd] : null;
    const startV = iStart >= 0 ? points[iStart].v : (end ? points[iStart + 1].v : null);
    const n = iEnd - iStart;
    let hi = null;
    for (let i = iStart + 1; i <= iEnd; i++) hi = hi == null ? points[i].v : Math.max(hi, points[i].v);
    return { ...b, v: end ? end.v : null, l: end?.l || '', delta: end && startV != null ? end.v - startV : null, n, hi };
  });
}

function summary(points) {
  const s = series(points);
  const filled = s.filter((b) => b.v != null);
  const first = filled[0]; const last = s[s.length - 1];
  const before = lastBefore(points, s[0].start);
  const startV = before >= 0 ? points[before].v : first?.v;
  const highs = s.map((b) => b.hi).filter((v) => v != null);
  return {
    s,
    current: points[points.length - 1] || null,
    delta: last.v != null && startV != null ? last.v - startV : null,
    peak: highs.length ? Math.max(...highs) : last.v,
    matches: s.reduce((n, b) => n + b.n, 0),
  };
}

// File principale = celle qui a bougé le plus récemment.
function mainQueue(game) {
  const qs = data.history[game] || {};
  const keys = Object.keys(qs).filter((k) => qs[k].points?.length);
  if (selectedQueue[game] && keys.includes(selectedQueue[game])) return selectedQueue[game];
  return keys.sort((a, b) => qs[b].points.at(-1).t - qs[a].points.at(-1).t)[0] || null;
}

/* ------------------------------------------------------------- Rendu */

function deltaHtml(d) {
  if (d == null) return '<span class="delta flat">—</span>';
  const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  const icon = d > 0 ? '▲' : d < 0 ? '▼' : '■';
  return `<span class="delta ${cls}" title="Variation sur ${SCALES[scale].label}">${icon} ${signed(d)}</span>`;
}

function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 50; max += 50; }
  const raw = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step; const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return ticks;
}

function sparkline(s, color) {
  const w = 120; const h = 36;
  const vals = s.map((b) => b.v).filter((v) => v != null);
  if (vals.length < 2) return '';
  const mn = Math.min(...vals); const mx = Math.max(...vals);
  const x = (i) => 2 + (i / (s.length - 1)) * (w - 6);
  const y = (v) => mx === mn ? h / 2 : 4 + (1 - (v - mn) / (mx - mn)) * (h - 8);
  let d = ''; let lastPt = null;
  s.forEach((b, i) => { if (b.v == null) return; d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(b.v).toFixed(1)}`; lastPt = [x(i), y(b.v)]; });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/></svg>`;
}

function timeLabel(t, short) {
  const d = new Date(t);
  if (scale === 'minute' || scale === 'hour') {
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return short && scale === 'hour' ? `${d.getHours()}h` : hm;
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function rangeLabel(b) {
  const s = new Date(b.start);
  if (scale === 'minute') return s.toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  if (scale === 'hour') return `${s.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })} · ${s.getHours()}h – ${(s.getHours() + 1) % 24}h`;
  if (scale === 'day') return s.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const e = new Date(b.end - 1);
  return `Semaine du ${s.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${e.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

function drawChart(container, s, color, unit) {
  const W = Math.max(280, container.clientWidth);
  const pad = { l: 46, r: 14, t: 10 };
  const lineH = 190; const gap = 22; const barH = 64; const axisH = 22;
  const H = pad.t + lineH + gap + barH + axisH;
  const plotW = W - pad.l - pad.r;
  const slot = plotW / s.length;
  const cx = (i) => pad.l + slot * (i + 0.5);

  const vals = s.map((b) => b.v).filter((v) => v != null);
  const ticks = vals.length ? niceTicks(Math.min(...vals), Math.max(...vals)) : [0, 1];
  const yMin = ticks[0]; const yMax = ticks[ticks.length - 1];
  const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * lineH;

  const deltas = s.map((b) => b.delta || 0);
  const maxAbs = Math.max(1, ...deltas.map(Math.abs));
  const barTop = pad.t + lineH + gap;
  const zero = barTop + barH / 2;
  const bh = (d) => (Math.abs(d) / maxAbs) * (barH / 2);
  const bw = Math.max(2, Math.min(24, slot * 0.62));

  let svg = '';
  ticks.forEach((t) => {
    svg += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text class="axis-label" x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${t >= 10000 ? (t / 1000).toFixed(1).replace('.0', '') + 'k' : fmt(t)}</text>`;
  });

  // Courbe + léger dégradé
  const pts = s.map((b, i) => (b.v == null ? null : [cx(i), y(b.v)]));
  let line = ''; let area = ''; let firstX = null; let lastPt = null;
  pts.forEach((p) => {
    if (!p) return;
    line += `${line ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    if (firstX == null) firstX = p[0];
    lastPt = p;
  });
  if (line) {
    area = `${line}L${lastPt[0].toFixed(1)},${pad.t + lineH}L${firstX.toFixed(1)},${pad.t + lineH}Z`;
    svg += `<path d="${area}" fill="${color}" opacity="0.10"/>`;
    svg += `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    svg += `<circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`;
  }

  // Barres de variation (vert = gain, rouge = perte)
  svg += `<text class="axis-label" x="${pad.l - 8}" y="${zero + 4}" text-anchor="end">0</text>`;
  s.forEach((b, i) => {
    if (!b.delta) return;
    const h = Math.max(2, bh(b.delta)); const x = cx(i) - bw / 2; const r = Math.min(4, bw / 2, h);
    const fill = b.delta > 0 ? 'var(--up)' : 'var(--down)';
    const d = b.delta > 0
      ? `M${x},${zero}V${zero - h + r}Q${x},${zero - h} ${x + r},${zero - h}H${x + bw - r}Q${x + bw},${zero - h} ${x + bw},${zero - h + r}V${zero}Z`
      : `M${x},${zero}V${zero + h - r}Q${x},${zero + h} ${x + r},${zero + h}H${x + bw - r}Q${x + bw},${zero + h} ${x + bw},${zero + h - r}V${zero}Z`;
    svg += `<path d="${d}" fill="${fill}"/>`;
  });
  svg += `<line class="base-line" x1="${pad.l}" x2="${W - pad.r}" y1="${zero}" y2="${zero}"/>`;

  // Axe du temps
  const tick = SCALES[scale].tick;
  s.forEach((b, i) => {
    if ((s.length - 1 - i) % tick !== 0) return;
    svg += `<text class="axis-label" x="${cx(i)}" y="${H - 4}" text-anchor="middle">${i === s.length - 1 ? 'maint.' : timeLabel(b.start, true)}</text>`;
  });

  svg += `<line class="crosshair" x1="0" x2="0" y1="${pad.t}" y2="${barTop + barH}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/>`;
  svg += `<circle class="hover-dot" r="5" fill="${color}" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`;
  svg += `<rect class="hit" x="${pad.l}" y="0" width="${plotW}" height="${H}" fill="transparent"/>`;

  const noData = s.every((b) => b.n === 0);
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Évolution ${esc(unit)} sur ${SCALES[scale].label}">${svg}</svg>
    ${noData ? `<div class="empty-note">Aucun match sur ${SCALES[scale].label}</div>` : ''}
    <div class="tooltip"></div>`;

  const svgEl = container.querySelector('svg');
  const tip = container.querySelector('.tooltip');
  const cross = svgEl.querySelector('.crosshair');
  const dot = svgEl.querySelector('.hover-dot');
  const hit = svgEl.querySelector('.hit');
  const hide = () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('mouseleave', hide);
  hit.addEventListener('mousemove', (e) => {
    const rect = svgEl.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(s.length - 1, Math.floor((px - pad.l) / slot)));
    const b = s[i];
    cross.setAttribute('x1', cx(i)); cross.setAttribute('x2', cx(i)); cross.setAttribute('visibility', 'visible');
    if (b.v != null) { dot.setAttribute('cx', cx(i)); dot.setAttribute('cy', y(b.v)); dot.setAttribute('visibility', 'visible'); } else dot.setAttribute('visibility', 'hidden');
    tip.innerHTML = `<div class="tt-time">${esc(rangeLabel(b))}</div>
      <div class="tt-main">${b.v == null ? 'Pas encore de données' : `${esc(b.l || '')}`}</div>
      ${b.v == null ? '' : `<div class="tt-row"><span>${esc(unit)}</span><b>${fmt(b.v)}</b></div>
      <div class="tt-row"><span>Variation</span>${deltaHtml(b.delta)}</div>
      <div class="tt-row"><span>Matchs</span><b>${b.n}</b></div>`}`;
    tip.style.display = 'block';
    const scaleX = rect.width / W;
    let left = cx(i) * scaleX + 14;
    if (left + tip.offsetWidth > rect.width) left = cx(i) * scaleX - tip.offsetWidth - 14;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, (b.v != null ? y(b.v) : pad.t) * scaleX - 30)}px`;
  });
}

function gameColor(game) { return getComputedStyle(document.documentElement).getPropertyValue(`--${game}`).trim(); }

function render() {
  const games = data.games;
  $('#period-label').textContent = `Variation sur ${SCALES[scale].label}`;
  document.querySelectorAll('#scale button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scale === scale)));

  $('#banner').innerHTML = data.demo
    ? `<div class="banner"><span>🎮</span><span><strong>Mode démo</strong> — ces stats sont fictives. Configure tes comptes pour voir les tiennes.</span><a class="btn" href="/reglages">Configurer</a></div>`
    : '';

  if (!games.length) {
    $('#overview').innerHTML = '';
    $('#details').innerHTML = `<div class="card empty"><h2>Aucun jeu activé</h2><p>Choisis tes jeux et renseigne tes comptes pour commencer le suivi.</p><a class="btn primary" href="/reglages">Ajouter mes jeux</a></div>`;
    return;
  }

  let tiles = ''; let panels = '';
  for (const game of games) {
    const info = GAME_INFO[game];
    const st = data.status[game] || {};
    const qs = data.history[game] || {};
    const qk = mainQueue(game);
    const q = qk ? qs[qk] : null;
    const color = gameColor(game);
    const sum = q ? summary(q.points) : null;

    tiles += `<button class="card tile" data-game="${game}" data-goto="${game}" type="button">
      <div class="tile-head"><div class="game-badge">${info.short}</div><span class="tile-name">${info.name}</span><span class="tile-queue">${esc(q?.name || '')}</span></div>
      <div class="tile-rank">${sum?.current ? esc(sum.current.l || fmt(sum.current.v)) : '<span style="color:var(--muted)">En attente…</span>'}</div>
      <div class="tile-foot">
        <div><div class="tile-value">${sum?.current ? `${fmt(sum.current.v)} ${esc(q.unit)}` : (st.error ? 'Erreur — voir détail' : 'Pas encore de données')}</div>${sum ? deltaHtml(sum.delta) : ''}</div>
        ${sum ? sparkline(sum.s, color) : ''}
      </div>
    </button>`;

    const chips = Object.entries(qs).filter(([, v]) => v.points?.length).map(([k, v]) => `<button class="chip" type="button" data-queue="${k}" aria-pressed="${k === qk}">${esc(v.name)}</button>`).join('');
    const meta = st.meta || {};
    const wl = meta.wins != null ? `<div class="stat"><div class="stat-label">Victoires / défaites (saison)</div><div class="stat-value">${meta.wins} / ${meta.losses}</div><div class="stat-sub">${meta.wins + meta.losses ? Math.round((meta.wins / (meta.wins + meta.losses)) * 100) + ' % de victoires' : ''}</div></div>` : '';
    panels += `<section class="card panel" data-game="${game}" id="game-${game}">
      <div class="panel-head">
        <div class="game-badge">${info.short}</div>
        <div><h2>${info.name}</h2><div class="player">${esc(meta.player || '')}</div></div>
        <div class="queues">${Object.keys(qs).length > 1 ? chips : ''}</div>
      </div>
      ${sum ? `<div class="stats">
        <div class="stat"><div class="stat-label">Rang actuel</div><div class="stat-value">${esc(sum.current.l || '—')}</div><div class="stat-sub">${fmt(sum.current.v)} ${esc(q.unit)}</div></div>
        <div class="stat"><div class="stat-label">Variation (${SCALES[scale].label})</div><div class="stat-value">${deltaHtml(sum.delta)}</div><div class="stat-sub">${esc(q.unit)}</div></div>
        <div class="stat"><div class="stat-label">Pic sur la période</div><div class="stat-value">${sum.peak != null ? fmt(sum.peak) : '—'}</div><div class="stat-sub">${esc(q.unit)}</div></div>
        <div class="stat"><div class="stat-label">${q.series === false ? 'Changements de rang' : 'Matchs'}</div><div class="stat-value">${sum.matches}</div><div class="stat-sub">sur ${SCALES[scale].label}</div></div>
        ${wl}
      </div>
      <div class="chart" data-chart="${game}"></div>` : `<p class="lead" style="margin:16px 0 0">${st.error ? '' : 'Les données arrivent à la prochaine actualisation.'}</p>`}
      <div class="panel-foot">
        ${st.error ? `<span class="err">⚠ ${esc(st.error)}</span>` : ''}
      </div>
    </section>`;
  }
  $('#overview').innerHTML = tiles;
  $('#details').innerHTML = panels;
  drawCharts();
}

function drawCharts() {
  document.querySelectorAll('[data-chart]').forEach((el) => {
    const game = el.dataset.chart;
    const q = data.history[game][mainQueue(game)];
    drawChart(el, series(q.points), gameColor(game), q.unit);
  });
}

function updatedLabel() {
  const times = Object.values(data?.status || {}).map((s) => s.updatedAt).filter(Boolean);
  if (!times.length) return $('#updated').textContent = '';
  const ago = Math.round((Date.now() - Math.max(...times)) / MIN);
  $('#updated').textContent = ago < 1 ? 'Mis à jour à l\'instant' : `Mis à jour il y a ${ago} min`;
}

async function load() {
  data = await fetch('/api/stats').then((r) => r.json());
  render();
  updatedLabel();
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ------------------------------------------------------------- Événements */

$('#scale').addEventListener('click', (e) => {
  const b = e.target.closest('[data-scale]');
  if (!b) return;
  scale = b.dataset.scale; store.set('scale', scale); render();
});

document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-queue]');
  if (chip) {
    const game = chip.closest('[data-game]').dataset.game;
    selectedQueue[game] = chip.dataset.queue; store.set('queues', selectedQueue); render();
  }
  const tile = e.target.closest('[data-goto]');
  if (tile) document.getElementById(`game-${tile.dataset.goto}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});


$('#refresh').addEventListener('click', async () => {
  const btn = $('#refresh');
  btn.disabled = true; btn.classList.add('loading');
  try { await fetch('/api/refresh', { method: 'POST' }); await load(); toast('Stats actualisées'); } catch { toast('Serveur injoignable'); }
  btn.disabled = false; btn.classList.remove('loading');
});

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => data && drawCharts(), 120); });
setInterval(() => load().catch(() => {}), 60e3);
setInterval(() => data && updatedLabel(), 30e3);

load().catch(() => { $('#details').innerHTML = '<div class="card empty"><h2>Serveur injoignable</h2><p>Lance <b>start.bat</b> (ou <code>npm start</code>) puis recharge la page.</p></div>'; });
