const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  contactNumber: { type: String },
  password: { type: String },
  role: {
    type: String,
    enum: ["User", "Bronze", "Gold", "Platinium", "Modérateur", "Admin", "Super-Admin"],
    default: "User",
  },
  roleColor: {
    type: String,
    default: "#808080", // Gris par défaut pour le rôle "User"
  },
});

// Définir les couleurs dynamiques pour chaque rôle
UserSchema.pre("save", function (next) {
  const roleColors = {
    User: "#808080", // Gris
    Bronze: "#CD7F32", // Bronze
    Gold: "#FFD700", // Or
    Platinium: "#E5E4E2", // Platine
    Modérateur: "#ADD8E6", // Bleu clair
    Admin: "#FF4500", // Rouge orangé
    "Super-Admin": "#9400D3", // Violet foncé
  };

  this.roleColor = roleColors[this.role] || "#808080";
  next();
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
