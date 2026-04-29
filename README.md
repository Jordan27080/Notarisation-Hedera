# Notarisation Hedera

Plateforme de notarisation de documents numériques basée sur la blockchain **Hedera Hashgraph** et la cryptographie asymétrique **ED25519**.

## Architecture

```
Notarisation-Hedera/
├── backend/                  # ASP.NET Core 9 Web API
│   └── NotarisationHedera.API/
│       ├── Controllers/      # Auth, Notarisation, Vérification
│       ├── Services/         # Hedera HCS, crypto, JWT
│       ├── Models/           # Entités + DTOs
│       ├── Data/             # EF Core / MySQL
│       └── Migrations/
└── frontend/                 # React + TypeScript (Vite)
    └── src/
        ├── components/       # Auth, Notarisation, Vérification
        ├── utils/            # crypto.ts (SHA-256), hedera.ts (ED25519)
        ├── api/              # Clients HTTP
        └── contexts/         # AuthContext (JWT)
```

## Fonctionnalités

### Authentification par signature numérique
- Protocole **challenge-response** : le serveur génère un nonce aléatoire
- L'utilisateur **signe le nonce** avec sa clé privée ED25519 dans le navigateur
- Le serveur vérifie la signature avec la clé publique enregistrée
- **La clé privée ne quitte jamais le navigateur**
- Session sécurisée via **JWT** (expiration configurable)

### Notarisation de documents
- Hash **SHA-256** calculé côté client (le fichier n'est jamais envoyé)
- Le hash est soumis au **Hedera Consensus Service (HCS)**
- L'horodatage blockchain sert de **preuve d'existence infalsifiable**
- Le `transactionId` Hedera est conservé comme identifiant de preuve

### Vérification d'intégrité (publique)
- N'importe qui peut vérifier un document **sans compte**
- Recalcul du hash + comparaison avec la preuve enregistrée sur Hedera
- Confirmation via le **mirror node Hedera**

## Prérequis

- [.NET 9 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org)
- MySQL 8 (ex: MySQL Workbench, port 3306)
- Compte Hedera Testnet : [portal.hedera.com](https://portal.hedera.com)

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/Jordan27080/Notarisation-Hedera.git
cd Notarisation-Hedera
git checkout loic
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Remplir `.env` :

```env
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ACCOUNT_ID=0.0.XXXXX
HEDERA_OPERATOR_PRIVATE_KEY=302e020100...
HEDERA_TOPIC_ID=0.0.XXXXX
JWT_KEY=votre_secret_jwt_min_32_chars
```

### 3. Configurer la base de données

Mettre à jour le mot de passe dans `backend/NotarisationHedera.API/appsettings.json` :

```json
"DefaultConnection": "Server=localhost;Port=3306;Database=notarisation;User=root;Password=VOTRE_MDP;"
```

### 4. Lancer les migrations

```bash
cd backend/NotarisationHedera.API
dotnet ef database update
```

### 5. Démarrer le backend

```bash
dotnet run
# API disponible sur https://localhost:7001
# Swagger : https://localhost:7001/swagger
```

### 6. Démarrer le frontend

```bash
cd frontend
npm install
npm run dev
# Application sur http://localhost:5173
```

## Utilisation

### Créer un topic HCS (une seule fois)

Si vous n'avez pas encore de `HEDERA_TOPIC_ID`, créez-en un :

```js
// create-topic.js
import { Client, TopicCreateTransaction, PrivateKey } from "@hashgraph/sdk";

const client = Client.forTestnet();
client.setOperator("0.0.XXXXX", "302e020100...");

const receipt = await new TopicCreateTransaction()
  .setTopicMemo("Notarisation Hedera")
  .execute(client)
  .then(tx => tx.getReceipt(client));

console.log("HEDERA_TOPIC_ID =", receipt.topicId.toString());
```

```bash
npm install @hashgraph/sdk
node create-topic.js
```

### S'inscrire

1. Aller sur `/register`
2. Renseigner votre ID de compte Hedera et votre **clé privée ED25519**
3. La clé publique est dérivée localement et enregistrée côté serveur

### Se connecter

1. Aller sur `/login`
2. Saisir votre ID de compte et votre clé privée
3. Le navigateur signe le challenge → le serveur vérifie → JWT délivré

### Notariser un document

1. Aller sur `/notarise` (connexion requise)
2. Glisser-déposer un fichier
3. Le hash SHA-256 est calculé localement
4. Cliquer sur **Notariser sur Hedera**
5. Le `transactionId` Hedera est retourné comme preuve

### Vérifier un document

1. Aller sur `/verify` (sans connexion)
2. Déposer le document à vérifier
3. Le résultat indique si le document a été notarisé, par qui, et quand

## Sécurité

| Contrainte | Implémentation |
|---|---|
| Clé privée non stockée côté serveur | Signature ED25519 dans le navigateur (`@hashgraph/sdk`) |
| Authentification forte | Challenge-response + signature numérique |
| Intégrité des documents | SHA-256 via Web Crypto API |
| Horodatage infalsifiable | Hedera Consensus Service |
| Sessions sécurisées | JWT signé HMAC-SHA256 |
| Communications chiffrées | HTTPS obligatoire en production |

## Docker

```bash
cp .env.example .env  # remplir les valeurs
docker-compose up --build
# Frontend : http://localhost:5173
# Backend  : http://localhost:7001
```

## Technologies

| Couche | Technologie |
|---|---|
| Backend | ASP.NET Core 9, Entity Framework Core 9, Pomelo MySQL |
| Frontend | React 18, TypeScript, Vite, @hashgraph/sdk |
| Blockchain | Hedera Consensus Service (HCS) |
| Cryptographie | ED25519, SHA-256, HMAC-SHA256 (JWT) |
| Base de données | MySQL 8 |
