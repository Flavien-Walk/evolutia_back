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

// —––––––– ROUTE RACINE pour éviter l'erreur "Cannot GET /"
app.get("/", (req, res) => {
  res.send("🚀 API Evolutia fonctionne bien !");
});

// Middleware pour extraire et vérifier le token JWT
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant ou invalide." });
    }
    
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.log("⚠️ Token invalide ou expiré:", error.message);
    res.status(401).json({ error: "Token invalide ou expiré." });
  }
};

// 🔐 Génération de token
const generateToken = (user) =>
  jwt.sign(
    { userId: user._id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

// 🛠️ Utilitaires
const userPayload = (user) => ({
  username: user.username,
  email: user.email,
  role: user.role || "User",
  roleColor: user.roleColor || "#6C63FF",
  profileImage: user.profileImage || "",
  selectedPlan: user.selectedPlan || "",
});

// Fonction de validation email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// 🌟 ROUTES AUTH CORRIGÉES
app.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    
    // ✅ Validation des données d'entrée
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Tous les champs sont requis." });
    }

    // ✅ Validation de l'email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Format d'email invalide." });
    }

    // ✅ Validation du mot de passe
    if (password.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
    }

    const username = `${firstName.trim()} ${lastName.trim()}`;
    console.log(`🔐 Tentative d'inscription : ${username} (${email})`);

    // ✅ Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log(`⚠️ Email déjà utilisé : ${email}`);
      return res.status(400).json({ error: "Un compte existe déjà avec cet email." });
    }

    // ✅ Créer le hash du mot de passe
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // ✅ Créer le nouvel utilisateur
    const newUser = await User.create({
      email: email.toLowerCase(),
      username: username,
      password: hashedPassword,
      completedModules: [],
      completedModulesWithScore: [],
      quizProgress: { currentQuestion: 0, score: 0 }
    });

    console.log(`✅ Utilisateur créé avec succès : ${newUser.username}`);

    // ✅ Générer le token
    const token = generateToken(newUser);

    res.status(201).json({
      message: "Utilisateur créé avec succès.",
      token,
      user: userPayload(newUser),
    });

  } catch (error) {
    console.error("❌ Erreur inscription :", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "Email déjà utilisé." });
    }
    res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // ✅ Validation des données d'entrée
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis." });
    }

    console.log(`🔑 Tentative de connexion : ${email}`);

    // ✅ Chercher l'utilisateur
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`⚠️ Utilisateur non trouvé : ${email}`);
      return res.status(400).json({ error: "Email ou mot de passe incorrect." });
    }

    // ✅ Vérifier le mot de passe
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log(`⚠️ Mot de passe incorrect pour : ${email}`);
      return res.status(400).json({ error: "Email ou mot de passe incorrect." });
    }

    console.log(`✅ Connexion réussie : ${user.username}`);

    // ✅ Générer le token
    const token = generateToken(user);

    res.status(200).json({
      message: "Connexion réussie.",
      token,
      user: userPayload(user),
    });

  } catch (error) {
    console.error("❌ Erreur connexion :", error);
    res.status(500).json({ error: "Erreur serveur lors de la connexion." });
  }
});

