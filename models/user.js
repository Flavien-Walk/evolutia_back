const mongoose = require("mongoose");

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
});

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
