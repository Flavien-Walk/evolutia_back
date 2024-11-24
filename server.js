const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const User = require("./models/user");

const app = express();
const server = http.createServer(app); // Serveur HTTP
const io = new Server(server, {
  cors: {
    origin: "*", // Permet l'accès depuis toutes les origines
  },
});

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connecté"))
  .catch((err) => console.error("Erreur de connexion à MongoDB :", err));

// Route pour l'inscription
app.post("/register", async (req, res) => {
  try {
    const { email, username, contactNumber, password } = req.body;

    // Vérification de l'existence de l'utilisateur
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Un utilisateur avec cet email existe déjà." });
    }

    // Hachage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Création du nouvel utilisateur
    const newUser = new User({
      email,
      username,
      contactNumber,
      password: hashedPassword,
    });
    await newUser.save();

    // Génération du token JWT
    const token = jwt.sign({ userId: newUser._id, username: newUser.username }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(201).json({ message: "Utilisateur créé avec succès", token });
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur :", error);
    res.status(500).json({ error: "Une erreur est survenue, veuillez réessayer." });
  }
});

// Route pour la connexion classique
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Vérification de l'utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Vérification du mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Mot de passe incorrect." });
    }

    // Génération du token JWT
    const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({
      message: "Connexion réussie",
      token,
      user: { username: user.username, email: user.email },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion :", error);
    res.status(500).json({ error: "Une erreur est survenue, veuillez réessayer." });
  }
});

// Route pour la connexion via Google
app.post("/google-login", async (req, res) => {
  try {
    const { token } = req.body;

    // Exemple de vérification du token Google (à adapter avec une bibliothèque Google API si nécessaire)
    const decodedGoogleToken = jwt.decode(token); // Cette étape dépend de votre implémentation
    const email = decodedGoogleToken.email;

    let user = await User.findOne({ email });

    // Si l'utilisateur n'existe pas, créez un nouvel utilisateur
    if (!user) {
      user = new User({
        email,
        username: email.split("@")[0], // Crée un nom d'utilisateur basé sur l'email
        password: "", // Pas de mot de passe car c'est une connexion via Google
      });
      await user.save();
    }

    // Génération du token JWT
    const authToken = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({
      message: "Connexion réussie via Google",
      token: authToken,
      user: { username: user.username, email: user.email },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion via Google :", error);
    res.status(500).json({ error: "Une erreur est survenue, veuillez réessayer." });
  }
});

// Route pour récupérer les informations utilisateur
app.get("/user-info", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Token manquant." });
    }

    // Vérification et décodage du token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    res.status(200).json({ username: user.username });
  } catch (error) {
    console.error("Erreur lors de la récupération des infos utilisateur :", error);
    res.status(500).json({ error: "Une erreur est survenue." });
  }
});

// Gestion des connexions via Socket.IO
io.on("connection", (socket) => {
  console.log("Un utilisateur connecté :", socket.id);

  let username = "Anonymous";

  // Écoute pour définir le nom d'utilisateur
  socket.on("setUsername", (data) => {
    username = data.username;
    console.log(`Utilisateur ${socket.id} a défini son nom comme ${username}`);
  });

  // Écoute pour les messages envoyés
  socket.on("sendMessage", (message) => {
    console.log(`Message de ${username}: ${message.text}`);
    io.emit("receiveMessage", { ...message, sender: username });
  });

  // Gestion de la déconnexion
  socket.on("disconnect", () => {
    console.log(`Utilisateur déconnecté : ${socket.id} (${username})`);
  });
});

// Lancer le serveur
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
