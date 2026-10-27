// Ranked Stats — petit serveur : sert le site et va chercher les stats du compte demandé par chaque visiteur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { PROVIDERS } from './src/providers.js';
import { getPlayerHistory, mergeQueue } from './src/store.js';
import { demoHistory, demoMeta } from './src/demo.js';

try { process.loadEnvFile(path.join(import.meta.dirname, '.env')); } catch { /* pas de .env : jeux à clé indisponibles */ }

const PORT = Number(process.env.PORT) || 3000;
// En local : seulement ce PC. Sur Render : IPv4 et IPv6 (« :: »), son contrôle de santé passe par l'IPv6.
const HOST = process.env.RENDER ? '::' : (process.env.HOST || '127.0.0.1');
const PUBLIC = path.join(import.meta.dirname, 'public');
const CACHE_MS = 90e3; // un même compte n'est redemandé aux APIs qu'au bout de 90 s (protège les quotas)

// Champs acceptés pour chaque jeu (le reste est ignoré) et identifiant unique du compte.
const ACCOUNT = {
  valorant: { fields: ['name', 'tag', 'region', 'platform'], key: (a) => `${a.region || 'eu'}:${a.platform || 'pc'}:${a.name}#${a.tag}` },
  overwatch: { fields: ['battletag', 'platform'], key: (a) => `${a.platform || 'pc'}:${a.battletag}` },
  rocketleague: { fields: ['platform', 'name', 'playerId'], key: (a) => `${a.platform || 'epic'}:${a.playerId || a.name}` },
  r6: { fields: ['name', 'platform'], key: (a) => `${a.platform || 'uplay'}:${a.name}` },
};

const cache = new Map(); // playerKey -> { at, ok, error, meta, pending }

function cleanAccount(game, input = {}) {
  const out = {};
  for (const f of ACCOUNT[game].fields) out[f] = String(input[f] ?? '').trim().slice(0, 64);
  return out;
}

async function fetchPlayer(game, account, force) {
  const key = `${game}:${ACCOUNT[game].key(account).toLowerCase()}`;
  let entry = cache.get(key);
  const fresh = entry && Date.now() - entry.at < (force ? 20e3 : CACHE_MS);
  if (!fresh && !entry?.pending) {
    // Une seule requête à la fois par compte : les visiteurs simultanés attendent la même réponse.
    const pending = PROVIDERS[game](account)
      .then((res) => {
        for (const q of res.queues) mergeQueue(key, q);
        return { ok: true, error: null, meta: res.meta || {} };
      })
      .catch((e) => ({ ok: false, error: e.message, meta: cache.get(key)?.meta || {} }))
      .then((r) => { cache.set(key, { ...r, at: Date.now() }); });
    cache.set(key, { ...(entry || { at: 0 }), pending });
    entry = cache.get(key);
  }
  if (entry.pending) await entry.pending;
  const done = cache.get(key);
  return { game, ok: done.ok, error: done.error, meta: done.meta, updatedAt: done.at, history: getPlayerHistory(key) };
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
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON invalide')); } });
  });
}

async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /api/demo') {
    return send(res, 200, { history: demoHistory(), meta: demoMeta() });
  }
  if (route === 'POST /api/player') {
    const { game, account, force } = await readBody(req);
    if (!ACCOUNT[game]) return send(res, 400, { error: 'Jeu inconnu' });
    return send(res, 200, await fetchPlayer(game, cleanAccount(game, account), !!force));
  }
  return send(res, 404, { error: 'Route inconnue' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
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
});
