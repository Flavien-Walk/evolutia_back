# Backend – ÉvolutIA

Ce dépôt contient le serveur backend de l’application mobile ÉvolutIA. Il gère les utilisateurs, l’authentification, la messagerie en temps réel, et les statistiques liées à l’apprentissage.

---

## Fonctionnalités

* Authentification via JSON Web Tokens (JWT)
* Gestion des utilisateurs : inscription, connexion, vérification
* Messagerie en temps réel avec Socket.io
* Middleware de gestion des rôles (`checkRole.js`)
* Connexion sécurisée à MongoDB Atlas
* Déploiement automatique via Render

---

## Dépôt GitHub

> [https://github.com/Flavien-Walk/evolutia\_back]

---

## Installation locale

### Étapes

Ouvrir un terminal et exécuter les commandes suivantes :

```bash
cd "Evolutia Back/evolutia_back"
npm install
npm start
```

Le serveur sera alors accessible localement à l'adresse suivante :
[http://localhost:5000]

---

## Serveur en ligne (production)

Le backend est déployé sur Render :
[https://evolutia-back.onrender.com]

---

## Variables d’environnement

Créer un fichier `.env` à la racine du dossier `evolutia_back`, avec le contenu suivant :

```
PORT=5000
MONGO_URI=mongodb+srv://flavienhypnose:nddfXBVv1uzn5FNT@cluster0.aug1e.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=AooP0Pmmmojiohugiygylkbnkl988
```

---

## Structure du projet

```
evolutia_back/
├── middlewares/
│   └── checkRole.js            # Middleware pour gestion de rôles
├── models/
│   ├── message.js              # Schéma Mongoose pour les messages
│   └── user.js                 # Schéma Mongoose pour les utilisateurs
├── node_modules/               # Dépendances Node.js
├── .env                        # Configuration d’environnement (non versionné)
├── package.json                # Dépendances & scripts
├── package-lock.json           # Lockfile npm
├── server.js                   # Point d’entrée du serveur Express
└── Readme.md                   # Ce fichier
```

---

## Stack technique

* Node.js + Express : serveur HTTP
* MongoDB Atlas : base de données cloud
* Mongoose : ORM pour MongoDB
* JWT : authentification sécurisée
* Socket.io : chat et interactions temps réel
* Helmet, CORS, Rate-limiter : sécurité
* Render : hébergement cloud du serveur

---

## À propos

Auteurs : Flavien, Flavie, Yrieix

Contacts :

* Flavien : [flavien.dev@gmail.com]
  LinkedIn : [linkedin.com/in/LeGrosBgDu69]

* Flavie : [flavie.dev@gmail.com]
  LinkedIn : [linkedin.com/in/LaGrosseBlgDu69]

* Yrieix : [yrieix.dev@gmail.com]
  LinkedIn : [linkedin.com/in/YrieixLeGrosBgDu69]

---

