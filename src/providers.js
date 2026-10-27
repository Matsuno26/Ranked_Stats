// Récupération des stats ranked pour chaque jeu.
// Chaque provider renvoie : { queues: [{ key, name, unit, points: [{ t, v, l }], series }], meta }
//   - series: true  => les points ont un vrai horodatage par match (historique complet)
//   - series: false => instantané "maintenant" (on enregistre seulement si la valeur change)

import { valorantRank, RL_TIERS, rlIcon, r6RankFromRP, r6RankFromName } from './ranks.js';

const UA = 'RankedStats/1.0 (suivi perso)';

async function getJson(url, headers = {}, label = 'API') {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Error(`${label} injoignable (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message})`);
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* réponse non JSON */ }
  if (!res.ok) {
    const detail = body?.errors?.[0]?.message || body?.error || body?.message || body?.detail || '';
    const hints = {
      400: 'requête invalide, vérifie les champs',
      401: 'clé API invalide ou manquante',
      403: 'accès refusé (clé API ou profil privé)',
      404: 'joueur introuvable, vérifie le pseudo',
      429: 'trop de requêtes, réessaie dans un moment',
    };
    throw new Error(`${label} : ${hints[res.status] || 'erreur ' + res.status}${detail ? ' — ' + String(detail).slice(0, 160) : ''}`);
  }
  return body;
}

// Les clés API sont côté serveur (fichier .env), jamais demandées au joueur.
function serverKey(name, game) {
  const key = process.env[name]?.trim();
  if (!key) throw new Error(`${game} pas encore disponible : la clé ${name} n'est pas renseignée dans le fichier .env du serveur`);
  return key;
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/* ------------------------------------------------------------------ Valorant */
// API non officielle HenrikDev : https://docs.henrikdev.xyz (clé gratuite via leur Discord)
async function valorant(cfg) {
  if (!cfg.name || !cfg.tag) throw new Error('Renseigne ton Riot ID (pseudo + tag)');
  const key = serverKey('HENRIK_API_KEY', 'Valorant');
  const region = cfg.region || 'eu';
  const platform = cfg.platform || 'pc';
  const url = `https://api.henrikdev.xyz/valorant/v2/mmr-history/${region}/${platform}/${encodeURIComponent(cfg.name)}/${encodeURIComponent(cfg.tag.replace(/^#/, ''))}`;
  const body = await getJson(url, { Authorization: key }, 'HenrikDev');
  const history = body?.data?.history || [];
  const points = history
    .map((h) => { const rk = valorantRank(h.tier?.id); return { t: Date.parse(h.date), v: h.elo, l: rk.name, i: rk.icon, r: h.rr }; })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  return {
    queues: [{ key: 'competitive', name: 'Compétitif', unit: 'ELO', series: true, points }],
    meta: { player: `${body?.data?.account?.name || cfg.name}#${body?.data?.account?.tag || cfg.tag}` },
  };
}

/* ----------------------------------------------------------------- Overwatch */
// OverFast API (non officielle, sans clé) : https://overfast-api.tekrop.fr
// Overwatch ne publie pas de MMR : on convertit le rang (division + tier) en "SR estimé".
const OW_DIVS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'grandmaster', 'champion', 'ultimate'];
const OW_NAMES = { bronze: 'Bronze', silver: 'Argent', gold: 'Or', platinum: 'Platine', diamond: 'Diamant', master: 'Maître', grandmaster: 'Grand maître', champion: 'Champion', ultimate: 'Top 500' };
const OW_ROLES = { tank: 'Tank', damage: 'Dégâts', support: 'Soutien', open: 'File libre' };

