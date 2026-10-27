// Historique des joueurs, stocké en JSON (dossier data/).
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(import.meta.dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_POINTS = 5000;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// history = { [playerKey]: { [queueKey]: { name, unit, series, points: [{ t, v, l }] } } }
// playerKey identifie un compte d'un jeu, ex : "valorant:eu:pc:pseudo#tag".
const history = readJson(HISTORY_FILE, {});
export const getPlayerHistory = (key) => history[key] || {};

let saveTimer = null;
function scheduleSave() {
  // Écriture groupée : plusieurs joueurs mis à jour d'affilée = une seule écriture disque.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = HISTORY_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(history));
    fs.renameSync(tmp, HISTORY_FILE);
  }, 1000);
}

export function mergeQueue(key, q) {
  const g = (history[key] ||= {});
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
  if (changed) scheduleSave();
  return changed;
}
