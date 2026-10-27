// Noms de rang en français et icônes officielles de chaque jeu.

/* Valorant : icônes de valorant-api.com, par numéro de palier (3 = Fer 1 … 27 = Radiant). */
const VAL_SET = '03621f52-342b-cf4e-4f86-9350a49c6d04';
const VAL_NAMES = ['Fer', 'Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Ascendant', 'Immortel'];
export function valorantRank(tierId) {
  const id = Number(tierId);
  const name = id >= 27 ? 'Radiant' : id >= 3 ? `${VAL_NAMES[Math.floor((id - 3) / 3)]} ${((id - 3) % 3) + 1}` : 'Non classé';
  return { name, icon: `https://media.valorant-api.com/competitivetiers/${VAL_SET}/${Math.max(0, Math.min(27, id))}/largeicon.png` };
}

/* Rocket League : icônes de ballchasing.com, par palier (1 = Bronze I … 22 = Supersonic Legend). */
export const RL_TIERS = ['Non classé', 'Bronze I', 'Bronze II', 'Bronze III', 'Argent I', 'Argent II', 'Argent III', 'Or I', 'Or II', 'Or III',
  'Platine I', 'Platine II', 'Platine III', 'Diamant I', 'Diamant II', 'Diamant III', 'Champion I', 'Champion II', 'Champion III',
  'Grand Champion I', 'Grand Champion II', 'Grand Champion III', 'Supersonic Legend'];
// ballchasing range les icônes 256 px dans deux dossiers : « ranks » jusqu'à Grand Champion I, « f2p-ranks » au-delà.
export function rlIcon(tier) {
  const t = Math.max(0, Math.min(22, Number(tier) || 0));
  return `https://ballchasing.com/static/${t <= 19 ? 'ranks' : 'f2p-ranks'}/${t}.png`;
}

/* Rainbow Six : icônes d'Arenyze, nommées « palier-division » (ex : platinum-2). */
const R6_TIERS = [['copper', 'Cuivre'], ['bronze', 'Bronze'], ['silver', 'Argent'], ['gold', 'Or'], ['platinum', 'Platine'], ['emerald', 'Émeraude'], ['diamond', 'Diamant']];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const R6_BASE = 'https://r6.arenyze.com/assets/img/r6_ranks_img/';
export function r6RankFromRP(rp) {
  if (rp >= 4500) return { name: 'Champion', icon: `${R6_BASE}champion.webp` };
  if (!(rp > 0)) return { name: 'Non classé', icon: `${R6_BASE}unranked.webp` };
  const i = Math.max(0, Math.min(6, Math.floor((rp - 1000) / 500)));
  const div = 5 - Math.max(0, Math.min(4, Math.floor(((rp - 1000) % 500) / 100))); // 5 = V (bas) … 1 = I (haut)
  return { name: `${R6_TIERS[i][1]} ${ROMAN[div - 1]}`, icon: `${R6_BASE}${R6_TIERS[i][0]}-${div}.webp` };
}
// Nom renvoyé par l'API (« Platinum II », « Champion ») -> nom français + icône.
export function r6RankFromName(name) {
  const m = String(name || '').trim().match(/^([a-z]+)\s*([ivx]+|\d)?$/i);
  if (!m) return null;
  const tier = m[1].toLowerCase();
  if (tier === 'champion' || tier === 'champions') return { name: 'Champion', icon: `${R6_BASE}champion.webp` };
  if (tier === 'unranked') return { name: 'Non classé', icon: `${R6_BASE}unranked.webp` };
  const t = R6_TIERS.find(([en]) => en === tier);
  if (!t) return null;
  const div = /^\d$/.test(m[2] || '') ? Number(m[2]) : ROMAN.indexOf((m[2] || 'I').toUpperCase()) + 1 || 1;
  return { name: `${t[1]} ${ROMAN[div - 1]}`, icon: `${R6_BASE}${t[0]}-${div}.webp` };
}
