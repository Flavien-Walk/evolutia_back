// 📦 Dépendances
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

// 📂 Modèles
const User = require("./models/user");

// 🚀 Initialisation
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 🔗 Connexion MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connecté"))
  .catch((err) => console.error("❌ MongoDB connexion échouée :", err));

// 🔐 Middlewares
app.use(bodyParser.json({ limit: "10mb" }));
app.use(cors());

// Logger global
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// —––––––– ROUTE RACINE pour éviter l’erreur “Cannot GET /”
app.get("/", (req, res) => {
  res.send("🚀 API Evolutia fonctionne bien !");
});

// Middleware pour extraire et vérifier le token JWT
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant ou invalide." });
  }
  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    console.log("⚠️ Token invalide ou expiré.");
    res.status(401).json({ error: "Token invalide ou expiré." });
  }
};

// 🔐 Génération de token
const generateToken = (user) =>
  jwt.sign(
    { userId: user._id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

// 🛠️ Utilitaires
const userPayload = (user) => ({
  username: user.username,
  email: user.email,
  role: user.role || "User",
  roleColor: user.roleColor || "#808080",
  profileImage: user.profileImage || "",
  selectedPlan: user.selectedPlan || "",
});

// 🌟 ROUTES AUTH
app.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
const username = `${firstName} ${lastName}`;

    console.log(`🔐 Inscription : ${username} (${email})`);

    if (await User.findOne({ email })) {
      return res.status(400).json({ error: "Email déjà utilisé." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ email, username, password: hashedPassword });

    const token = generateToken(newUser);
    res.status(201).json({
      message: "Utilisateur créé avec succès.",
      token,
      user: userPayload(newUser),
    });
  } catch (error) {
    console.error("❌ Erreur inscription :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`🔑 Connexion : ${email}`);

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Email ou mot de passe incorrect." });
    }

    const token = generateToken(user);
    res.status(200).json({ message: "Connexion réussie.", token, user: userPayload(user) });
  } catch (error) {
    console.error("❌ Erreur connexion :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/google-login", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token Google manquant." });

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email, name, sub } = ticket.getPayload();

    let user = await User.findOne({ email });
    if (!user) {
      const hashedPassword = await bcrypt.hash(sub, 10);
      user = await User.create({
        email,
        username: name || "Google User",
        password: hashedPassword,
      });
      console.log(`✅ Compte Google créé : ${email}`);
    }

    const jwtToken = generateToken(user);
    res.status(200).json({
      message: "Connexion via Google réussie.",
      token: jwtToken,
      user: userPayload(user),
    });
  } catch (error) {
    console.error("❌ Erreur Google login :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/logout", authenticate, (req, res) => {
  console.log(`🔌 Déconnexion : ${req.user.username}`);
  res.status(200).json({ message: "Déconnexion réussie." });
});

// 🌟 ROUTES UTILISATEUR
app.get("/user-info", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });
    res.status(200).json(userPayload(user));
  } catch (error) {
    console.error("❌ Erreur user-info :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/choose-plan", authenticate, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan) return res.status(400).json({ error: "Plan non spécifié." });

    await User.findByIdAndUpdate(req.user.userId, { selectedPlan: plan });
    console.log(`✅ ${req.user.username} a choisi le plan ${plan}`);
    res.status(200).json({ message: "Plan mis à jour." });
  } catch (error) {
    console.error("❌ Erreur choose-plan :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/update-profile-image", authenticate, async (req, res) => {
  try {
    const { imageUri } = req.body;
    if (!imageUri) return res.status(400).json({ error: "Image manquante." });

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { profileImage: imageUri },
      { new: true }
    );

    console.log(`✅ Profil mis à jour pour ${user.username}`);
    res.status(200).json({
      message: "Photo de profil mise à jour.",
      profileImage: user.profileImage,
    });
  } catch (error) {
    console.error("❌ Erreur update-profile-image :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 🌟 ROUTES QUIZ
app.post("/save-progress", authenticate, async (req, res) => {
  try {
    const { currentQuestion, score } = req.body;
    if (currentQuestion == null || score == null) {
      return res.status(400).json({ error: "Données manquantes." });
    }

    await User.findByIdAndUpdate(req.user.userId, {
      quizProgress: { currentQuestion, score },
    });
    res.status(200).json({ message: "Progression sauvegardée." });
  } catch (error) {
    console.error("❌ Erreur save-progress :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.get("/get-progress", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });

    res.status(200).json({
      ...user.quizProgress,
      completedModules: user.completedModules || [],
      completedModulesWithScore: user.completedModulesWithScore || [],
    });
  } catch (error) {
    console.error("❌ Erreur get-progress :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/complete-module", authenticate, async (req, res) => {
  try {
    const { moduleId, score } = req.body;
    if (!moduleId || score === undefined) {
      return res.status(400).json({ error: "Module ID ou score manquant." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });

    if (!user.completedModules.includes(moduleId)) {
      user.completedModules.push(moduleId);
    }

    const idx = user.completedModulesWithScore.findIndex(m => m.moduleId === moduleId);
    if (idx !== -1) {
      user.completedModulesWithScore[idx].score = score;
    } else {
      user.completedModulesWithScore.push({ moduleId, score });
    }

    user.quizProgress = { currentQuestion: 0, score };
    await user.save();

    console.log(`✅ Module ${moduleId} terminé avec un score de ${score} pour ${user.username}`);
    res.status(200).json({ message: "Module marqué comme complété." });
  } catch (error) {
    console.error("❌ Erreur complete-module :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 🌐 SOCKET.IO
io.on("connection", (socket) => {
  console.log("⚡ Connexion Socket.IO :", socket.id);

  let username = "Anonymous";

  socket.on("setUsername", ({ username: name }) => {
    username = name;
    console.log(`✅ Nom d'utilisateur : ${username}`);
  });

  socket.on("sendMessage", (message) => {
    console.log(`💬 ${username}:`, message.text);
    io.emit("receiveMessage", { ...message, sender: username });
  });

  socket.on("disconnect", () => {
    console.log("🔌 Déconnexion Socket.IO :", socket.id);
  });
});

// 🚀 Serveur
const PORT = process.env.PORT || 3636;
server.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));


// Coucou Charles :) 