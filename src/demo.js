// Données factices pour voir le site tourner avant d'avoir branché ses comptes.
import { valorantRank, RL_TIERS, rlIcon, r6RankFromRP } from './ranks.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const OW_DIVS = ['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Maître', 'Grand maître', 'Champion'];

const GAMES = {
  valorant: {
    queues: [['competitive', 'Compétitif', 'ELO', 1480]], step: [14, 24],
    rank: (v) => { const rk = valorantRank(Math.min(27, Math.floor(v / 100) + 3)); return { l: rk.name, i: rk.icon, r: Math.round(v % 100) }; },
  },
  overwatch: {
    queues: [['tank', 'Tank', 'SR estimé', 2700], ['damage', 'Dégâts', 'SR estimé', 2950], ['support', 'Soutien', 'SR estimé', 3250]], step: [0, 100], snap: 100,
    rank: (v) => { const i = Math.min(7, Math.max(0, Math.floor((v - 1000) / 500))); return { l: `${OW_DIVS[i]} ${5 - Math.floor(((v - 1000) % 500) / 100)}` }; },
  },
  rocketleague: {
    queues: [['ranked-duels', '1v1', 'MMR', 905], ['ranked-doubles', '2v2', 'MMR', 1085], ['ranked-standard', '3v3', 'MMR', 1010]], step: [7, 12],
    rank: (v) => { const tier = Math.min(22, Math.max(1, Math.floor((v - 100) / 72) + 1)); return { l: RL_TIERS[tier], i: rlIcon(tier), dv: 1 + (Math.floor(v / 18) % 4) }; },
  },
  r6: {
    queues: [['ranked', 'Classé', 'RP', 3180]], step: [18, 28],
    rank: (v) => { const rk = r6RankFromRP(v); return { l: rk.name, i: rk.icon }; },
  },
};

export function demoHistory(now = Date.now()) {
  const out = {};
  const MIN = 60e3; const DAY = 86400e3;
  let seed = 7;
  for (const [game, def] of Object.entries(GAMES)) {
    out[game] = {};
    for (const [key, name, unit, base] of def.queues) {
      const r = rng(seed++ * 9973);
      const pts = [];
      let v = base - 260 - r() * 120;
      const push = (t) => {
        const win = r() < 0.54;
        const amt = def.step[0] + r() * (def.step[1] - def.step[0]);
        v += (win ? amt : -amt) + (base - v) * 0.03; // marche aléatoire qui reste autour du niveau de base
        const val = def.snap ? Math.round(v / def.snap) * def.snap : Math.round(v);
        if (def.snap && pts.length && pts[pts.length - 1].v === val) return;
        pts.push({ t, v: val, ...def.rank(val) });
      };
      // 120 jours de sessions le soir
      for (let d = 120; d >= 1; d--) {
        if (r() < 0.4) continue;
        let t = now - d * DAY + (r() * 3 - 6) * 3600e3;
        const n = 2 + Math.floor(r() * 6);
        for (let i = 0; i < n; i++) { t += (24 + r() * 14) * MIN; push(t); }
      }
      // session en cours : matchs rapprochés dans les 2 dernières heures
      let t = now - 115 * MIN - r() * 10 * MIN;
      while (t < now - 3 * MIN) { push(t); t += (6 + r() * 10) * MIN; }
      out[game][key] = { name, unit, series: true, points: pts };
    }
  }
  return out;
}

export function demoMeta() {
  return {
    valorant: { player: 'Démo#EUW' },
    overwatch: { player: 'Démo#2142', season: 'démo' },
    rocketleague: { player: 'Démo' },
    r6: { player: 'Démo', wins: 64, losses: 51 },
  };
}
