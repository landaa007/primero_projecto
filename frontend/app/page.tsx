"use client";
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
const API_URL = "https://backend-ai-42189349850.northamerica-northeast1.run.app";
export default function Home() {
  // --- 1. ÉTATS D'AUTHENTIFICATION ---
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false); // Basculer entre Connexion et Inscription

  // --- 2. ÉTATS DU CHAT ---
  const [chats, setChats] = useState<{_id: string, title: string}[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Référence pour scroller automatiquement vers le bas
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- 3. DÉMARRAGE : VÉRIFIER SI DÉJÀ CONNECTÉ ---
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
      loadChats(savedToken);
    }
  }, []);

  // Scroll automatique quand un message arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  // --- 4. FONCTIONS D'AUTHENTIFICATION ---
  const handleAuth = async () => {
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      // On appelle le backend (Port 5000)
      const res = await axios.post(`${API_URL}${endpoint}`, { email, password });
      
      if (isRegister) {
        alert("Compte créé avec succès ! Connecte-toi maintenant.");
        setIsRegister(false); // On bascule sur le formulaire de connexion
      } else {
        const newToken = res.data.token;
        setToken(newToken);
        localStorage.setItem('token', newToken); // On sauvegarde le token dans le navigateur
        loadChats(newToken);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || "Erreur d'authentification");
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setChats([]);
    setCurrentChatId(null);
    setMessages([]);
  };


  // --- 5. FONCTIONS DE GESTION DES CHATS (SIDEBAR) ---
  const loadChats = async (userToken: string) => {
    try {
      const res = await axios.get("${API_URL}/chats", {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      setChats(res.data);
    } catch (err) { console.error("Erreur chargement chats", err); }
  };

  const createNewChat = async () => {
    if (!token) return;
    try {
      const res = await axios.post("${API_URL}/chats", {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChats([res.data, ...chats]); // Ajoute le nouveau chat en haut
      setCurrentChatId(res.data._id); // Ouvre ce chat
      setMessages([]); // Vide la zone de messages
    } catch (err) { console.error(err); }
  };

  const openChat = async (chatId: string) => {
    if (!token) return;
    setCurrentChatId(chatId);
    try {
      const res = await axios.get(`${API_URL}/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(res.data);
    } catch (err) { console.error(err); }
  };


  // --- 6. FONCTION D'ENVOI AVEC STREAMING (LE CŒUR DU SYSTÈME) ---
  const sendMessage = async () => {
    if (!input || !currentChatId || !token) return;

    const userMsg = input;
    setInput(""); // Vide l'input
    setLoading(true);

    // Mise à jour optimiste : On affiche le message User + une bulle vide pour l'IA
    setMessages(prev => [
      ...prev, 
      { role: "user", content: userMsg },
      { role: "assistant", content: "" }
    ]);

    try {
      // ON UTILISE FETCH (et pas Axios) POUR LE STREAMING
      const response = await fetch(`${API_URL}/chats/${currentChatId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMsg })
      });

      if (!response.body) throw new Error("Pas de flux de réponse");

      // Préparation de la lecture du flux
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      // Boucle de lecture infinie
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessage += chunk;

        // Mise à jour temps réel de la dernière bulle (celle de l'IA)
        setMessages(prev => {
          const newHistory = [...prev];
          const lastMsg = newHistory[newHistory.length - 1];
          lastMsg.content = assistantMessage;
          return newHistory;
        });
      }

      // Une fois fini, on recharge la liste des chats (pour mettre à jour le titre)
      loadChats(token);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: "❌ Erreur de connexion" }]);
    }
    setLoading(false);
  };


  // --- 7. RENDU VISUEL (INTERFACE) ---

  // CAS A : PAS CONNECTÉ -> AFFICHER LOGIN
  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white font-sans">
        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-96 border border-gray-700">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold mb-2">🤖 AI Chat</h1>
            <p className="text-gray-400 text-sm">Connecte-toi pour sauvegarder tes chats</p>
          </div>
          
          <input 
            className="w-full p-3 mb-4 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Email" 
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <input 
            className="w-full p-3 mb-6 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Mot de passe" type="password"
            value={password} onChange={e => setPassword(e.target.value)}
          />
          
          <button onClick={handleAuth} className="w-full bg-blue-600 hover:bg-blue-700 p-3 rounded-lg font-bold transition duration-200">
            {isRegister ? "Créer mon compte" : "Se connecter"}
          </button>
          
          <p className="text-center text-sm text-gray-400 mt-4 cursor-pointer hover:text-white" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? "Déjà un compte ? Connexion" : "Pas de compte ? Inscription"}
          </p>
        </div>
      </div>
    );
  }

  // CAS B : CONNECTÉ -> AFFICHER L'APPLI
  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans overflow-hidden">
      
      {/* SIDEBAR (GAUCHE) */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <button onClick={createNewChat} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-bold flex items-center justify-center gap-2 transition">
            + Nouvelle Conversation
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div 
              key={chat._id}
              onClick={() => openChat(chat._id)}
              className={`p-4 cursor-pointer hover:bg-gray-700 border-b border-gray-700 transition ${currentChatId === chat._id ? 'bg-gray-700 border-l-4 border-l-blue-500' : ''}`}
            >
              <h3 className="font-medium truncate">{chat.title}</h3>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-700">
          <button onClick={logout} className="w-full bg-red-600 hover:bg-red-700 p-2 rounded-lg text-sm font-bold transition">
            Déconnexion
          </button>
        </div>
      </div>

      {/* ZONE DE CHAT (DROITE) */}
      <div className="flex-1 flex flex-col bg-gray-900">
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!currentChatId ? (
            <div className="flex h-full flex-col items-center justify-center text-gray-500 opacity-50">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-xl">Sélectionne une conversation pour commencer</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`p-4 rounded-2xl max-w-2xl leading-relaxed shadow-md ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
                  }`}
                >
                  <strong className="text-xs opacity-50 block mb-1 uppercase tracking-wider">
                    {msg.role === 'user' ? 'Vous' : 'IA'}
                  </strong>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))
          )}
          {loading && (
             <div className="flex justify-start">
               <div className="bg-gray-800 p-4 rounded-2xl rounded-bl-none border border-gray-700 flex items-center gap-2 text-gray-400">
                 <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                 <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></span>
                 <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></span>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Barre de saisie */}
        {currentChatId && (
          <div className="p-6 bg-gray-900 border-t border-gray-800">
            <div className="relative flex items-center">
              <input 
                className="w-full p-4 pr-32 rounded-full bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition shadow-lg"
                placeholder="Posez votre question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button 
                onClick={sendMessage}
                disabled={loading}
                className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-full font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Envoyer
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
// Force mise à jour
