# 🔏 Notarisation Hedera

Plateforme complète de **notarisation de documents numériques** et de **génération d'attestations de formation**, basée sur la blockchain [Hedera Hashgraph](https://hedera.com) et la cryptographie asymétrique **ED25519**.

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Fonctionnalités](#fonctionnalités)
4. [Prérequis](#prérequis)
5. [Installation locale](#installation-locale)
6. [Mise à jour](#mise-à-jour-développeurs-existants)
7. [Déploiement Docker](#déploiement-docker)
8. [Déploiement en production](#déploiement-en-production)
9. [Workflows utilisateur](#workflows-utilisateur)
10. [API REST](#api-rest)
11. [Sécurité](#sécurité)
12. [Technologies](#technologies)

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                      Navigateur (React)                      │
│  Génération PDF  │  Signature ED25519  │  SHA-256 (WebCrypto) │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS / JWT
┌────────────────────────────▼────────────────────────────────┐
│                  ASP.NET Core 9 Web API                      │
│   Auth (challenge-response)  │  Notarisation  │  Vérification │
└────────────────┬────────────────────────────────────────────┘
                 │                          │
        ┌────────▼──────────┐    ┌──────────▼──────────┐
        │   MySQL 8         │    │  Hedera Testnet /   │
        │  (enregistrements)│    │  Mainnet (HCS)      │
        └────────────────────┘    └─────────────────────┘
```

---

## Architecture

```
Notarisation-Hedera/
├── backend/
│   └── NotarisationHedera.API/
│       ├── Controllers/
│       │   ├── AuthController.cs          # Inscription / connexion
│       │   ├── NotarisationController.cs  # CRUD + téléchargement PDF
│       │   └── VerificationController.cs  # Vérification publique
│       ├── Services/
│       │   ├── AuthService.cs             # Challenge-response ED25519
│       │   ├── HederaService.cs           # Client Hedera HCS + mirror node
│       │   ├── NotarisationService.cs     # Logique métier notarisation
│       │   └── CryptoService.cs           # Utilitaires crypto
│       ├── Models/
│       │   ├── NotarisationRecord.cs      # Entité (hash, PDF, folder…)
│       │   ├── User.cs
│       │   └── DTOs/NotarisationDTOs.cs
│       ├── Data/AppDbContext.cs            # EF Core
│       └── Migrations/
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── CertificatePage.tsx        # Génération d'attestations
│       │   ├── RecordsPage.tsx            # Mes documents (vue dossiers)
│       │   └── HomePage.tsx
│       ├── components/
│       │   ├── Auth/                      # Connexion, inscription
│       │   ├── Certificate/
│       │   │   └── TemplateFieldEditor.tsx # Éditeur drag-and-drop PDF
│       │   ├── Notarisation/NotariseForm.tsx
│       │   ├── Verification/VerifyForm.tsx
│       │   └── ui/Req.tsx                 # Indicateur champ obligatoire (*)
│       ├── utils/
│       │   ├── certificate.ts             # Génération PDF (pdf-lib)
│       │   ├── pdfjs.ts                   # Init worker PDF.js (point d'entrée unique)
│       │   ├── crypto.ts                  # SHA-256 (Web Crypto API)
│       │   └── hedera.ts                  # ED25519 (@noble/ed25519)
│       ├── vite-env.d.ts                  # Types Vite (?url, ?worker)
│       ├── api/
│       │   ├── notarisation.ts
│       │   ├── auth.ts
│       │   └── client.ts                  # Axios + intercepteur JWT
│       └── contexts/AuthContext.tsx
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Fonctionnalités

### 🔐 Authentification par signature numérique
- Protocole **challenge-response** : le serveur génère un nonce aléatoire
- Le client **signe le nonce** avec sa clé privée ED25519 **dans le navigateur**
- Le serveur vérifie la signature avec la clé publique enregistrée
- **La clé privée ne quitte jamais le navigateur**
- Sessions via **JWT** (HMAC-SHA256, expiration configurable)

### 📄 Notarisation de documents
- Hash **SHA-256** calculé côté client (le fichier n'est jamais envoyé au serveur)
- Le hash est soumis au **Hedera Consensus Service (HCS)**
- L'horodatage blockchain est une **preuve d'existence infalsifiable**
- Le PDF peut être stocké pour un **re-téléchargement ultérieur**

### 🎓 Génération d'attestations de formation
- **Éditeur drag-and-drop** : positionnez visuellement chaque champ sur le template PDF
- Chips colorés qui prévisualisent les valeurs saisies en temps réel
- Mode **individuel** : génération d'une attestation unique
- Mode **batch (Excel)** : import d'une liste de bénéficiaires
  - Formats acceptés : `.xlsx`, `.xls`, `.ods`, `.csv`
  - Validation complète avant traitement : colonnes détectées, doublons, lignes vides, taille max
  - Génération + notarisation automatique de chaque attestation
  - Téléchargement d'un fichier `.zip` groupé par formation

### 📁 Mes documents (vue dossiers)
- Attestations regroupées par **nom de formation** (dossiers dépliables)
- Bouton **⬇️ PDF** pour re-télécharger chaque attestation depuis le serveur
- Détails dépliables : hash SHA-256, transaction Hedera, horodatage blockchain

### 🔍 Vérification d'intégrité (publique)
- Accessible **sans compte**
- Recalcul du hash + comparaison avec la preuve Hedera
- Confirmation via le **mirror node Hedera**

---

## Prérequis

| Outil | Version minimale | Usage |
|-------|-----------------|-------|
| [.NET SDK](https://dotnet.microsoft.com/download) | 9.0 | Backend |
| [Node.js](https://nodejs.org) | 20 | Frontend |
| MySQL | 8.0 | Base de données (développement local) |
| [Docker + Docker Compose](https://docs.docker.com/get-docker/) | 24 | Déploiement conteneurisé |
| Compte Hedera | — | [portal.hedera.com](https://portal.hedera.com) |

---

## Installation locale

### 1. Cloner le dépôt

```bash
git clone https://github.com/Jordan27080/Notarisation-Hedera.git
cd Notarisation-Hedera
git checkout loic
```

### 2. Configuration du backend

`appsettings.json` est commité dans le dépôt avec des **valeurs placeholder** (aucune clé réelle).  
Chaque développeur crée son propre fichier **gitignored** à partir du template :

```bash
cd backend/NotarisationHedera.API
cp appsettings.Development.json.example appsettings.Development.json
```

Puis éditer `appsettings.Development.json` :

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Port=3306;Database=notarisation;User=root;Password=VOTRE_MOT_DE_PASSE_MYSQL;"
  },
  "Jwt": {
    "Key": "UN_SECRET_ALEATOIRE_MINIMUM_32_CARACTERES"
  },
  "Hedera": {
    "Network": "testnet",
    "OperatorAccountId": "0.0.XXXXX",
    "OperatorPrivateKey": "302e020100300506032b657004220420...",
    "TopicId": "0.0.XXXXX"
  }
}
```

> **Obtenir ses credentials Hedera (gratuit)**
>
> 1. Créer un compte sur **https://portal.hedera.com** → réseau **Testnet**
> 2. Copier l'**Account ID** (`0.0.XXXXX`) et la **DER Private Key** (`302e...`)
> 3. Créer un **Topic HCS** (une seule fois) :
>
> ```js
> // create-topic.mjs
> import { Client, TopicCreateTransaction } from "@hashgraph/sdk"
> const client = Client.forTestnet()
> client.setOperator("0.0.XXXXX", "302e...")
> const receipt = await new TopicCreateTransaction()
>   .setTopicMemo("Notarisation Hedera")
>   .execute(client)
>   .then(tx => tx.getReceipt(client))
> console.log("HEDERA_TOPIC_ID =", receipt.topicId.toString())
> ```
>
> ```bash
> node create-topic.mjs
> ```

> ⚠️ Si la configuration Hedera est manquante ou incomplète, l'API retourne une erreur
> explicite au lieu d'un `FormatException` cryptique :
> ```
> Configuration Hedera incomplète — clés manquantes : Hedera:OperatorAccountId, ...
> Copiez appsettings.Development.json.example → appsettings.Development.json
> ```

### 3. Base de données

Créer la base MySQL :

```sql
CREATE DATABASE notarisation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Appliquer les migrations EF Core (automatique au démarrage, ou manuellement) :

```bash
cd backend/NotarisationHedera.API
dotnet ef database update
```

### 4. Lancer le backend

```bash
cd backend/NotarisationHedera.API
dotnet run
```

> API disponible sur **http://localhost:7001**  
> Swagger UI : **http://localhost:7001/swagger**

### 5. Lancer le frontend

```bash
cd frontend
npm install
npm run dev
```

> Application disponible sur **http://localhost:5173**

---

## Mise à jour (développeurs existants)

Pour récupérer les derniers commits sur une machine déjà configurée :

```bash
# 1. Récupérer les mises à jour
git pull origin loic

# 2. Mettre à jour les dépendances si nécessaire
cd backend/NotarisationHedera.API && dotnet restore && cd ../..
cd frontend && npm install && cd ..

# 3. Appliquer les nouvelles migrations (si ajoutées)
cd backend/NotarisationHedera.API && dotnet ef database update && cd ../..

# 4. Relancer
#   Terminal 1 :
cd backend/NotarisationHedera.API && dotnet run
#   Terminal 2 :
cd frontend && npm run dev
```

> `appsettings.Development.json` étant gitignored, il n'est **jamais écrasé** par un `git pull`.
> Il n'est à créer qu'**une seule fois** par machine.

---

## Déploiement Docker

Le `docker-compose.yml` orchestre **backend + frontend** dans deux conteneurs.  
Nginx (frontend) fait office de reverse-proxy vers le backend.

### Architecture réseau Docker

```
Navigateur  ──►  :5173 (Nginx container)
                   ├── /             →  dist/ (React SPA, HTML/JS/CSS)
                   └── /api/*        →  http://backend:7001/api/*  (proxy)

backend container  ──►  :7001 (ASP.NET Core)
                          └── connexion interne vers MySQL (si conteneurisé)
```

### Étape 1 — Configurer l'environnement

```bash
cp .env.example .env
# Éditer .env avec vos vraies valeurs Hedera et le secret JWT
nano .env
```

### Étape 2 — Construire et démarrer

```bash
docker-compose up --build -d
```

| Service | Port exposé | URL locale |
|---------|-------------|------------|
| Frontend (Nginx) | 5173 | http://localhost:5173 |
| Backend (ASP.NET Core) | 7001 | http://localhost:7001 |

### Étape 3 — Appliquer les migrations

La base de données doit être accessible depuis le conteneur backend.  
Si vous utilisez une base MySQL externe ou locale :

```bash
# Entrer dans le conteneur backend
docker-compose exec backend sh

# Puis depuis l'intérieur du conteneur
dotnet ef database update --project NotarisationHedera.API.csproj
```

Ou directement depuis l'hôte (avec le bon ConnectionString) :

```bash
cd backend/NotarisationHedera.API
dotnet ef database update
```

### Commandes utiles

```bash
# Démarrer en arrière-plan
docker-compose up -d

# Suivre les logs en temps réel
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend

# Redémarrer sans rebuild (après changement de config)
docker-compose restart

# Rebuild et redémarrer (après modification du code)
docker-compose up --build -d

# Arrêter (données conservées)
docker-compose down

# Arrêter et supprimer les volumes
docker-compose down -v

# Vérifier l'état des conteneurs
docker-compose ps
```

---

## Déploiement en production

### Variables d'environnement obligatoires

| Variable | Description |
|----------|-------------|
| `HEDERA_OPERATOR_ACCOUNT_ID` | ID du compte Hedera opérateur (`0.0.XXXXX`) |
| `HEDERA_OPERATOR_PRIVATE_KEY` | Clé privée ED25519 du compte opérateur (hex DER) |
| `HEDERA_TOPIC_ID` | ID du topic HCS utilisé pour la notarisation |
| `HEDERA_NETWORK` | `testnet` ou `mainnet` |
| `JWT_KEY` | Secret JWT ≥ 32 caractères aléatoires |
| `ConnectionStrings__DefaultConnection` | Chaîne de connexion MySQL de production |

### Checklist avant la mise en production

- [ ] Passer `HEDERA_NETWORK` à `mainnet`
- [ ] Générer un `JWT_KEY` robuste : `openssl rand -base64 48`
- [ ] Configurer HTTPS (certificat TLS via Let's Encrypt / Nginx)
- [ ] Mettre à jour `Cors:AllowedOrigins` dans `appsettings.json` avec le domaine réel
- [ ] Utiliser une base de données managée (MySQL RDS, PlanetScale, etc.)
- [ ] Ne jamais committer le fichier `.env` — utiliser un gestionnaire de secrets
  (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)
- [ ] Passer les niveaux de log à `Warning` / `Error` en production

### Exemple — Déploiement sur VPS Ubuntu

```bash
# 1. Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Cloner le projet
git clone https://github.com/Jordan27080/Notarisation-Hedera.git
cd Notarisation-Hedera
git checkout loic

# 3. Configurer
cp .env.example .env
nano .env          # remplir avec les valeurs de production

# 4. Démarrer
docker-compose up --build -d

# 5. Vérifier
docker-compose ps
docker-compose logs --tail=50 backend
```

Pour exposer en HTTPS, placer un reverse-proxy Nginx ou Traefik devant le port 5173.

---

## Workflows utilisateur

### 🔑 Inscription (`/register`)

```
1. Saisir : nom d'utilisateur *, email *, ID compte Hedera * (0.0.XXXXX),
            clé privée ED25519 * (hex DER, PEM ou raw hex)
2. La clé publique est dérivée localement dans le navigateur
3. Seule la clé publique est transmise et stockée côté serveur
4. Redirection vers /login après inscription réussie
```

### 🔓 Connexion (`/login`)

```
1. Saisir ID de compte Hedera + clé privée
2. Le serveur renvoie un nonce aléatoire (challenge)
3. Le navigateur signe le nonce avec la clé privée (ED25519)
4. Le serveur vérifie la signature via la clé publique enregistrée
5. JWT délivré (durée : 60 min) — stocké dans le navigateur
```

### 📄 Notariser un document (`/notarise`)

```
Connexion requise
1. Glisser-déposer ou sélectionner n'importe quel fichier
2. SHA-256 calculé dans le navigateur (Web Crypto API)
3. Cliquer "Notariser sur Hedera"
4. Le hash + nom du fichier → API → Hedera HCS
5. Transaction ID + horodatage blockchain affichés comme preuve
```

### 🎓 Générer une attestation — Individuel (`/certificates`)

```
Connexion requise
1. Basculer sur l'onglet "👤 Individuel"
2. Remplir : Prénom (optionnel), Nom *, Nom de la formation *, Date début *, Date fin *
3. Sur le template PDF affiché à droite :
   - Glisser les chips colorés (🟣 Nom/Prénom, 🔵 Formation, 🟢 Date début, 🟠 Date fin)
   - Les repositionner précisément sur le document
4. Cliquer "⚙️ Générer l'attestation" → aperçu PDF affiché
5. Cliquer "⬇️ Télécharger & Notariser sur Hedera"
   → PDF téléchargé immédiatement
   → Notarisation automatique sur Hedera (spinner pendant l'opération)
   → Transaction ID + horodatage affichés
```

### 📋 Générer des attestations — Batch Excel (`/certificates`)

```
Connexion requise
1. Basculer sur l'onglet "📋 Import Excel"
2. Importer un fichier Excel (.xlsx / .xls / .ods / .csv)
   Format attendu :
     - Colonne "Nom"    (obligatoire)
     - Colonne "Prénom" (facultative)
   Ou, sans en-tête : colonne A = Prénom, colonne B = Nom
3. Vérifier le résumé de validation affiché :
   - Colonnes détectées (chips colorés)
   - Avertissements : fallback positionnel, lignes Nom vide, doublons
   - Compteurs : lignes valides / ignorées
   - Aperçu du tableau (scroll)
4. Remplir les champs communs : Formation *, Date début *, Date fin *
5. Positionner les chips sur le template PDF
6. Cliquer "⚙️ Générer N attestations (.zip)"
   Pour chaque bénéficiaire (en séquence) :
   → Génération du PDF en mémoire
   → Notarisation sur Hedera (hash + PDF stocké)
   → Barre de progression + résultat en temps réel (✅ nom + TX ID / ❌ erreur)
   → Téléchargement du ZIP : Attestations_<Formation>.zip
```

### 🔍 Vérifier un document (`/verify`)

```
Sans connexion requise
1. Déposer le fichier original à vérifier
2. SHA-256 recalculé localement dans le navigateur
3. Le hash est envoyé au serveur
4. Vérification en base de données + confirmation mirror node Hedera
5. Résultat affiché :
   ✓ Authentique → hash SHA-256, transaction Hedera, horodatage, auteur, nom du fichier
   ✗ Non trouvé  → document non notarisé ou modifié
```

### 📁 Consulter Mes documents (`/records`)

```
Connexion requise
1. Les documents sont groupés en dossiers par nom de formation (📂)
   Les documents sans formation sont dans "📄 Documents"
2. Cliquer sur un dossier pour le déplier / replier
   → En-tête coloré + compteur de fichiers
3. Cliquer sur un fichier pour voir les détails (dépliable) :
   → Hash SHA-256
   → Transaction ID Hedera
   → Horodatage blockchain
4. Cliquer "⬇️ PDF" (si disponible) pour re-télécharger l'attestation
   → Le PDF est servi depuis la base de données du serveur
```

---

## API REST

Base URL : `http://localhost:7001/api`  
Documentation interactive : **http://localhost:7001/swagger**

### Authentification

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/auth/register` | — | Inscription avec clé publique ED25519 |
| `POST` | `/auth/challenge` | — | Demande de nonce (challenge) |
| `POST` | `/auth/login` | — | Vérification signature → JWT |

### Notarisation

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/notarisation` | JWT | Soumettre un document à notariser |
| `GET` | `/notarisation` | JWT | Lister mes enregistrements |
| `GET` | `/notarisation/{id}/download` | JWT | Re-télécharger le PDF stocké |

### Vérification

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/verification/verify` | — | Vérifier l'authenticité d'un hash |

### Exemples de corps de requêtes

**POST `/notarisation`**
```json
{
  "documentHash": "a3b4c5d6...64charactershexstring",
  "fileName": "Attestation_DUPONT_Jean.pdf",
  "folder": "Développement Web avec React",
  "pdfBase64": "JVBERi0xLjQ..."
}
```

**POST `/auth/login`**
```json
{
  "hederaAccountId": "0.0.12345",
  "nonce": "abc123noncefromchallenge",
  "signatureHex": "ed25519signaturehex..."
}
```

---

## Sécurité

| Contrainte | Implémentation |
|---|---|
| Clé privée non transmise | Signature ED25519 dans le navigateur (`@noble/ed25519`) |
| Authentification forte | Challenge-response + vérification de signature côté serveur |
| Intégrité des documents | SHA-256 via Web Crypto API (navigateur natif) |
| Horodatage infalsifiable | Hedera Consensus Service (blockchain publique immuable) |
| Sessions sécurisées | JWT signé HMAC-SHA256, expiration 60 min |
| Communications chiffrées | HTTPS obligatoire en production |
| Isolation des données | Chaque enregistrement est lié à son propriétaire (`UserId`) |
| Re-download protégé | Endpoint `/download` vérifie la propriété du document avant de servir le PDF |
| Pas de stockage de clé | La clé privée reste dans le navigateur, seule la clé publique est enregistrée |

---

## Technologies

| Couche | Technologie | Version |
|--------|-------------|---------|
| **Backend** | ASP.NET Core | 9.0 |
| ORM | Entity Framework Core + Pomelo MySQL | 9.x |
| **Frontend** | React + TypeScript | 18 / 5.x |
| Bundler | Vite | 5.x |
| Routage | React Router | 6.x |
| Data fetching | TanStack Query | 5.x |
| **Blockchain** | Hedera Consensus Service (HCS) | Testnet / Mainnet |
| SDK Hedera | net-sdk (Hashgraph) + @hashgraph/sdk | — |
| **Cryptographie** | ED25519 (`@noble/ed25519`) | 3.x |
| Hash | SHA-256 (Web Crypto API + `@noble/hashes`) | — |
| **PDF** | pdf-lib (génération côté client) | 1.17 |
| | pdfjs-dist (rendu canvas dans le navigateur) | 5.x |
| **Excel** | SheetJS (xlsx) | 0.18 |
| **Archive** | JSZip | 3.x |
| **Serveur web** | Nginx (prod, via Docker) | Alpine |
| **Conteneurisation** | Docker + Docker Compose | 24+ |
| Base de données | MySQL | 8.0 |
