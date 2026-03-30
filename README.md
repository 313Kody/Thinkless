# Thinkless - Plateforme Sport & E-sport

## 📋 Vue d'ensemble

**Thinkless** est une application web complète développée dans le cadre du **BTS SIO - Épreuve E6**. Cette plateforme permet aux utilisateurs de trouver des joueurs proches pour participer à des sports physiques ou des e-sports, d'organiser des matchs et des ligues, et de gérer un système de ranking compétitif.

Le site propose un système de **gestion d'équipes e-sport** avec des badges spécialisés par jeu, ainsi que des **ligues privées** pour les sports physiques.

---

## 🏗️ Architecture du projet

Le projet suit le **pattern MVC (Model-View-Controller)** avec Node.js/Express :

```
Thinkless/
├── server.js                # Point d'entrée
├── package.json             # Dépendances Node.js
├── .env                     # Variables d'environnement
├── config/
│   └── db.js                # Configuration MySQL
├── controllers/             # Logique métier
│   ├── authController.js    # Authentification
│   ├── userController.js    # Gestion utilisateurs
│   ├── matchController.js   # Gestion matchs
│   └── ligueController.js   # Gestion ligues
├── middlewares/
│   └── auth.js              # Vérification JWT
├── routes/                  # Endpoints API REST
│   ├── auth.js
│   ├── users.js
│   ├── matchs.js
│   └── ligues.js
├── database/
│   └── thinkless_db.sql     # Schéma SQL
├── public/                  # Fichiers HTML
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── profil.html
│   ├── accueil.html
│   ├── creer-ligue.html
│   └── creer-match.html
├── docker-compose.yml       # Configuration Docker
└── README.md
```

---

## 🛠️ Technologies utilisées

- **Backend** : Node.js 20 + Express.js
- **Frontend** : HTML5, CSS3, JavaScript
- **Base de données** : MySQL 8.0
- **Authentification** : JWT (JSON Web Tokens)
- **Sécurité** : Bcryptjs (hachage de mots de passe)
- **Containerisation** : Docker & Docker Compose

---

## 🚀 Installation et démarrage

### 📍 Structure des répertoires

Ce projet nécessite **2 dossiers séparés** :

```
Mon-Projet/
├── Thinkless/              ← Application web (ce projet)
│   ├── server.js
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── public/
│   ├── docker-compose.yml
│   └── README.md
│
└── Docker-Tools/           ← Outils base de données (à cloner séparément)
    ├── docker-compose.yml  (PhpMyAdmin + MySQL)
    └── ...
```

### ⚠️ Important : PhpMyAdmin dans un dossier séparé

**PhpMyAdmin n'est PAS inclus dans ce projet.**

Il faut cloner le dépôt `Docker-Tools` dans un dossier **parallèle** :

```bash
# Clone ce projet
git clone https://github.com/313Kody/Thinkless.git

# Clone Docker-Tools DANS LE MÊME PARENT
git clone https://github.com/313Kody/Docker-Tools.git

# Structure finale
Mon-Projet/
├── Thinkless/
└── Docker-Tools/
```

### Prérequis

- Git installé
- Docker et Docker Compose installés
- Node.js 20+ (optionnel pour développement local)
- Ports disponibles : 81 (site), 3307 (MySQL), 8080 (PhpMyAdmin)

### Étapes d'installation

#### 1️⃣ Cloner les deux projets

```bash
# Thinkless
git clone https://github.com/313Kody/Thinkless.git

# Docker-Tools (dans le même répertoire parent)
git clone https://github.com/313Kody/DockerTools.git
```

#### 2️⃣ Créer le réseau Docker (une seule fois)

```bash
docker network create f1_network
```

#### 3️⃣ Démarrer Docker-Tools (MySQL + PhpMyAdmin)

```bash
cd ../Docker-Tools
docker-compose up -d
```

Cela lance :

- **MySQL 8.0** sur le port 3306
- **PhpMyAdmin** accessible à `http://localhost:8080`

#### 4️⃣ Démarrer Thinkless

