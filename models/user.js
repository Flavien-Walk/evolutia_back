const mongoose = require("mongoose");

// Schéma pour une question individuelle dans un module
const QuestionResultSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true },
  isCorrect: { type: Boolean, required: true },
  timeSpent: { type: Number, default: 0 }, // en secondes
  answeredAt: { type: Date, default: Date.now }
});

// Schéma pour la progression d'un module
const ModuleProgressSchema = new mongoose.Schema({
  moduleId: { type: String, required: true },
  questionsAnswered: { type: Number, default: 0 },
  totalQuestions: { type: Number, required: true },
  correctAnswers: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['not_started', 'in_progress', 'completed'], 
    default: 'not_started' 
  },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  finalScore: { type: Number }, // Score final en pourcentage
  questionResults: [QuestionResultSchema] // Détail de chaque question
});

// Schéma pour un module complété avec score (rétrocompatibilité)
const CompletedModuleSchema = new mongoose.Schema({
  moduleId: { type: String, required: true },
  score: { type: Number, required: true }, // Score en pourcentage
  completedAt: { type: Date, default: Date.now }
});

// Schéma principal utilisateur
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    default: "User" 
  },
  roleColor: { 
    type: String, 
    default: "#6C63FF" 
  },
  profileImage: { 
    type: String, 
    default: "" 
  },
  selectedPlan: { 
    type: String, 
    default: "" 
  },
  
  // ✨ NOUVEAU : Progression granulaire par module
  moduleProgress: {
    type: Map,
    of: ModuleProgressSchema,
    default: () => new Map()
  },
  
  // ✅ CONSERVÉ : Compatibilité avec l'ancien système
  completedModules: [{ 
    type: String 
  }],
  completedModulesWithScore: [CompletedModuleSchema],
  
  // ✅ CONSERVÉ : Progression de quiz simple (compatibilité)
  quizProgress: {
    currentQuestion: { type: Number, default: 0 },
    score: { type: Number, default: 0 }
  },
  
  // 📊 Métadonnées utilisateur
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLoginAt: { 
    type: Date, 
    default: Date.now 
  },
  totalTimeSpent: { 
    type: Number, 
    default: 0 
  }, // Temps total en secondes
  
  // 🎯 Préférences utilisateur
  preferences: {
    theme: { type: String, default: "light" },
    notifications: { type: Boolean, default: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" }
  }
}, {
  timestamps: true
});

// Index pour optimiser les requêtes
userSchema.index({ email: 1 });
userSchema.index({ "moduleProgress.moduleId": 1 });
userSchema.index({ completedModules: 1 });

// Méthodes d'instance
userSchema.methods.getModuleProgress = function(moduleId) {
  return this.moduleProgress.get(moduleId) || null;
};

userSchema.methods.isModuleCompleted = function(moduleId) {
  const progress = this.moduleProgress.get(moduleId);
  return progress && progress.status === 'completed';
};

userSchema.methods.getGlobalStats = function() {
  const completedCount = this.completedModules.length;
  const totalAvailable = 8; // Nombre de modules disponibles
  const globalProgress = Math.round((completedCount / totalAvailable) * 100);
  
  const averageScore = this.completedModulesWithScore.length > 0 ? 
    Math.round(this.completedModulesWithScore.reduce((sum, m) => sum + m.score, 0) / this.completedModulesWithScore.length) : 0;
  
  return {
    globalProgress,
    completedCount,
    totalAvailable,
    averageScore,
    bestScore: this.completedModulesWithScore.length > 0 ? 
      Math.max(...this.completedModulesWithScore.map(m => m.score)) : 0
  };
};

userSchema.methods.getTotalQuestionsAnswered = function() {
  let total = 0;
  for (const [moduleId, progress] of this.moduleProgress) {
    total += progress.questionsAnswered || 0;
  }
  return total;
};

userSchema.methods.getTotalCorrectAnswers = function() {
  let total = 0;
  for (const [moduleId, progress] of this.moduleProgress) {
    total += progress.correctAnswers || 0;
  }
  return total;
};

// Middleware pre-save pour maintenir la cohérence
userSchema.pre('save', function(next) {
  // Synchroniser completedModules avec moduleProgress
  const completedFromProgress = [];
  for (const [moduleId, progress] of this.moduleProgress) {
    if (progress.status === 'completed') {
      completedFromProgress.push(moduleId);
    }
  }
  
  // Mettre à jour completedModules
  this.completedModules = [...new Set(completedFromProgress)];
  
  // Mettre à jour completedModulesWithScore
  const completedWithScore = [];
  for (const [moduleId, progress] of this.moduleProgress) {
    if (progress.status === 'completed' && progress.finalScore !== undefined) {
      const existingIndex = this.completedModulesWithScore.findIndex(m => m.moduleId === moduleId);
      if (existingIndex !== -1) {
        this.completedModulesWithScore[existingIndex].score = progress.finalScore;
      } else {
        completedWithScore.push({
          moduleId,
          score: progress.finalScore,
          completedAt: progress.completedAt || new Date()
        });
      }
    }
  }
  
  // Ajouter les nouveaux modules complétés
  this.completedModulesWithScore.push(...completedWithScore);
  
  next();
});

module.exports = mongoose.model("User", userSchema);