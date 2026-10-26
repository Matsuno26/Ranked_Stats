// Stockage local en fichiers JSON (dossier data/).
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(import.meta.dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
// Réglages versionnés dans le dépôt : utilisés quand data/config.json n'existe pas (ex : hébergement en ligne).
const SITE_CONFIG_FILE = path.join(import.meta.dirname, '..', 'site.config.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_POINTS = 20000;

export const DEFAULT_CONFIG = {
  pollMinutes: 5,
  demo: true,
  games: {
    valorant: { enabled: false, name: '', tag: '', region: 'eu', platform: 'pc' },
    overwatch: { enabled: false, battletag: '', platform: 'pc' },
    rocketleague: { enabled: false, platform: 'epic', name: '', playerId: '' },
    r6: { enabled: false, name: '', platform: 'uplay' },
  },
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function loadConfig() {
  const saved = readJson(CONFIG_FILE, null) || readJson(SITE_CONFIG_FILE, {});
  const cfg = { ...DEFAULT_CONFIG, ...saved, games: {} };
  for (const [g, def] of Object.entries(DEFAULT_CONFIG.games)) {
    cfg.games[g] = {};
    for (const k of Object.keys(def)) cfg.games[g][k] = saved.games?.[g]?.[k] ?? def[k];
  }
  return cfg;
}
export function saveConfig(cfg) { writeJson(CONFIG_FILE, cfg); }

// history = { [game]: { [queueKey]: { name, unit, points: [{ t, v, l }] } } }
let history = readJson(HISTORY_FILE, {});
export const getHistory = () => history;

export function mergeQueue(game, q) {
  const g = (history[game] ||= {});
  const slot = (g[q.key] ||= { name: q.name, unit: q.unit, points: [] });
  slot.name = q.name; slot.unit = q.unit; slot.series = !!q.series;
  const pts = slot.points;
  let changed = false;
  if (q.series) {
    // Historique par match : on ajoute les matchs qu'on n'a pas encore.
    const seen = new Set(pts.map((p) => p.t));
    for (const p of q.points) if (!seen.has(p.t)) { pts.push(p); changed = true; }
    if (changed) pts.sort((a, b) => a.t - b.t);
  } else {
    // Instantané : on n'enregistre que lorsque la valeur ou le rang change.
    const p = q.points[q.points.length - 1];
    const last = pts[pts.length - 1];
    if (p && (!last || last.v !== p.v || last.l !== p.l)) { pts.push(p); changed = true; }
  }
  if (pts.length > MAX_POINTS) pts.splice(0, pts.length - MAX_POINTS);
  if (changed) writeJson(HISTORY_FILE, history);
  return changed;
}


export function clearHistory(game) {
  if (game) delete history[game]; else history = {};
  writeJson(HISTORY_FILE, history);
}
