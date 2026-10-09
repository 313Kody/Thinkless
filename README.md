# Thinkless

Thinkless est une application web mobile-first de gestion de matchs et de tournois amateurs, développée avec Node.js, Express, JavaScript vanilla, Tailwind CSS et MySQL. Le projet comprend également un module e-sport.

## Stack

- Node.js 20 (image utilisée par Docker)
- Express 5 et API REST
- JavaScript vanilla et pages HTML statiques
- Tailwind CSS via CDN
- MySQL 8 avec `mysql2`
- Authentification JWT et mots de passe hachés avec `bcryptjs`
- Docker Compose

## État du projet

### Fonctionnel dans le code actuel

- Inscription et connexion avec JWT ; gestion du profil, des sports et jeux associés.
- Création et gestion de matchs sportifs, publics ou privés, avec code d’accès, participants, équipes et résultats.
- Chronomètre sportif avec durée configurable, départ, pause, remise à zéro et clôture du match.
- Saisie live du score et des buteurs/passeurs pour les utilisateurs autorisés à gérer le match.
- Ligues sportives : adhésion par code, équipes précréées, capitaines, demandes d’inscription en équipe, classements, génération des poules/calendriers et phase finale.
- Attribution de rôles de ligue parmi `joueur`, `admin`, `arbitre`, `speaker`, `dj` et `table_marque`.
- Module e-sport : équipes, convocations, matchs et classements.
- Téléversement de logos d’équipes et de ligues.

### Ajouts récents (préparation du tournoi)

- **Dashboard staff** (`public/staff-dashboard.html`) : gestion centralisée de la ligue (aperçu, équipes et joueurs, matchs, paramètres), alertes SweetAlert2.
- **Poules et calendrier** : tirage, déplacement manuel d’une équipe entre poules avant verrouillage, génération automatique des matchs (Round-Robin : durée, pause, heure de début, terrains en alternance), clôture des poules et génération de la phase finale.
- **Matchs** : filtre par terrain, « Appliquer un retard » (décale les matchs non joués en BDD), report/annulation autorisés au staff.
- **Fin de match automatique** : fin de chrono → « terminé » en poule ; en phase finale → prolongation puis tirs au but, sans possibilité de forcer la fin sur une égalité.
- **Équipes et joueurs** : création/suppression d’équipe, import d’effectif en masse (« 1 - Chris, 2 - Idriss (C) »), numéros de maillot, modale de modification/transfert/suppression d’un joueur. Les joueurs sans compte (« ghost ») sont stockés dans `LigueJoueur`.
- **Accès simplifié** : `code_acces` par équipe, `POST /api/capitaine/login-code`, magic link `/claim/:code`, page `capitaine.html`.
- **QR codes** (générés côté client, aucun service tiers) : QR live spectateurs, QR capitaine (secret) et QR « Rejoindre » (partageable).
- **Page « Rejoindre »** (`/rejoindre/:equipeId/:jeton`, jeton HMAC) : inscription prénom/nom/numéro sans compte (`quickJoin`) ; si « Je veux être capitaine », email + mot de passe requis : compte Thinkless créé ou lié (mot de passe vérifié s’il existe), candidature stockée dans `LigueEquipe.demande_capitaine_id` (id utilisateur) puis validée ou refusée par le staff.
- **Live spectateur public** (`/api/live`, `ligue-live.html`) en lecture seule ; pour une ligue privée, le `?code=` doit correspondre au code de la ligue (renvoyé après inscription via le QR).
- **Docker 100 % portable** : `docker-compose.yml`, `.env.example`, `.gitignore` (`.env`, `node_modules`, `.history` retirés de l’index), `LEFT JOIN` sur `Sport`/`JeuEsport` pour les ligues e-sport et sportives.
- **Schéma automatique** : `utils/schema.js` (`ensureSchema`) ajoute les colonnes manquantes (`code_acces`, `demande_capitaine_id`, `numero`…).

### Reste à faire avant le test final