```bash
cd ../Thinkless
docker-compose up -d
```

Cela lance :

- **Node.js/Express** sur le port 81
- **MySQL Thinkless** sur le port 3307
- **Thinkless** accessible à `http://localhost:81`

#### 5️⃣ Vérifier l'installation

- **PhpMyAdmin** : `http://localhost:8080` → identifiants : `root` / `root`
- **Site Thinkless** : `http://localhost:81` → page d'accueil

#### 6️⃣ Initialiser la base de données (si nécessaire)

La base de données est **automatiquement importée** au premier lancement grâce au volume Docker. Si vous devez la réinitialiser :

```bash
docker exec <container_mysql_id> mysql -u root -p root thinkless_db < database/thinkless_db.sql
```

### Arrêter l'application

**Thinkless** :

```bash
cd Thinkless
docker-compose down
```

**Docker-Tools** :

```bash
cd Docker-Tools
docker-compose down
```

### 🔗 Réseau Docker partagé

Les deux projets communiquent via le **réseau partagé `f1_network`** :

- Thinkless accède à MySQL via le nom du service : `thinkless-db:3307`

---

## 👥 Utilisateurs et authentification

### Inscription et Profil

- **Inscription** : Pseudo, email, mot de passe, localisation
- **Choix des sports** : Sélection des sports physiques pratiqués
- **Choix des jeux e-sport** : Sélection des jeux auxquels l'utilisateur joue
- **Badge des jeux** : Affichage du ranking pour chaque jeu

### Profil utilisateur

- Pseudo et localisation
- Liste des sports pratiqués
- Liste des jeux e-sport avec badges
- Ranking personnel
- Statistiques de matchs

### Authentification

- **Connexion** : Via email et mot de passe
- **JWT** : Tokens sécurisés pour les requêtes API
- **Bcryptjs** : Hachage des mots de passe
- **Sessions** : Gestion côté client via localStorage

---

## 🎮 Fonctionnalités principales

### 🏃 Sports physiques

#### CRUD Matchs

- **Créer** : Initialiser un nouveau match pour un sport spécifique
- **Consulter** : Lister tous les matchs disponibles
- **Rejoindre** : Participer à un match existant
- **Supprimer** : Annuler un match (créateur uniquement)

#### Ligues

- **Créer une ligue** : Entre amis, collègues, ou autres joueurs
- **Système de classement** : Ranking par ligue et par joueur
- **Jouer en ligue** : Matchs comptabilisés dans la ligue

#### Ranking

- **Ranking individuel** : Par sport pratiqué
- **Affichage public** : Classement visible sur le profil

---

### 🎯 E-sport

#### Équipes E-sport

- **Création d'équipe** : 1 équipe par joueur maximum
- **Gestion des membres** : Invite et acceptation
- **Badges de jeux** : Spécialisation par jeu
- **Ranking d'équipe** : Moyenne des ranks pour un jeu donné

#### Matchs E-sport

- **Créer un match** : Sélectionner le jeu et les adversaires
- **Enregistrer les résultats** : Mise à jour du ranking
- **Matchmaking compétitif** : Trouver adversaires du même niveau

#### Ranking par Jeu

- **Individual Rank** : Par joueur et par jeu
- **Team Rank** : Moyenne des joueurs jouant ce jeu
- **Calcul automatique** : Basé sur les résultats des matchs

---

## 📊 Base de données

### Entités principales

#### **Utilisateur**

- `Id` (PK)
- `Pseudo`
- `Email` (unique)
- `MotDePasse` (hashed)
- `Localisation`
- `CreatedAt`
- `UpdatedAt`

#### **Sport**

- `IdSport` (PK)
- `NomSport` (Football, Basketball, Tennis, etc.)
- `Description`

#### **UtilisateurSport**

- `IdUtilisateur` (FK)
- `IdSport` (FK)
- `Ranking` (ELO ou points)

#### **JeuEsport**

- `IdJeu` (PK)
- `NomJeu` (LoL, CSGO, Valorant, etc.)
- `Description`
- `Logo` (URL)

