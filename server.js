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

// Configuration des modules disponibles
const AVAILABLE_MODULES = {
  'math': { name: 'Mathématiques', totalQuestions: 10, emoji: '🔢' },
  'physics': { name: 'Physique', totalQuestions: 10, emoji: '⚛️' },
  'chemistry': { name: 'Chimie', totalQuestions: 10, emoji: '🧪' },
  'biology': { name: 'Biologie', totalQuestions: 10, emoji: '🧬' },
  'french': { name: 'Français', totalQuestions: 10, emoji: '📚' },
  'english': { name: 'Anglais', totalQuestions: 10, emoji: '🇬🇧' },
  'history': { name: 'Histoire', totalQuestions: 10, emoji: '🏛️' },
  'geography': { name: 'Géographie', totalQuestions: 10, emoji: '🌍' }
};

// —––––––– ROUTE RACINE
app.get("/", (req, res) => {
  res.send("🚀 API Evolutia fonctionne bien !");
});

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

// 🌟 ROUTES AUTH (inchangées)
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

// 🌟 ROUTES UTILISATEUR (inchangées)
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

// ✨ NOUVELLES ROUTES QUIZ AVEC SUIVI GRANULAIRE

// 📊 Démarrer ou reprendre un module
app.post("/start-module", authenticate, async (req, res) => {
  try {
    const { moduleId } = req.body;
    if (!moduleId || !AVAILABLE_MODULES[moduleId]) {
      return res.status(400).json({ error: "Module ID invalide." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });

    // Initialiser les structures si nécessaire
    if (!user.moduleProgress) user.moduleProgress = new Map();
    if (!user.completedModules) user.completedModules = [];
    if (!user.completedModulesWithScore) user.completedModulesWithScore = [];

    // Vérifier si le module existe déjà
    const existingProgress = user.moduleProgress.get(moduleId);
    
    if (!existingProgress) {
      // Nouveau module
      user.moduleProgress.set(moduleId, {
        moduleId,
        questionsAnswered: 0,
        totalQuestions: AVAILABLE_MODULES[moduleId].totalQuestions,
        correctAnswers: 0,
        startedAt: new Date(),
        status: 'in_progress',
        questionResults: []
      });
      await user.save();
      
      console.log(`🚀 Module ${moduleId} démarré pour ${user.username}`);
      res.status(200).json({ 
        message: "Module démarré.", 
        progress: user.moduleProgress.get(moduleId)
      });
    } else {
      // Module existant
      console.log(`🔄 Module ${moduleId} repris pour ${user.username}`);
      res.status(200).json({ 
        message: "Module repris.", 
        progress: existingProgress 
      });
    }
  } catch (error) {
    console.error("❌ Erreur start-module :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 📝 Enregistrer la réponse à une question
app.post("/answer-question", authenticate, async (req, res) => {
  try {
    const { moduleId, questionIndex, isCorrect, timeSpent } = req.body;
    
    if (!moduleId || questionIndex === undefined || isCorrect === undefined) {
      return res.status(400).json({ error: "Données manquantes." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });

    if (!user.moduleProgress) user.moduleProgress = new Map();
    
    const moduleProgress = user.moduleProgress.get(moduleId);
    if (!moduleProgress) {
      return res.status(400).json({ error: "Module non démarré." });
    }

    // Vérifier si la question n'a pas déjà été répondue
    const existingAnswer = moduleProgress.questionResults.find(q => q.questionIndex === questionIndex);
    if (existingAnswer) {
      return res.status(400).json({ error: "Question déjà répondue." });
    }

    // Enregistrer la réponse
    moduleProgress.questionResults.push({
      questionIndex,
      isCorrect,
      timeSpent: timeSpent || 0,
      answeredAt: new Date()
    });

    if (isCorrect) {
      moduleProgress.correctAnswers++;
    }
    
    moduleProgress.questionsAnswered = moduleProgress.questionResults.length;
    
    // Vérifier si le module est terminé
    if (moduleProgress.questionsAnswered >= moduleProgress.totalQuestions) {
      moduleProgress.status = 'completed';
      moduleProgress.completedAt = new Date();
      moduleProgress.finalScore = Math.round((moduleProgress.correctAnswers / moduleProgress.totalQuestions) * 100);
      
      // Ajouter aux modules complétés
      if (!user.completedModules.includes(moduleId)) {
        user.completedModules.push(moduleId);
      }
      
      // Mettre à jour ou ajouter le score
      const existingScoreIndex = user.completedModulesWithScore.findIndex(m => m.moduleId === moduleId);
      if (existingScoreIndex !== -1) {
        user.completedModulesWithScore[existingScoreIndex].score = moduleProgress.finalScore;
      } else {
        user.completedModulesWithScore.push({
          moduleId,
          score: moduleProgress.finalScore
        });
      }
      
      console.log(`🎉 Module ${moduleId} terminé par ${user.username} avec ${moduleProgress.finalScore}%`);
    }

    user.moduleProgress.set(moduleId, moduleProgress);
    await user.save();

    res.status(200).json({
      message: "Réponse enregistrée.",
      progress: moduleProgress,
      isModuleCompleted: moduleProgress.status === 'completed'
    });

  } catch (error) {
    console.error("❌ Erreur answer-question :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 📊 Obtenir les statistiques détaillées
app.get("/get-detailed-progress", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });

    // Convertir la Map en objet
    const moduleProgressObj = {};
    if (user.moduleProgress) {
      for (const [key, value] of user.moduleProgress) {
        moduleProgressObj[key] = value;
      }
    }

    // Calculer les statistiques globales
    const totalAvailableModules = Object.keys(AVAILABLE_MODULES).length;
    const completedModules = user.completedModules || [];
    const completedModulesWithScore = user.completedModulesWithScore || [];
    
    // Modules en cours
    const modulesInProgress = [];
    if (user.moduleProgress) {
      for (const [moduleId, progress] of user.moduleProgress) {
        if (progress.status === 'in_progress') {
          modulesInProgress.push({
            moduleId,
            questionsAnswered: progress.questionsAnswered,
            totalQuestions: progress.totalQuestions,
            progressPercentage: Math.round((progress.questionsAnswered / progress.totalQuestions) * 100),
            currentScore: progress.questionsAnswered > 0 ? Math.round((progress.correctAnswers / progress.questionsAnswered) * 100) : 0
          });
        }
      }
    }

    // Calculs statistiques
    const totalQuestionsAnswered = Object.values(moduleProgressObj).reduce((sum, module) => 
      sum + (module.questionsAnswered || 0), 0
    );
    
    const totalCorrectAnswers = Object.values(moduleProgressObj).reduce((sum, module) => 
      sum + (module.correctAnswers || 0), 0
    );

    const globalAccuracy = totalQuestionsAnswered > 0 ? 
      Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 100) : 0;

    const globalProgress = Math.round((completedModules.length / totalAvailableModules) * 100);
    
    const averageScore = completedModulesWithScore.length > 0 ? 
      Math.round(completedModulesWithScore.reduce((sum, m) => sum + m.score, 0) / completedModulesWithScore.length) : 0;

    const bestScore = completedModulesWithScore.length > 0 ? 
      Math.max(...completedModulesWithScore.map(m => m.score)) : 0;

    // Temps total passé
    const totalTimeSpent = Object.values(moduleProgressObj).reduce((sum, module) => {
      if (module.questionResults) {
        return sum + module.questionResults.reduce((moduleSum, q) => moduleSum + (q.timeSpent || 0), 0);
      }
      return sum;
    }, 0);

    // Analyse des forces et faiblesses
    const subjectAnalysis = completedModulesWithScore.map(module => ({
      moduleId: module.moduleId,
      score: module.score,
      name: AVAILABLE_MODULES[module.moduleId]?.name || module.moduleId,
      emoji: AVAILABLE_MODULES[module.moduleId]?.emoji || '📚'
    })).sort((a, b) => b.score - a.score);

    res.status(200).json({
      // Progression globale
      globalStats: {
        globalProgress,
        totalAvailableModules,
        completedModulesCount: completedModules.length,
        modulesInProgressCount: modulesInProgress.length,
        averageScore,
        bestScore,
        globalAccuracy,
        totalQuestionsAnswered,
        totalCorrectAnswers,
        totalTimeSpent: Math.round(totalTimeSpent / 60) // en minutes
      },
      
      // Modules complétés avec scores
      completedModulesWithScore,
      
      // Modules en cours
      modulesInProgress,
      
      // Détails par module
      moduleProgress: moduleProgressObj,
      
      // Analyse des matières
      subjectAnalysis,
      
      // Données pour graphiques
      chartData: {
        scoreDistribution: completedModulesWithScore,
        progressTimeline: Object.values(moduleProgressObj)
          .filter(m => m.completedAt)
          .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
          .map(m => ({
            date: m.completedAt,
            moduleId: m.moduleId,
            score: m.finalScore
          })),
        accuracyByModule: Object.entries(moduleProgressObj).map(([moduleId, progress]) => ({
          moduleId,
          accuracy: progress.questionsAnswered > 0 ? 
            Math.round((progress.correctAnswers / progress.questionsAnswered) * 100) : 0,
          questionsAnswered: progress.questionsAnswered
        }))
      },

      // Recommandations
      recommendations: generateRecommendations(moduleProgressObj, completedModulesWithScore, modulesInProgress)
    });

  } catch (error) {
    console.error("❌ Erreur get-detailed-progress :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 🎯 Fonction pour générer des recommandations personnalisées
function generateRecommendations(moduleProgress, completedModules, modulesInProgress) {
  const recommendations = [];
  
  // Recommandation pour modules en cours
  if (modulesInProgress.length > 0) {
    const nearCompletion = modulesInProgress.filter(m => m.progressPercentage >= 70);
    if (nearCompletion.length > 0) {
      recommendations.push({
        type: 'completion',
        priority: 'high',
        message: `Tu es proche de terminer ${nearCompletion.length} module(s). Continue !`,
        modules: nearCompletion.map(m => m.moduleId)
      });
    }
  }
  
  // Recommandation pour amélioration
  if (completedModules.length > 0) {
    const lowScores = completedModules.filter(m => m.score < 70);
    if (lowScores.length > 0) {
      recommendations.push({
        type: 'improvement',
        priority: 'medium',
        message: `Révise ${lowScores[0].moduleId} pour améliorer ton score de ${lowScores[0].score}%`,
        modules: [lowScores[0].moduleId]
      });
    }
  }
  
  // Recommandation pour nouveaux modules
  const availableModules = Object.keys(AVAILABLE_MODULES);
  const startedModules = Object.keys(moduleProgress);
  const notStarted = availableModules.filter(m => !startedModules.includes(m));
  
  if (notStarted.length > 0) {
    recommendations.push({
      type: 'exploration',
      priority: 'low',
      message: `Découvre de nouvelles matières : ${notStarted.slice(0, 2).join(', ')}`,
      modules: notStarted.slice(0, 2)
    });
  }
  
  return recommendations;
}

// 📊 Route pour obtenir la progression simple (compatibilité)
app.get("/get-progress", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });

    res.status(200).json({
      currentQuestion: user.quizProgress?.currentQuestion || 0,
      score: user.quizProgress?.score || 0,
      completedModules: user.completedModules || [],
      completedModulesWithScore: user.completedModulesWithScore || [],
    });
  } catch (error) {
    console.error("❌ Erreur get-progress :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 🔄 Route pour réinitialiser un module
app.post("/reset-module", authenticate, async (req, res) => {
  try {
    const { moduleId } = req.body;
    if (!moduleId) {
      return res.status(400).json({ error: "Module ID manquant." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });

    // Supprimer de moduleProgress
    if (user.moduleProgress) {
      user.moduleProgress.delete(moduleId);
    }

    // Supprimer de completedModules
    if (user.completedModules) {
      user.completedModules = user.completedModules.filter(m => m !== moduleId);
    }

    // Supprimer de completedModulesWithScore
    if (user.completedModulesWithScore) {
      user.completedModulesWithScore = user.completedModulesWithScore.filter(m => m.moduleId !== moduleId);
    }

    await user.save();

    console.log(`🔄 Module ${moduleId} réinitialisé pour ${user.username}`);
    res.status(200).json({ message: "Module réinitialisé avec succès." });

  } catch (error) {
    console.error("❌ Erreur reset-module :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 📈 Route pour obtenir les statistiques du tableau de bord
app.get("/dashboard-stats", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });

    const totalAvailableModules = Object.keys(AVAILABLE_MODULES).length;
    const completedModules = user.completedModules || [];
    const completedModulesWithScore = user.completedModulesWithScore || [];
    
    const globalProgress = Math.round((completedModules.length / totalAvailableModules) * 100);
    const averageScore = completedModulesWithScore.length > 0 ? 
      Math.round(completedModulesWithScore.reduce((sum, m) => sum + m.score, 0) / completedModulesWithScore.length) : 0;

    // Calculer les modules en cours
    let modulesInProgressCount = 0;
    if (user.moduleProgress) {
      for (const [moduleId, progress] of user.moduleProgress) {
        if (progress.status === 'in_progress') {
          modulesInProgressCount++;
        }
      }
    }

    res.status(200).json({
      globalProgress,
      totalModules: completedModules.length,
      averageScore,
      totalAvailableModules,
      modulesInProgressCount,
      recentActivity: {
        lastModuleCompleted: completedModulesWithScore.length > 0 ? 
          completedModulesWithScore[completedModulesWithScore.length - 1] : null,
        totalSessions: Object.keys(user.moduleProgress || {}).length
      }
    });

  } catch (error) {
    console.error("❌ Erreur dashboard-stats :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 🌐 SOCKET.IO (inchangé)
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