- **À tester en navigateur** (non testé de bout en bout) : QR et page Rejoindre, encadré candidature capitaine (sur une équipe sans capitaine), statut « terminé » depuis `ligue.html`, enchaînement prolongation/tirs au but.
- **Anciennes candidatures capitaine** (id de ghost) invalides depuis le passage à l’id utilisateur : à refuser dans le dashboard.
- **Phase finale** : `genererPhaseFinale` impose encore poule A ≥ 5 et poule B ≥ 4 équipes ; à adapter au format réel.
- **QR réseau** : le téléphone doit joindre le serveur (IP du PC ou domaine), `localhost` ne fonctionne pas ; prévoir une URL publique en production.
- **Jeton Rejoindre fixe** : prévoir un bouton « régénérer » en cas de fuite.
- **Permissions par rôle** : séparer arbitre (chrono/score) et table de marque (stats/cartons) côté serveur.
- **Cartons** : non implémentés.
- **PWA** : aucun `manifest.json` ni service worker.
- **Docker** : contrôle de santé MySQL, éviter `npm install` à chaque démarrage, vérifier `JWT_SECRET` en production.
- **Tests automatisés** : aucun script de test ou de lint dans `package.json`.
- **Git** : commit des changements Docker/`.gitignore` et des nouvelles fonctionnalités.

## Priorités avant le 24 octobre

1. **Recette complète sur la ligue de test** : poules → matchs → retard → fin de match → phase finale → live, avec des vrais téléphones.
2. **Valider le flux capitaine** : QR Rejoindre, candidature avec compte, validation par le staff, connexion par code/magic link.
3. **Verrouiller les permissions de match** côté serveur (arbitre / table / staff).
4. **Adapter la phase finale** au nombre réel d’équipes par poule.
5. **Fiabiliser le déploiement** (URL publique, HTTPS, secrets, santé MySQL).
6. **Optionnel** : cartons, PWA, tests automatisés.

## Lancement local

### Prérequis

- Node.js 20 ou version compatible avec les dépendances du projet
- MySQL 8 accessible depuis la machine

### Base de données

Créer la base puis importer le schéma et les données de référence :

```bash
mysql -u root -p -e "CREATE DATABASE thinkless_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -u root -p thinkless_db < database/thinkless_db.sql
```

Créer un fichier `.env` à la racine (ne pas le committer) :

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=remplacer_par_le_mot_de_passe_mysql
DB_NAME=thinkless_db
PORT=3000
JWT_SECRET=remplacer_par_une_cle_aleatoire_longue
```

Installer les dépendances et lancer le serveur :

```bash
npm install
npm start
```

L’application est disponible sur `http://localhost:3000`. Le endpoint de santé `GET /ping` vérifie la connexion à la base.

Pour le mode développement avec redémarrage automatique :

```bash
npm run dev
```

### Base MySQL dans Docker, application lancée sur l’hôte

Le Compose expose MySQL sur le port `3307`. Dans `.env`, utiliser `DB_HOST=127.0.0.1` et `DB_PORT=3307`, puis lancer l’application avec `npm start`.

## Lancement avec Docker Compose

Le fichier Compose utilise un réseau Docker externe nommé `f1_network`. Le créer une seule fois s’il n’existe pas :

```bash
docker network create f1_network
```

Puis démarrer les services :

```bash
docker compose up -d
```

- Application : `http://localhost:81`
- MySQL : `localhost:3307`

Arrêt :

```bash
docker compose down
```

Le dump `database/thinkless_db.sql` est monté dans le répertoire d’initialisation MySQL : il est exécuté lors de la création initiale du volume de base de données, pas à chaque redémarrage. Le service web installe les dépendances au démarrage du conteneur.

## Organisation du code

- `server.js` : application Express et montage des routes.
- `routes/` : endpoints API et middleware d’authentification.
- `controllers/` : logique métier.
- `public/` : pages HTML, JavaScript client et fichiers statiques.
- `config/db.js` : pool MySQL.
- `database/thinkless_db.sql` : schéma et données initiales.

## Proposition de commit

```text
feat(tournament): document current status and October 24 roadmap

- audit existing match, league, esports, and role workflows
- identify spectator, QR, jersey, PWA, and deployment gaps
- document local and Docker setup requirements
```
