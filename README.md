# Ranked Stats

Petit site local pour suivre ta progression ranked sur **Valorant, Overwatch 2, Rocket League et Rainbow Six Siege**, par minute, heure, jour ou semaine.

## Lancer

Double-clique sur **`start.bat`** (ou `npm start`) : le site s'ouvre sur http://localhost:3000.
Aucune dépendance à installer, il faut seulement Node.js 20 ou plus.

- **Stats** (`/`) : aperçu de tous tes jeux + un graphique par jeu (courbe du MMR et barres de gain/perte par intervalle).
- **Réglages** (`/reglages`) : coche tes jeux, renseigne tes comptes, teste la connexion.

Le mode démo est activé au premier lancement pour voir le rendu ; il se coupe dans les réglages.

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

Le serveur interroge les APIs toutes les X minutes (réglable) et enregistre les points dans `data/history.json` :

- Valorant et Rocket League donnent un historique **par match** : on récupère aussi les matchs passés.
- Overwatch et R6 ne donnent que le rang **actuel** : on enregistre un point à chaque changement. Le suivi commence donc au premier lancement, et laisser le serveur tourner donne un historique plus précis.

Tes réglages restent sur ton PC (`data/config.json`), les clés dans `.env`, le serveur n'écoute que sur `localhost`.

## Mise en ligne (Render, gratuit)

1. Sur [render.com](https://render.com), connecte-toi avec GitHub puis **New → Blueprint** et choisis ce dépôt (`render.yaml` est déjà prêt).
2. Render demande les variables secrètes : colle les 3 clés de ton `.env` et choisis un `ADMIN_PASSWORD`.
3. Le site est en ligne sur `https://ranked-stats-xxxx.onrender.com`.

En ligne, tout le monde peut voir les stats mais la page Réglages demande le mot de passe admin.

Limites de l'offre gratuite :
- le site s'endort après 15 min sans visite (premier chargement ≈ 1 min) ;
- le disque est remis à zéro à chaque redémarrage. Valorant, Rocket League et R6 récupèrent leur historique depuis les APIs, mais pas Overwatch ;
- les réglages faits en ligne sont perdus au redémarrage : pour qu'ils restent, mets-les dans `site.config.json` à la racine du dépôt (même format que `data/config.json`, sans clé API).
