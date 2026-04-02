# Thinkless

Thinkless est une plateforme web de gestion de matchs et de ligues sportives et e-sport réalisée pour le BTS SIO. L'application permet de créer un compte, rejoindre des sports et des jeux, organiser des matchs publics ou privés, créer des ligues, et gérer des ligues privées avec equipes pre-creees.

## Stack

- Node.js 20
- Express
- MySQL 8
- JWT
- bcryptjs
- HTML, Tailwind via CDN, JavaScript vanilla
- Docker Compose

## Structure

```text
Thinkless/
├── config/
│   └── db.js
├── controllers/
│   ├── authController.js
│   ├── esportController.js
│   ├── ligueController.js
│   ├── matchController.js
│   ├── profilController.js
│   └── userController.js
├── database/
│   ├── schema/
│   └── thinkless_db.sql
├── middlewares/
│   └── auth.js
├── public/
│   ├── accueil.html
│   ├── creer-ligue.html
│   ├── creer-ligue-esport.html
│   ├── creer-match.html
│   ├── equipe-esport.html
│   ├── index.html
│   ├── index-esport.html
│   ├── ligue.html
│   ├── ligue-esport-detail.html
│   ├── ligue-esport.html
│   ├── ligues.html
│   ├── ligues-esport.html
│   ├── login.html
│   ├── match.html
│   ├── match-esport.html
│   ├── profil.html
│   ├── rank-utils.js
│   └── register.html
├── routes/
│   ├── auth.js
│   ├── esport.js
│   ├── ligues.js
│   ├── matchs.js
│   ├── profil.js
│   └── users.js
├── docker-compose.yml
├── package.json
└── server.js
```

## Fonctionnalités

### Authentification et profil

- inscription et connexion JWT
- profil utilisateur avec sports, stats et informations de compte

### Matchs sport

- création de matchs publics et privés
- génération d'un code d'accès pour les matchs privés
- affichage des matchs ouverts
- accès direct au lobby du match après création
- prise en charge des sports solo et des sports en équipe

### E-sport

- creation d'equipes e-sport (capitaine + membres)
- demandes d'adhesion a une equipe e-sport
- creation de matchs e-sport (format, slots par equipe)
- participation des equipes aux matchs e-sport
- convocation des joueurs par le capitaine avec limite de slots
- enregistrement des resultats par equipe

### Ligues e-sport

- listing des ligues e-sport
- creation de ligues e-sport publiques/privees
- rejoindre une ligue privee par code
- lobby ligue e-sport (membres, classement, matchs)
- affichage du code prive dans le lobby pour les membres

### Sports solo

Les sports `tennis`, `badminton` et `padel` peuvent être créés en mode solo ou en équipe.

- si le mode équipe est désactivé, le match est créé en `1 vs 1`
- si le mode équipe est activé, le formulaire équipe classique reste disponible

### Ligues

- création de ligues publiques et privées
- formulaire multi-étapes pour la création de ligue
- code d'accès pour les ligues privées
- page ligue avec membres, classement et matchs
- classement par joueur pour les ligues solo
- classement par équipe pour les ligues avec équipes pré-créées

### Ligues privées avec équipes

Pour une ligue privée sur un sport d'équipe, l'application permet de :

- définir le nombre d'équipes
- définir le nombre de places par équipe
- pré-créer les équipes à la création de la ligue
- créer ensuite un match de ligue en choisissant simplement les équipes, la date et le lieu

Pour les sports solo, la ligue n'accepte pas de configuration d'équipes :

- `nb_equipe = 1`
- `slots_par_equipe = 1`
- classement conservé par joueur

## Base de données

Le schéma principal est dans `database/thinkless_db.sql`.

## Lancer le projet

### Prérequis

- Docker
- Docker Compose
- réseau Docker `f1_network`

### Créer le réseau Docker

```bash
docker network create f1_network
```

### Démarrer l'application

Depuis le dossier `Thinkless` :

```bash
docker-compose up -d
```

Services exposés :

- application web : `http://localhost:81`
- MySQL : `localhost:3307`

### Arrêter l'application

```bash
docker-compose down
```

## Points API utiles

### API ligues sport

- `GET /api/ligues`
- `POST /api/ligues`
- `GET /api/ligues/:id`
- `GET /api/ligues/:id/classement`
- `GET /api/ligues/:id/matchs`
- `GET /api/ligues/:id/equipes`
- `POST /api/ligues/:id/rejoindre`
- `POST /api/ligues/:id/quitter`

### API e-sport

- `GET /api/esport/jeux`
- `GET /api/esport/ligues`
- `POST /api/esport/ligues`
- `POST /api/esport/ligues/rejoindre-code`
- `GET /api/esport/ligues/classement/:jeuId`
- `GET /api/esport/ligues/:id`
- `GET /api/esport/ligues/:id/classement`
- `GET /api/esport/ligues/:id/matchs`
- `GET /api/esport/ligues/:id/equipes`
- `POST /api/esport/ligues/:id/rejoindre`
- `POST /api/esport/ligues/:id/quitter`

- `GET /api/esport/matchs`
- `POST /api/esport/matchs`
- `GET /api/esport/matchs/:id`
- `POST /api/esport/matchs/:id/rejoindre`
- `POST /api/esport/matchs/:id/convoques`
- `POST /api/esport/matchs/:id/resultat`

### API matchs

- `GET /api/matchs`
- `POST /api/matchs`
- `GET /api/matchs/:id`
- `POST /api/matchs/:id/rejoindre`
- `POST /api/matchs/rejoindre-code`

## Notes

- les matchs créés depuis une ligue ne remontent pas dans la liste globale des matchs
- les matchs privés restent visibles par leur créateur et leurs participants
- la logique de classement dépend de la présence ou non d'équipes pré-créées dans la ligue
- la table `Ligue` est partagee entre sport et e-sport (`sport_id` ou `jeu_id` selon le contexte)
