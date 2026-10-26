// Ranked Stats — petit serveur : sert le site, interroge les APIs et garde l'historique.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import crypto from 'node:crypto';
import { PROVIDERS } from './src/providers.js';
import { loadConfig, saveConfig, getHistory, mergeQueue, clearHistory } from './src/store.js';
import { demoHistory, demoMeta } from './src/demo.js';

try { process.loadEnvFile(path.join(import.meta.dirname, '.env')); } catch { /* pas de .env : jeux à clé indisponibles */ }

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // en ligne : HOST=0.0.0.0
// En ligne, ADMIN_PASSWORD protège les réglages : les visiteurs voient les stats sans pouvoir les modifier.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC = path.join(import.meta.dirname, 'public');
const GAMES = Object.keys(PROVIDERS);

let config = loadConfig();
const status = {}; // { [game]: { ok, error, updatedAt, meta } }
let pollTimer = null;
let polling = null;
let lastPoll = 0;

async function pollGame(game) {
  const cfg = config.games[game];
  try {
    const res = await PROVIDERS[game](cfg);
    for (const q of res.queues) mergeQueue(game, q);
    status[game] = { ok: true, error: null, updatedAt: Date.now(), meta: res.meta || {} };
  } catch (e) {
    status[game] = { ok: false, error: e.message, updatedAt: Date.now(), meta: status[game]?.meta || {} };
  }
  return status[game];
}

// Une seule actualisation à la fois : un appel pendant qu'elle tourne attend la même.
function pollAll() {
  polling ||= (async () => {
    for (const g of GAMES) if (config.games[g].enabled) await pollGame(g);
  })().finally(() => { polling = null; lastPoll = Date.now(); });
  return polling;
}

function schedule() {
  clearInterval(pollTimer);
  const minutes = Math.min(60, Math.max(1, Number(config.pollMinutes) || 5));
  pollTimer = setInterval(pollAll, minutes * 60e3);
  pollAll();
}

/* ------------------------------------------------------------------ HTTP */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON invalide')); } });
  });
}

function sanitizeConfig(input) {
  const next = loadConfig();
  next.pollMinutes = Math.min(60, Math.max(1, Number(input.pollMinutes) || 5));
  next.demo = !!input.demo;
  for (const g of GAMES) {
    const src = input.games?.[g] || {};
    for (const k of Object.keys(next.games[g])) {
      if (k === 'enabled') next.games[g].enabled = !!src.enabled;
      else if (src[k] != null) next.games[g][k] = String(src[k]).trim();
    }
  }
  return next;
}

function isAdmin(req) {
  if (!ADMIN_PASSWORD) return true;
  const given = Buffer.from(String(req.headers['x-admin-password'] || ''));
  const expected = Buffer.from(ADMIN_PASSWORD);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /api/config') return send(res, 200, { ...config, locked: !!ADMIN_PASSWORD });
  const adminOnly = route === 'POST /api/config' || route === 'POST /api/clear' || url.pathname.startsWith('/api/test/');
  if (adminOnly && !isAdmin(req)) return send(res, 401, { ok: false, error: 'Mot de passe admin incorrect' });
  if (route === 'POST /api/config') {
    config = sanitizeConfig(await readBody(req));
    saveConfig(config);
    schedule();
    return send(res, 200, config);
  }
  if (route === 'GET /api/stats') {
    const enabled = GAMES.filter((g) => config.games[g].enabled);
    if (config.demo) {
      const meta = demoMeta();
      return send(res, 200, { demo: true, games: GAMES, history: demoHistory(), status: Object.fromEntries(GAMES.map((g) => [g, { ok: true, updatedAt: Date.now(), meta: meta[g] }])) });
    }
    const hist = getHistory();
    return send(res, 200, { demo: false, games: enabled, history: Object.fromEntries(enabled.map((g) => [g, hist[g] || {}])), status, polling: !!polling, pollMinutes: config.pollMinutes });
  }
  if (route === 'POST /api/refresh') {
    // Évite qu'un visiteur épuise les quotas des APIs en spammant le bouton.
    if (Date.now() - lastPoll > 30e3 || polling) await pollAll();
    return send(res, 200, { ok: true, status });
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/test/')) {
    const game = url.pathname.split('/').pop();
    if (!PROVIDERS[game]) return send(res, 404, { error: 'Jeu inconnu' });
    const body = await readBody(req);
    const cfg = { ...config.games[game], ...(body || {}) };
    try {
      const r = await PROVIDERS[game](cfg);
      const summary = r.queues.map((q) => { const p = q.points[q.points.length - 1]; return `${q.name} : ${p?.l || p?.v}`; });
      return send(res, 200, { ok: true, player: r.meta?.player, summary, matches: r.queues.reduce((n, q) => n + q.points.length, 0) });
    } catch (e) { return send(res, 200, { ok: false, error: e.message }); }
  }
  if (route === 'POST /api/clear') {
    const { game } = await readBody(req);
    clearHistory(PROVIDERS[game] ? game : null);
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Route inconnue' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    if (file === '/reglages') file = '/settings.html';
    const full = path.normalize(path.join(PUBLIC, file));
    if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\n  Ranked Stats tourne sur ${link}\n  (Ctrl+C pour arrêter)\n`);
  if (process.argv.includes('--open')) exec(process.platform === 'win32' ? `start "" ${link}` : `open ${link}`);
  schedule();
});
