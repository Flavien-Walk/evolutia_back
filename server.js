const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Connexion à MongoDB
mongoose
  .connect(
    "mongodb+srv://flavienhypnose:nddfXBVv1uzn5FNT@cluster0.aug1e.mongodb.net/Cluster0",
    { useNewUrlParser: true, useUnifiedTopology: true }
  )
  .then(() => console.log("MongoDB connecté"))
  .catch((err) => console.error("Erreur de connexion à MongoDB :", err));

// Modèle d'utilisateur
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  contactNumber: { type: String },
  password: { type: String, required: true },
});

const User = mongoose.model("User", UserSchema);

// Route d'inscription
app.post("/register", async (req, res) => {
  console.log("Requête reçue :", req.body);
  try {
    const { email, username, contactNumber, password } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "Un utilisateur avec cet email existe déjà." });
    }

    // Créer un nouvel utilisateur
    const newUser = new User({ email, username, contactNumber, password });
    await newUser.save();
    res.status(201).json({ message: "Utilisateur créé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur :", error);
    res.status(500).json({ error: "Une erreur est survenue, veuillez réessayer." });
  }
});

// Route de connexion
app.post("/login", async (req, res) => {
  console.log("Tentative de connexion :", req.body);
  try {
    const { email, password } = req.body;

    // Vérification de l'utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Vérification du mot de passe
    if (user.password !== password) {
      return res.status(400).json({ error: "Mot de passe incorrect." });
    }

    // Succès
    res.status(200).json({ message: "Connexion réussie", user });
  } catch (error) {
    console.error("Erreur lors de la connexion :", error);
    res.status(500).json({ error: "Une erreur est survenue, veuillez réessayer." });
  }
});

// Route par défaut pour tester le serveur
app.get("/", (req, res) => {
  res.send("Le serveur fonctionne correctement !");
});

// Lancer le serveur
const PORT = 5000;
app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
