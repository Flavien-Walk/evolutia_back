const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
require("dotenv").config();

const User = require("./models/user");

const app = express();
const server = http.createServer(app); // Serveur HTTP
const io = new Server(server, {
  cors: {
    origin: "*", // Permet l'accès depuis toutes les origines
  },
});

// Initialisation du client Google OAuth2
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
    const { email, username, password } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Un utilisateur avec cet email existe déjà." });
    }

    // Hachage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer un nouvel utilisateur
    const newUser = new User({
      email,
      username,
      password: hashedPassword,
    });
    await newUser.save();

    // Générer un token JWT
    const token = jwt.sign({ userId: newUser._id, username: newUser.username }, process.env.JWT_SECRET, { expiresIn: "1h" });

    // Réponse avec les informations utilisateur
    res.status(201).json({
      message: "Utilisateur créé avec succès",
      token,
      user: {
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        roleColor: newUser.roleColor,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'inscription :", error);
    res.status(500).json({ error: "Une erreur est survenue." });
  }
});

// Route pour la connexion classique
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Vérifier le mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Mot de passe incorrect." });
    }

    // Générer un token JWT
    const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.status(200).json({
      message: "Connexion réussie",
      token,
      user: {
        username: user.username,
        email: user.email,
        role: user.role || "User",
        roleColor: user.roleColor || "#808080",
      },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion :", error);
    res.status(500).json({ error: "Une erreur est survenue." });
  }
});

// Route pour la connexion via Google
app.post("/google-login", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token Google manquant." });
    }

    // Vérifier et décoder le token Google
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const { email, name, sub } = payload; // `sub` est l'identifiant unique Google
    if (!email) {
      return res.status(400).json({ error: "Email Google manquant." });
    }

    // Vérifier si l'utilisateur existe déjà
    let user = await User.findOne({ email });
    if (!user) {
      // Créer un nouvel utilisateur si nécessaire
      const hashedPassword = await bcrypt.hash(sub, 10); // Utilise `sub` comme base pour le mot de passe
      user = new User({
        email,
        username: name || "Utilisateur Google",
        password: hashedPassword,
      });
      await user.save();
      console.log(`Nouvel utilisateur Google créé : ${email}`);
    }

    // Générer un token JWT
    const jwtToken = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.status(200).json({
      message: "Connexion via Google réussie",
      token: jwtToken,
      user: {
        username: user.username,
        email: user.email,
        role: user.role || "User",
        roleColor: user.roleColor || "#808080",
      },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion via Google :", error);
    res.status(500).json({ error: "Impossible de se connecter via Google." });
  }
});

// Gestion des connexions Socket.IO
io.on("connection", (socket) => {
  console.log("Utilisateur connecté :", socket.id);

  let username = "Anonymous";

  // Écoute pour définir le nom d'utilisateur
  socket.on("setUsername", (data) => {
    username = data.username;
    console.log(`Nom d'utilisateur défini : ${username}`);
  });

  // Écoute pour les messages envoyés
  socket.on("sendMessage", (message) => {
    console.log(`Message de ${username}:`, message.text);
    io.emit("receiveMessage", { ...message, sender: username });
  });

  // Gestion de la déconnexion
  socket.on("disconnect", () => {
    console.log("Utilisateur déconnecté :", socket.id);
  });
});

// Lancer le serveur
const PORT = process.env.PORT || 3636;
const IP_ADDRESS = "10.76.204.34"; // Remplace par l'adresse IP appropriée si nécessaire

server.listen(PORT, IP_ADDRESS, () =>
  console.log(`Serveur démarré sur http://${IP_ADDRESS}:${PORT}`)
);
