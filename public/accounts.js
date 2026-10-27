// Comptes de jeu du visiteur : enregistrés uniquement dans son navigateur.

const ACCOUNT_GAMES = [
  {
    id: 'valorant', name: 'Valorant', short: 'V', desc: 'ELO / RR par match', required: ['name', 'tag'],
    fields: [
      { k: 'name', label: 'Pseudo Riot', ph: 'TonPseudo' },
      { k: 'tag', label: 'Tag', ph: 'EUW', hint: 'Ce qui suit le # de ton Riot ID' },
      { k: 'region', label: 'Région', type: 'select', options: [['eu', 'Europe'], ['na', 'Amérique du Nord'], ['ap', 'Asie-Pacifique'], ['kr', 'Corée'], ['latam', 'LATAM'], ['br', 'Brésil']] },
      { k: 'platform', label: 'Plateforme', type: 'select', options: [['pc', 'PC'], ['console', 'Console']] },
    ],
    help: 'Ton Riot ID est affiché sur ton profil Riot (ex : <b>Pseudo#EUW</b>).',
  },
  {
    id: 'overwatch', name: 'Overwatch 2', short: 'OW', desc: 'Rang par rôle (SR estimé)', required: ['battletag'],
    fields: [
      { k: 'battletag', label: 'BattleTag', ph: 'Pseudo#1234' },
      { k: 'platform', label: 'Plateforme', type: 'select', options: [['pc', 'PC'], ['console', 'Console']] },
    ],
    help: 'Ton profil doit être <b>public</b> : en jeu, Options → Social → Visibilité du profil de carrière → Public.',
  },
  {
    id: 'rocketleague', name: 'Rocket League', short: 'RL', desc: 'Rang par mode (1v1, 2v2, 3v3…)', required: [['name', 'playerId']],
    fields: [
      { k: 'name', label: 'Pseudo en jeu', ph: 'TonPseudo' },
      { k: 'platform', label: 'Plateforme', type: 'select', options: [['epic', 'Epic Games'], ['steam', 'Steam'], ['ps4', 'PlayStation'], ['xbox', 'Xbox'], ['switch', 'Switch']] },
      { k: 'playerId', label: 'ID de plateforme (optionnel)', ph: 'ex : 7656119…', hint: 'Plus fiable que le pseudo' },
    ],
    help: 'Tes rangs sont lus sur <a href="https://ballchasing.com" target="_blank" rel="noopener">ballchasing.com</a> : installe <a href="https://bakkesmod.com" target="_blank" rel="noopener">BakkesMod</a> (PC) et active l\'upload automatique de tes replays ranked.',
  },
  {
    id: 'r6', name: 'Rainbow Six Siege', short: 'R6', desc: 'Rank points (RP)', required: ['name'],
    fields: [
      { k: 'name', label: 'Pseudo Ubisoft', ph: 'TonPseudo' },
      { k: 'platform', label: 'Plateforme', type: 'select', options: [['uplay', 'PC (Ubisoft Connect)'], ['psn', 'PlayStation'], ['xbl', 'Xbox']] },
    ],
    help: 'Ton pseudo Ubisoft Connect exact (celui affiché en jeu).',
  },
];

const Accounts = {
  load() {
    try { return JSON.parse(localStorage.getItem('rs.accounts')) || {}; } catch { return {}; }
  },
  save(all) {
    try { localStorage.setItem('rs.accounts', JSON.stringify(all)); return true; } catch { return false; }
  },
  // Un jeu est actif dès que ses champs obligatoires sont remplis (["a","b"] = l'un ou l'autre).
  isFilled(game, acc) {
    const def = ACCOUNT_GAMES.find((g) => g.id === game);
    return !!acc && def.required.every((r) => (Array.isArray(r) ? r.some((k) => acc[k]?.trim()) : acc[r]?.trim()));
  },
  active() {
    const all = this.load();
    return ACCOUNT_GAMES.filter((g) => this.isFilled(g.id, all[g.id])).map((g) => ({ game: g.id, account: all[g.id] }));
  },
};
