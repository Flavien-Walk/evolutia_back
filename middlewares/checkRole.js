const jwt = require("jsonwebtoken");

const checkRole = (allowedRoles) => (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Récupère le token de la requête
  if (!token) {
    return res.status(401).json({ error: "Token manquant." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Vérifie et décode le token
    if (!allowedRoles.includes(decoded.role)) {
      return res.status(403).json({ error: "Accès refusé. Rôle non autorisé." });
    }
    req.user = decoded; // Ajoute les infos utilisateur à la requête
    next(); // Passe à l'étape suivante si tout est OK
  } catch (error) {
    res.status(401).json({ error: "Token invalide." });
  }
};

module.exports = checkRole;