async function overwatch(cfg) {
  // Identifiant Blizzard (choisi dans Mes comptes) en priorité : la recherche par BattleTag ne marche plus pour tout le monde.
  const blizzardId = /^[0-9a-f]+(%7C|\|)[0-9a-f]+$/i.test(cfg.blizzardId || '') ? cfg.blizzardId.replace('|', '%7C') : '';
  if (!blizzardId && !cfg.battletag) throw new Error('Renseigne ton BattleTag (ex : Pseudo#1234)');
  const id = blizzardId || encodeURIComponent(cfg.battletag.trim().replace('#', '-'));
  let body;
  try {
    body = await getJson(`https://overfast-api.tekrop.fr/players/${id}/summary`, {}, 'OverFast');
  } catch (e) {
    if (!blizzardId && /introuvable/.test(e.message)) throw new Error('Profil introuvable par BattleTag : clique sur « Vérifier le compte » dans Mes comptes et choisis ton profil');
    throw e;
  }
  const comp = body?.competitive?.[cfg.platform || 'pc'];
  if (!comp) throw new Error('Aucun rang trouvé : profil privé ou pas de placement cette saison (mets ta carrière en "Public" dans les options du jeu)');
  const now = Date.now();
  const queues = [];
  for (const [role, name] of Object.entries(OW_ROLES)) {
    const r = comp[role];
    if (!r?.division) continue;
    const idx = OW_DIVS.indexOf(r.division);
    const tier = Number(r.tier) || 5;
    const v = idx < 0 ? 0 : 1000 + idx * 500 + (5 - tier) * 100;
    queues.push({ key: role, name, unit: 'SR estimé', series: false, points: [{ t: now, v, l: `${OW_NAMES[r.division] || cap(r.division)} ${tier}`, i: r.rank_icon || undefined }] });
  }
  if (!queues.length) throw new Error(`Pas encore de rang classé en saison ${comp.season ?? 'actuelle'}`);
  return { queues, meta: { player: body?.username || cfg.battletag, season: comp.season } };
}

/* ------------------------------------------------------------- Rocket League */
// ballchasing.com (clé gratuite) : lit le rang des matchs ranked uploadés (BakkesMod).
const RL_PLAYLISTS = {
  'ranked-duels': '1v1', 'ranked-doubles': '2v2', 'ranked-standard': '3v3', 'ranked-solo-standard': '3v3 solo',
  'ranked-hoops': 'Hoops', 'ranked-rumble': 'Rumble', 'ranked-dropshot': 'Dropshot', 'ranked-snowday': 'Snow Day',
};

async function rocketleague(cfg) {
  const key = serverKey('BALLCHASING_API_KEY', 'Rocket League');
  if (!cfg.name && !cfg.playerId) throw new Error('Renseigne ton pseudo (ou ton ID de plateforme)');
  const platform = cfg.platform || 'epic';
  const params = new URLSearchParams({ 'sort-by': 'replay-date', 'sort-dir': 'desc', count: '200' });
  if (cfg.playerId) params.set('player-id', `${platform}:${cfg.playerId}`);
  else params.set('player-name', cfg.name);
  const body = await getJson(`https://ballchasing.com/api/replays?${params}`, { Authorization: key }, 'ballchasing');

  const wantedId = String(cfg.playerId || '').toLowerCase();
  const wantedName = String(cfg.name || '').toLowerCase();
  const byQueue = {};
  let hasMmr = false; let ranked = 0; let foundName = '';
  for (const r of body?.list || []) {
    const pl = r.playlist_id;
    if (!pl || !pl.startsWith('ranked')) continue;
    ranked++;
    const players = [...(r.blue?.players || []), ...(r.orange?.players || [])];
    // ballchasing filtre déjà par pseudo, mais le nom en jeu peut contenir un suffixe (ex : "zen 0000").
    const name = (p) => String(p.name || '').toLowerCase();
    const me = players.find((p) => wantedId && String(p.id?.id || '').toLowerCase() === wantedId)
      || players.find((p) => wantedName && name(p) === wantedName)
      || players.find((p) => wantedName && name(p).includes(wantedName));
    if (!me) continue;
    foundName ||= me.name;
    const t = Date.parse(r.date || r.created);
    let v = null; let l = ''; let icon; let dv;
    if (Number.isFinite(me.mmr)) { v = me.mmr; hasMmr = true; }
    // Le rang n'est présent que si le replay a été uploadé avec (BakkesMod) : sinon le match est ignoré.
    if (me.rank?.tier != null) {
      const tier = Number(me.rank.tier); const div = Number(me.rank.division);
      l = RL_TIERS[tier] || me.rank.name || `Rang ${tier}`;
      icon = rlIcon(tier); dv = div || undefined;
      if (v == null) v = tier * 100 + ((div || 1) - 1) * 25; // indice de rang si pas de MMR exact
    }
    if (v == null || !Number.isFinite(t)) continue;
    (byQueue[pl] ||= []).push({ t, v, l, i: icon, dv });
  }
  const queues = Object.entries(byQueue).map(([pl, points]) => ({
    key: pl, name: RL_PLAYLISTS[pl] || pl, unit: hasMmr ? 'MMR' : 'Indice de rang', series: true,
    points: points.sort((a, b) => a.t - b.t),
  }));
  if (!queues.length) {
    throw new Error(ranked
      ? 'Matchs trouvés sur ballchasing mais sans rang enregistré : active l\'upload automatique avec le plugin BakkesMod'
      : 'Aucun match ranked trouvé sur ballchasing pour ce joueur (active l\'upload automatique dans BakkesMod)');
  }
  return { queues, meta: { player: foundName || cfg.name || cfg.playerId } };
}

