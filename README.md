# Ranked Stats

Petit site local pour suivre ta progression ranked sur **Valorant, Overwatch 2, Rocket League et Rainbow Six Siege**, par minute, heure, jour ou semaine.

## Lancer

Double-clique sur **`start.bat`** (ou `npm start`) : le site s'ouvre sur http://localhost:3000.
Aucune dépendance à installer, il faut seulement Node.js 20 ou plus.

- **Stats** (`/`) : aperçu de tous tes jeux + un graphique par jeu (courbe du MMR et barres de gain/perte par intervalle).
- **Mes comptes** (`/reglages`) : chaque visiteur tape ses pseudos. Ils sont gardés dans **son navigateur**, donc chacun voit ses propres stats.

Sans compte renseigné, le site affiche des données de démo.

## Clés API (une seule fois, côté serveur)

Les joueurs ne tapent jamais de clé : elles sont dans le fichier **`.env`** du serveur. Voir `.env.example` pour savoir où obtenir chacune (toutes gratuites) :

| Jeu | Source | Variable dans `.env` |
|---|---|---|
| Valorant | [HenrikDev API](https://docs.henrikdev.xyz) (Discord, salon #get-a-key) | `HENRIK_API_KEY` |
| Overwatch 2 | [OverFast API](https://overfast-api.tekrop.fr) | aucune |
| Rocket League | [ballchasing.com](https://ballchasing.com) (Upload → API key) | `BALLCHASING_API_KEY` |
| Rainbow Six Siege | [R6 Data / Arenyze](https://r6.arenyze.com) | `R6DATA_API_KEY` |

Redémarre le serveur après avoir modifié `.env`.

Rocket League n'a pas d'API publique de rangs : les replays ranked doivent être envoyés sur ballchasing (plugin BakkesMod, upload automatique).

## Comment l'historique est construit

Quand un visiteur ouvre la page Stats, le serveur va chercher les stats de ses comptes (avec un cache de 90 s par compte pour protéger les quotas) et les ajoute à `data/history.json` :

- Valorant, Rocket League et R6 donnent un historique **par match** : la courbe est remplie dès la première visite.
- Overwatch ne donne que le rang **actuel** : un point est ajouté à chaque changement constaté lors d'une visite.

## Mise en ligne (Render, gratuit)

1. Sur [render.com](https://render.com), connecte-toi avec GitHub puis **New → Blueprint** et choisis ce dépôt (`render.yaml` est déjà prêt).
2. Render demande les variables secrètes : colle les 3 clés de ton `.env`.
3. Le site est en ligne sur `https://ranked-stats-xxxx.onrender.com`.

Limites de l'offre gratuite :
- le site s'endort après 15 min sans visite (premier chargement ≈ 1 min) ;
- le disque est remis à zéro à chaque redémarrage : Valorant, Rocket League et R6 retrouvent leur historique depuis les APIs, mais l'historique Overwatch repart de zéro.