#### **UtilisateurJeu**

- `IdUtilisateur` (FK)
- `IdJeu` (FK)
- `Ranking` (Par jeu)
- `Badge` (URL)

#### **EquipeEsport**

- `IdEquipe` (PK)
- `NomEquipe`
- `IdCreateur` (FK User)
- `Description`
- `DateCreation`

#### **EquipeMembre**

- `IdEquipe` (FK)
- `IdUtilisateur` (FK)
- `DateAjout`
- `Role` (Capitaine, Membre)

#### **Match** (Sports physiques)

- `IdMatch` (PK)
- `IdSport` (FK)
- `IdCreateur` (FK User)
- `Localisation`
- `DateMatch`
- `NbJoueursMax`
- `Statut` (En attente, En cours, Terminé)
- `DateCreation`

#### **ParticipationMatch**

- `IdMatch` (FK)
- `IdUtilisateur` (FK)
- `DateParticipation`
- `Statut` (Accepté, En attente)

#### **Ligue**

- `IdLigue` (PK)
- `NomLigue`
- `IdCreateur` (FK User)
- `IdSport` (FK)
- `Description`
- `DateCreation`

#### **LigueUtilisateur**

- `IdLigue` (FK)
- `IdUtilisateur` (FK)
- `Ranking` (Points en ligue)
- `DateAjout`

#### **MatchEsport**

- `IdMatchEsport` (PK)
- `IdJeu` (FK)
- `IdEquipe1` (FK)
- `IdEquipe2` (FK)
- `DateMatch`
- `Statut` (En attente, En cours, Terminé)
- `Gagnant` (IdEquipe)

#### **MatchEquipe** (Participants match e-sport)

- `IdMatchEsport` (FK)
- `IdEquipe` (FK)
- `Points`

#### **ResultatMatchEsport**

- `IdResultat` (PK)
- `IdMatchEsport` (FK)
- `IdEquipe` (FK)
- `ResultatFinal` (Victoire/Défaite)
- `RankingDelta` (Points gagnés/perdus)

---

## 🛣️ Endpoints API Principal

### Authentification

- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion
- `POST /api/auth/logout` - Déconnexion

### Utilisateurs

- `GET /api/users/:id` - Voir profil
- `PUT /api/users/:id` - Modifier profil
- `GET /api/users/ranking/sports` - Ranking sports
- `GET /api/users/ranking/games` - Ranking e-sport

### Matchs

- `POST /api/matchs` - Créer match
- `GET /api/matchs` - Lister matchs
- `POST /api/matchs/:id/join` - Rejoindre match
- `PUT /api/matchs/:id/result` - Enregistrer résultat
- `DELETE /api/matchs/:id` - Supprimer match

### Ligues

- `POST /api/ligues` - Créer ligue
- `GET /api/ligues` - Lister ligues
- `POST /api/ligues/:id/join` - Rejoindre ligue
- `GET /api/ligues/:id/ranking` - Classement ligue

### E-sport

- `POST /api/teams` - Créer équipe
- `GET /api/teams` - Lister équipes
- `POST /api/teams/:id/members` - Ajouter membre
- `POST /api/esports-matchs` - Créer match e-sport
- `PUT /api/esports-matchs/:id/result` - Résultat match e-sport

---

## 🔐 Sécurité

### Authentification

- **JWT Tokens** : Sécurisation des routes protégées
- **Bcryptjs** : Hachage des mots de passe (salt 10)
- **CORS** : Configuration pour prévention d'attaques cross-origin
- **Variables d'environnement** : Secrets stockés dans `.env`

### Protection des données

- **Validation des entrées** : Vérification côté serveur
- **Middleware auth** : Vérification du token à chaque requête protégée
- **Prepared statements** : Prévention SQL injection (mysql2/promise)

---

## 📁 Structure des fichiers clés

### Controllers

- `authController.js` - Inscription, connexion
- `userController.js` - Profil, ranking
- `matchController.js` - CRUD matchs, résultats
- `ligueController.js` - CRUD ligues, adhésion

### Routes

