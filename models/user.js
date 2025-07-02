const mongoose = require("mongoose");

const CompletedModuleSchema = new mongoose.Schema({
  moduleId: { type: String, required: true },
  score: { type: Number, required: true },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  password: { type: String },

  role: {
    type: String,
    enum: ["User", "Bronze", "Gold", "Platinium", "Modérateur", "Admin", "Super-Admin"],
    default: "User",
  },
  roleColor: { type: String, default: "#808080" },
  selectedPlan: { type: String, default: "" }, // Offre choisie
  profileImage: { type: String, default: "" }, // Photo de profil

  // Progression du quiz
  quizProgress: {
    currentQuestion: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
  },

  // Modules complétés pour débloquer la suite
  completedModules: {
    type: [String],
    default: [],
  },

  // Modules complétés avec leur score associé
  completedModulesWithScore: {
    type: [CompletedModuleSchema],
    default: [],
  },
});

// Middleware pour mettre à jour automatiquement la couleur selon le rôle
UserSchema.pre("save", function (next) {
  const roleColors = {
    User: "#808080",
    Bronze: "#CD7F32",
    Gold: "#FFD700",
    Platinium: "#E5E4E2",
    Modérateur: "#ADD8E6",
    Admin: "#FF4500",
    "Super-Admin": "#9400D3",
  };
  this.roleColor = roleColors[this.role] || "#808080";
  next();
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
