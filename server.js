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
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Initialisation du client Google OAuth2
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Middleware
app.use(bodyParser.json({ limit: "10mb" })); // important pour recevoir les images base64
app.use(cors());

// Logger global pour toutes les requêtes entrantes
app.use(async (req, res, next) => {
  const now = new Date().toLocaleString();
  console.log(`[${now}] Requête reçue : ${req.method} ${req.originalUrl}`);

  const tokenHeader = req.headers.authorization;
  if (tokenHeader && tokenHeader.startsWith("Bearer ")) {
    try {
      const token = tokenHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log(`👉 Utilisateur : ${decoded.username} (${decoded.userId})`);
    } catch (error) {
      console.log("⚠️ Token invalide ou expiré.");
    }
  }
  next();
});

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connecté"))
  .catch((err) => console.error("Erreur de connexion à MongoDB :", err));

// Route pour l'inscription
app.post("/register", async (req, res) => {
  try {
    const { email, username, password } = req.body;

    console.log(`🔐 Tentative d'inscription : ${username} (${email})`);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Un utilisateur avec cet email existe déjà." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, username, password: hashedPassword });
    await newUser.save();

    console.log(`✅ Nouvel utilisateur inscrit : ${username} (${email})`);

    const token = jwt.sign(
      { userId: newUser._id, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(201).json({
      message: "Utilisateur créé avec succès",
      token,
      user: {
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        roleColor: newUser.roleColor,
        profileImage: newUser.profileImage || "",
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

    console.log(`🔑 Tentative de connexion : ${email}`);

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Mot de passe incorrect." });
    }

    console.log(`✅ Connexion réussie : ${user.username} (${email})`);

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Connexion réussie",
      token,
      user: {
        username: user.username,
        email: user.email,
        role: user.role || "User",
        roleColor: user.roleColor || "#808080",
        profileImage: user.profileImage || "",
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

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, sub } = payload;

    let user = await User.findOne({ email });
    const now = new Date().toLocaleString();

    if (!user) {
      const hashedPassword = await bcrypt.hash(sub, 10);
      user = new User({ email, username: name || "Utilisateur Google", password: hashedPassword });
      await user.save();
      console.log(`✅ Nouvel utilisateur Google créé : ${name} (${email})`);
    } else {
      console.log(`✅ Connexion via Google réussie : ${user.username} (${email})`);
    }

    const jwtToken = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Connexion via Google réussie",
      token: jwtToken,
      user: {
        username: user.username,
        email: user.email,
        role: user.role || "User",
        roleColor: user.roleColor || "#808080",
        profileImage: user.profileImage || "",
      },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion via Google :", error);
    res.status(500).json({ error: "Impossible de se connecter via Google." });
  }
});

// Route pour la déconnexion
app.post("/logout", async (req, res) => {
  try {
    const tokenHeader = req.headers.authorization;
    if (!tokenHeader || !tokenHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant ou invalide." });
    }

    const token = tokenHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    console.log(`🔌 Déconnexion : ${user.username} (${user.email})`);

    res.status(200).json({ message: "Déconnexion réussie." });
  } catch (error) {
    console.error("Erreur lors de la déconnexion :", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// Route pour récupérer les informations utilisateur
app.get("/user-info", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant ou invalide." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    res.status(200).json({
      username: user.username,
      email: user.email,
      role: user.role || "User",
      roleColor: user.roleColor || "#808080",
      selectedPlan: user.selectedPlan || "",
      profileImage: user.profileImage || "",
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des informations utilisateur :", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// Route pour choisir un plan
app.post("/choose-plan", async (req, res) => {
  try {
    const tokenHeader = req.headers.authorization;
    if (!tokenHeader || !tokenHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant ou invalide." });
    }

    const token = tokenHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { plan } = req.body;
    if (!plan) {
      return res.status(400).json({ error: "Plan non spécifié." });
    }

    await User.findByIdAndUpdate(decoded.userId, { selectedPlan: plan });
    console.log(`✅ ${decoded.username} a choisi le plan : ${plan}`);

    res.status(200).json({ message: "Plan sélectionné avec succès." });
  } catch (error) {
    console.error("Erreur lors de la sélection du plan :", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// Route pour mettre à jour la photo de profil
app.post("/update-profile-image", async (req, res) => {
  try {
    const tokenHeader = req.headers.authorization;
    if (!tokenHeader || !tokenHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant ou invalide." });
    }

    const token = tokenHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { imageUri } = req.body;
    if (!imageUri) {
      return res.status(400).json({ error: "Aucune image spécifiée." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      decoded.userId,
      { profileImage: imageUri },
      { new: true }
    );

    console.log(`✅ Photo de profil mise à jour pour : ${updatedUser.username} (${updatedUser.email})`);
    console.log(`👉 Nouvelle image (tronquée) : ${updatedUser.profileImage.slice(0, 30)}...`);

    res.status(200).json({
      message: "Photo de profil mise à jour avec succès.",
      profileImage: updatedUser.profileImage || "",
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la photo de profil :", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// Gestion des connexions Socket.IO
io.on("connection", (socket) => {
  console.log("⚡ Utilisateur connecté via Socket.IO :", socket.id);

  let username = "Anonymous";

  socket.on("setUsername", (data) => {
    username = data.username;
    console.log(`✅ Nom d'utilisateur défini : ${username}`);
  });

  socket.on("sendMessage", (message) => {
    console.log(`💬 Message de ${username}:`, message.text);
    io.emit("receiveMessage", { ...message, sender: username });
  });

  socket.on("disconnect", () => {
    console.log("🔌 Utilisateur déconnecté :", socket.id);
  });
});

// Lancer le serveur
const PORT = process.env.PORT || 3636;
const IP_ADDRESS = "10.109.249.241";

server.listen(PORT, IP_ADDRESS, () =>
  console.log(`🚀 Serveur démarré sur http://${IP_ADDRESS}:${PORT}`)
);