- `auth.js` - Endpoints authentification
- `users.js` - Endpoints utilisateurs
- `matchs.js` - Endpoints matchs
- `ligues.js` - Endpoints ligues

### Public (Frontend)

```
public/
├── index.html           # Page d'accueil non-connecté
├── login.html           # Page connexion
├── register.html        # Page inscription
├── accueil.html         # Accueil connecté
├── profil.html          # Profil utilisateur
├── creer-match.html     # Créer un match
└── creer-ligue.html     # Créer une ligue
```

---

## 🧪 Configuration

### `.env` (à créer)

```bash
DB_HOST=thinkless-db
DB_PORT=3306
DB_USER=root
DB_PASS=root
DB_NAME=thinkless_db

JWT_SECRET=your_secret_key_here

NODE_ENV=production
PORT=3000
```

### `docker-compose.yml`

Synchronise avec le réseau `f1_network` et utilise le port 3307 pour MySQL (éviter conflit avec Docker-Tools).

---

## 🧪 Développement local

### Installation des dépendances

```bash
npm install
```

### Mode développement (avec nodemon)

```bash
npm run dev
```

### Mode production

```bash
npm start
```

---

## 🐛 Dépannage

### PhpMyAdmin introuvable

**PhpMyAdmin se trouve dans le dépôt `Docker-Tools` séparé.** Vérifiez que vous l'avez cloné :

```bash
# Vérifier que Docker-Tools existe (au même niveau que Thinkless)
ls ../Docker-Tools/docker-compose.yml

# Si absent, clonez-le
git clone https://github.com/313Kody/Docker-Tools.git ../Docker-Tools
```

Ensuite, lancez les conteneurs Docker-Tools :

```bash
cd ../Docker-Tools
docker-compose up -d
```

Accédez à PhpMyAdmin : `http://localhost:8080` (identifiants : `root` / `root`)

### Problème de connexion à la BD

```bash
# Vérifier que le conteneur MySQL est actif
docker ps | grep thinkless-db

# Afficher les logs MySQL
docker compose logs db-thinkless

# Vérifier la connexion
docker exec thinkless-db mysql -u root -proot -e "USE thinkless_db; SHOW TABLES;"
```

### Application injoignable sur le port 81

```bash
# Vérifier que le conteneur Node est lancé
docker ps | grep thinkless-web

# Afficher les logs Node
docker compose logs web-thinkless

# Vérifier les erreurs Node
docker exec -it thinkless-web node server.js
```

### Réinitialiser complètement la BD

```bash
# Supprimer le volume Docker
docker volume rm thinkless_thinkless_db_data

# Relancer la composition
docker-compose down
docker-compose up -d
```

---

## 📚 Ressources complémentaires

- Description du projet : `text/Projet Thinkless – Plateforme spor.txt`
- Schéma SQL : `database/thinkless_db.sql`

---

## 🔄 Workflow de développement

### Ajouter une nouvelle fonctionnalité

1. **Créer la table SQL** dans `database/thinkless_db.sql`
2. **Créer le contrôleur** : `controllers/newController.js`
3. **Créer les routes** : `routes/new.js`
4. **Ajouter au server.js** : Importer les routes
5. **Créer les vues** : `public/new.html`
6. **Tester les endpoints** : Via Postman ou curl

### Commits réguliers

```bash
git add .
git commit -m "feat: Add new feature"
git push origin main
```

---

## 👨‍💻 Développé pour

**BTS Services Informatiques aux Organisations - Épreuve E6**

---

## 📄 Licence

Projet scolaire - Libre d'utilisation

---

## ✅ Checklist de validation E6

- [ ] Authentification utilisateur (JWT)
- [ ] CRUD complet sur matchs et ligues
- [ ] Système de ranking (sports + e-sport)
- [ ] Gestion d'équipes e-sport
- [ ] Validation des données
- [ ] Protection SQL injection (mysql2/promise)
- [ ] Docker pour déploiement
- [ ] Documentation complète
- [ ] Responsive design (Tailwind CSS)
- [ ] Commits réguliers sur GitHub