/* -------------------------------------------------------- Rainbow Six Siege */
// R6 Data / Arenyze (clé gratuite) : https://r6.arenyze.com/api-docs

// La structure exacte de la réponse varie selon la version : on cherche l'objet qui porte les "rank_points".
function findRanked(node, path = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.rank_points === 'number') out.push({ obj: node, path });
  for (const [k, child] of Object.entries(node)) {
    const tag = child && typeof child === 'object' && child.board_id ? `${k}[${child.board_id}]` : k;
    findRanked(child, `${path}/${tag}`, out);
  }
  return out;
}

async function r6(cfg) {
  if (!cfg.name) throw new Error('Renseigne ton pseudo Ubisoft');
  const key = serverKey('R6DATA_API_KEY', 'Rainbow Six');
  const params = new URLSearchParams({ nameOnPlatform: cfg.name, platformType: cfg.platform || 'uplay' });
  const body = await getJson(`https://public-api.arenyze.com/r6/api/v2/profile?${params}`, { 'api-key': key }, 'R6 Data');
  const found = findRanked(body);
  if (!found.length) throw new Error('Pas de stats ranked dans la réponse (pas encore classé cette saison ?)');
  const pick = found.find((f) => /ranked/i.test(f.path)) || found[0];
  const o = pick.obj;
  const rp = o.rank_points;
  const meta = { player: body?.player?.nameOnPlatform || cfg.name, wins: o.wins, losses: o.losses, peak: o.max_rank_points };

  // L'API fournit aussi l'historique daté des rank points : on s'en sert comme historique par match.
  const raw = body?.history?.data?.history?.data;
  const history = (Array.isArray(raw) ? raw : [])
    .map(([date, e]) => { const v = Number(e?.value); const rk = r6RankFromName(e?.metadata?.rank) || r6RankFromRP(v); return { t: Date.parse(date), v, l: rk.name, i: rk.icon }; })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0)
    .sort((a, b) => a.t - b.t);
  if (history.length) {
    return { queues: [{ key: 'ranked', name: 'Classé', unit: 'RP', series: true, points: history }], meta };
  }
  return {
    queues: [{ key: 'ranked', name: 'Classé', unit: 'RP', series: false, points: [{ t: Date.now(), v: rp, l: r6RankFromRP(rp).name, i: r6RankFromRP(rp).icon }] }],
    meta,
  };
}


export const PROVIDERS = { valorant, overwatch, rocketleague, r6 };
