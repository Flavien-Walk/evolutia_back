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
  .then(async () => {
    console.log("MongoDB connecté");

    // Liste des utilisateurs par défaut à ajouter ou mettre à jour
    const defaultUsers = [
      { email: "flavien@test.com", username: "Flavien", role: "Super-Admin" },
      { email: "admin@example.com", username: "AdminUser", role: "Admin" },
      { email: "moderator@example.com", username: "ModeratorUser", role: "Modérateur" },
      { email: "golduser@example.com", username: "GoldUser", role: "Gold" },
    ];

    for (const userData of defaultUsers) {
      const { email, username, role } = userData;

      // Recherche de l'utilisateur existant
      const existingUser = await User.findOne({ email });
      if (!existingUser) {
        // Crée l'utilisateur s'il n'existe pas
        const hashedPassword = await bcrypt.hash("defaultpassword", 10); // Mot de passe par défaut
        const newUser = new User({
          email,
          username,
          password: hashedPassword,
          role,
        });
        await newUser.save();
        console.log(`${role} créé : ${email}`);
      } else {
        // Met à jour le rôle et le nom d'utilisateur si l'utilisateur existe déjà
        if (existingUser.role !== role) {
          existingUser.username = username;
          existingUser.role = role;
          existingUser.roleColor = undefined; // Réinitialise pour recalculer automatiquement
          await existingUser.save();
          console.log(`Utilisateur mis à jour avec le rôle ${role} : ${email}`);
        } else {
          console.log(`Aucun changement nécessaire pour l'utilisateur : ${email}`);
        }
      }
    }
  })
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
    const token = jwt.sign(
      { userId: newUser._id, username: newUser.username, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

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
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Connexion réussie",
      token,
      user: { username: user.username, email: user.email, role: user.role, roleColor: user.roleColor },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion :", error);
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

    res.status(200).json({ username: user.username, role: user.role, roleColor: user.roleColor });
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