app.post("/google-login", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token Google manquant." });
    }

    console.log("🔍 Vérification du token Google...");

    // ✅ Vérifier le token Google
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub } = payload;

    console.log(`🔍 Token Google valide pour : ${email}`);

    // ✅ Chercher ou créer l'utilisateur
    let user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`➕ Création d'un nouveau compte Google : ${email}`);
      
      const hashedPassword = await bcrypt.hash(sub, 12);
      user = await User.create({
        email: email.toLowerCase(),
        username: name || "Google User",
        password: hashedPassword,
        completedModules: [],
        completedModulesWithScore: [],
        quizProgress: { currentQuestion: 0, score: 0 }
      });
      
      console.log(`✅ Compte Google créé : ${user.username}`);
    } else {
      console.log(`✅ Connexion Google existante : ${user.username}`);
    }

    // ✅ Générer le token JWT
    const jwtToken = generateToken(user);

    res.status(200).json({
      message: "Connexion via Google réussie.",
      token: jwtToken,
      user: userPayload(user),
    });

  } catch (error) {
    console.error("❌ Erreur Google login :", error);
    res.status(500).json({ error: "Erreur serveur lors de la connexion Google." });
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
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }
    
    console.log(`📋 Infos utilisateur récupérées : ${user.username}`);
    res.status(200).json(userPayload(user));
  } catch (error) {
    console.error("❌ Erreur user-info :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/choose-plan", authenticate, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan) {
      return res.status(400).json({ error: "Plan non spécifié." });
    }

    await User.findByIdAndUpdate(req.user.userId, { selectedPlan: plan });
    console.log(`✅ ${req.user.username} a choisi le plan ${plan}`);
    res.status(200).json({ message: "Plan mis à jour avec succès." });
  } catch (error) {
    console.error("❌ Erreur choose-plan :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/update-profile-image", authenticate, async (req, res) => {
  try {
    const { imageUri } = req.body;
    if (!imageUri) {
      return res.status(400).json({ error: "Image manquante." });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { profileImage: imageUri },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    console.log(`✅ Photo de profil mise à jour pour ${user.username}`);
    res.status(200).json({
      message: "Photo de profil mise à jour avec succès.",
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
      return res.status(400).json({ error: "Données de progression manquantes." });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { quizProgress: { currentQuestion, score } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    console.log(`💾 Progression sauvegardée pour ${user.username}: Q${currentQuestion}, Score ${score}`);
    res.status(200).json({ message: "Progression sauvegardée avec succès." });
  } catch (error) {
    console.error("❌ Erreur save-progress :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.get("/get-progress", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const progressData = {
      currentQuestion: user.quizProgress?.currentQuestion || 0,
      score: user.quizProgress?.score || 0,
      completedModules: user.completedModules || [],
      completedModulesWithScore: user.completedModulesWithScore || [],
    };

    console.log(`📊 Progression récupérée pour ${user.username}:`, {
      completedModules: progressData.completedModules.length,
      completedModulesWithScore: progressData.completedModulesWithScore.length
    });

    res.status(200).json(progressData);
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
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // ✅ Assurer l'initialisation des tableaux
    if (!user.completedModules) user.completedModules = [];
    if (!user.completedModulesWithScore) user.completedModulesWithScore = [];

    // ✅ Ajouter à completedModules SEULEMENT si pas déjà présent
    if (!user.completedModules.includes(moduleId)) {
      user.completedModules.push(moduleId);
      console.log(`➕ Module ${moduleId} ajouté à completedModules`);
    }

    // ✅ Gérer completedModulesWithScore (mise à jour ou ajout)
    const existingIndex = user.completedModulesWithScore.findIndex(m => m.moduleId === moduleId);
    if (existingIndex !== -1) {
      // Module déjà présent, on met à jour le score
      user.completedModulesWithScore[existingIndex].score = score;
      console.log(`🔄 Score mis à jour pour ${moduleId}: ${score}%`);
    } else {
      // Nouveau module, on l'ajoute
      user.completedModulesWithScore.push({ moduleId, score });
      console.log(`➕ Nouveau module ajouté: ${moduleId} avec score ${score}%`);
    }

    // ✅ Réinitialiser la progression du quiz
    user.quizProgress = { currentQuestion: 0, score: 0 };
    
    await user.save();

    // ✅ Debug logs pour vérifier la cohérence
    console.log(`📊 État après sauvegarde pour ${user.username}:`);
    console.log(`   - completedModules (${user.completedModules.length}): [${user.completedModules.join(', ')}]`);
    console.log(`   - completedModulesWithScore (${user.completedModulesWithScore.length}): ${JSON.stringify(user.completedModulesWithScore)}`);

    res.status(200).json({ 
      message: "Module marqué comme complété avec succès.",
      debug: {
        completedModulesCount: user.completedModules.length,
        completedModulesWithScoreCount: user.completedModulesWithScore.length
      }
    });
  } catch (error) {
    console.error("❌ Erreur complete-module :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 🌐 SOCKET.IO
io.on("connection", (socket) => {
  console.log("⚡ Nouvelle connexion Socket.IO :", socket.id);

  let username = "Anonymous";

  socket.on("setUsername", ({ username: name }) => {
    username = name || "Anonymous";
    console.log(`✅ Nom d'utilisateur défini : ${username}`);
  });

  socket.on("sendMessage", (message) => {
    if (message && message.text) {
      console.log(`💬 ${username}:`, message.text);
      io.emit("receiveMessage", { ...message, sender: username });
    }
  });

  socket.on("disconnect", () => {
    console.log("🔌 Déconnexion Socket.IO :", socket.id);
  });
});

// 🚀 Gestion d'erreurs globales
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// 🚀 Serveur
const PORT = process.env.PORT || 3636;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Evolutia démarré sur le port ${PORT}`);
  console.log(`📍 Environnement: ${process.env.NODE_ENV || 'development'}`);
});

// Coucou Charles :)