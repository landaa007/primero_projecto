require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. CONNEXION BASE DE DONNÉES ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connecté à MongoDB"))
  .catch(err => console.error("❌ Erreur MongoDB :", err));

// --- 2. DÉFINITION DES MODÈLES (SCHEMAS) ---

// Utilisateur
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// Conversation (Dossier)
const ChatSchema = new mongoose.Schema({
  userId: String, // Appartient à qui ?
  title: String,
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', ChatSchema);

// Message (Contenu)
const MessageSchema = new mongoose.Schema({
  chatId: String, // Appartient à quel dossier ?
  role: String,   // "user" ou "assistant"
  content: String,
  date: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);


// --- 3. MIDDLEWARE DE SÉCURITÉ (LE VIDEUR) ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // On enlève "Bearer "

  if (!token) return res.status(401).json({ error: "Accès refusé (Pas de token)" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token invalide" });
    req.user = user; // On stocke l'info du user pour la suite
    next();
  });
};


// --- 4. CONFIGURATION IA (GOOGLE GEMINI) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// On utilise le modèle récent qui marche pour ton compte
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });


// --- 5. ROUTES D'AUTHENTIFICATION ---

// Inscription
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    // On crypte le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword });
    res.json({ message: "Utilisateur créé avec succès !" });
  } catch (err) {
    res.status(500).json({ error: "Erreur inscription (Email déjà pris ?)" });
  }
});

// Connexion
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Utilisateur inconnu" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Mot de passe incorrect" });

    // On crée le Token (Carte d'identité numérique)
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET);
    res.json({ token, email: user.email });
  } catch (err) {
    res.status(500).json({ error: "Erreur connexion" });
  }
});


// --- 6. ROUTES DU CHAT (PROTÉGÉES) ---

// Créer une nouvelle conversation
app.post('/chats', authenticateToken, async (req, res) => {
  try {
    const newChat = await Chat.create({ userId: req.user.id, title: "Nouvelle conversation" });
    res.json(newChat);
  } catch (err) {
    res.status(500).json({ error: "Erreur création chat" });
  }
});

// Récupérer la liste des conversations (Sidebar)
app.get('/chats', authenticateToken, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: "Erreur chargement chats" });
  }
});

// Récupérer les messages d'une conversation
app.get('/chats/:id/messages', authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.id }).sort({ date: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Erreur chargement messages" });
  }
});

// --- ROUTE DE STREAMING (Celle qui fait l'effet Matrix) ---
app.post('/chats/:id/messages', authenticateToken, async (req, res) => {
  const chatId = req.params.id;
  const userMessage = req.body.message;

  try {
    // A. Sauvegarder le message de l'utilisateur
    await Message.create({ chatId, role: "user", content: userMessage });

    // B. Préparer le Streaming (Headers HTTP)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // C. Demander à Google de streamer la réponse
    const result = await model.generateContentStream(userMessage);

    let fullResponse = "";

    // D. Boucle de lecture du flux
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText); // Envoi immédiat au Frontend
      fullResponse += chunkText; // Stockage pour la BDD
    }

    res.end(); // Fin de la transmission

    // E. Sauvegarder la réponse complète de l'IA
    await Message.create({ chatId, role: "assistant", content: fullResponse });

    // F. Mettre à jour le titre du chat (si c'est le début)
    const count = await Message.countDocuments({ chatId });
    if (count <= 2) {
      await Chat.findByIdAndUpdate(chatId, { title: userMessage.substring(0, 30) + "..." });
    }

  } catch (error) {
    console.error("Erreur Streaming :", error);
    res.end(); // On ferme le tuyau proprement en cas d'erreur
  }
});


// --- 7. DÉMARRAGE DU SERVEUR ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Serveur prêt sur le port ${PORT}`));