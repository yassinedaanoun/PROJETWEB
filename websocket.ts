import { client, updatePlayerScore } from "./database.ts";

// Variables globales pour le jeu
let currentWord: string | null = null;
let correctGuessers: string[] = []; // Ordre des joueurs qui ont deviné
let playerScores: Map<string, number> = new Map(); // Stockage des scores
let currentRound = 1; // Commencer à 1 au lieu de 0
const TOTAL_ROUNDS = 3;

const clients = new Map<WebSocket, string>(); // Map pour associer WebSocket à un utilisateur
let currentDrawer: string | null = null; // Stocke le joueur actuel qui dessine

// Fonction pour envoyer des mots au dessinateur
async function sendWordsToDrawer() {
  if (currentDrawer) {
    const result = await client.queryObject<{ mot: string }>(
      "SELECT mot FROM dictionnaire ORDER BY RANDOM() LIMIT 4;"
    );
    const words = result.rows.map(row => row.mot);

    // Envoyer les mots uniquement au dessinateur
    for (const [client, username] of clients) {
      if (username === currentDrawer && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "words", words }));
      }
    }
  }
}

// Fonction pour choisir un dessinateur aléatoire
function chooseRandomDrawer(isNewRound = false) {
  // Array of all connected clients (usernames)
  const userArray = Array.from(clients.values());
  
  if (userArray.length === 0) {
    console.log("❌ No connected users to choose from.");
    return;
  }
  
  // Incrémenter la manche uniquement lorsque demandé
  if (isNewRound) {
    if (currentRound < TOTAL_ROUNDS) {
      currentRound++;
      console.log(`🔄 Starting round ${currentRound}/${TOTAL_ROUNDS}`);
    } else {
      console.log("Toutes les manches sont terminées");
      // Envoyer un message de fin de partie à tous les clients
      broadcastMessage({
        type: "game_over",
        scores: Object.fromEntries(playerScores)
      });
      return; // Ne pas choisir de nouveau dessinateur
    }
  }
  
  // Get a random index from the array
  const randomIndex = Math.floor(Math.random() * userArray.length);
  
  // Set the new drawer
  currentDrawer = userArray[randomIndex];
  console.log(`🎨 New drawer selected: ${currentDrawer}`);
  
  // Notify all clients about the new drawer and current round
  for (const [socket, username] of clients.entries()) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "drawer",
        username: currentDrawer,
        isNewRound: isNewRound,
        currentRound: currentRound
      }));
    }
  }
}

// Fonction pour diffuser un message à tous les clients
function broadcastMessage(message: any) {
  for (const [client, _] of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

// Gestionnaire principal WebSocket
export function handleWebSocket(ctx: any) {
  const socket = ctx.upgrade();

  socket.onopen = () => {
    console.log("Client connecté");
    
    // Initialiser le score à 0 pour les nouveaux joueurs
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === "login") {
        const username = message.username;
        clients.set(socket, username);
        
        // NOUVEAU: Mettre à jour l'activité WebSocket
        try {
          await client.queryObject(
            "UPDATE user_sessions SET last_activity = NOW() WHERE username = $1 AND is_active = true;",
            [username]
          );
          
          await client.queryObject(
            "INSERT INTO activity_logs (username, action, details) VALUES ($1, $2, $3);",
            [username, "WEBSOCKET_CONNECT", "Connexion WebSocket établie"]
          );
        } catch (activityError) {
          console.error("❌ Erreur lors de la mise à jour d'activité WebSocket:", activityError);
        }
        
        // Initialiser le score si c'est un nouveau joueur
        if (!playerScores.has(username)) {
          playerScores.set(username, 0);
        }
        
        console.log(`👤 ${username} connecté.`);
        
        // Envoyer les scores actuels au joueur
        socket.send(JSON.stringify({
          type: "scores",
          scores: Object.fromEntries(playerScores)
        }));
        
        // Choisir un dessinateur si c'est le premier joueur
        if (clients.size === 1) {
          chooseRandomDrawer();
        }
      } else if (message.type === "chat") {
        const username = clients.get(socket);
        if (username) {
          let isCorrectGuess = false;
          
          // Vérifier si c'est le bon mot
          if (username !== currentDrawer && 
              currentWord && 
              message.message.trim().toLowerCase() === currentWord.toLowerCase()) {
            
            isCorrectGuess = true;
            
            if (!correctGuessers.includes(username)) {
              correctGuessers.push(username);
              
              // Attribution des points
              let pointsAwarded = 0;
              switch (correctGuessers.length) {
                case 1: pointsAwarded = 600; break;
                case 2: pointsAwarded = 450; break;
                case 3: pointsAwarded = 300; break;
                default: pointsAwarded = 100;
              }
              
              // Mise à jour des scores
              const currentScore = playerScores.get(username) || 0;
              playerScores.set(username, currentScore + pointsAwarded);
              await updatePlayerScore(username, pointsAwarded);
              
              broadcastMessage({
                type: "scores",
                scores: Object.fromEntries(playerScores)
              });
            }
            
            // Envoyer un message différent à chaque client pour une bonne réponse
            for (const [clientSocket, clientName] of clients) {
              if (clientSocket.readyState === WebSocket.OPEN) {
                const chatMessage = { 
                  type: "chat", 
                  username, 
                  // Afficher le vrai message uniquement à l'expéditeur
                  message: clientName === username ? message.message : "a deviné",
                  isCorrectGuess 
                };
                
                clientSocket.send(JSON.stringify(chatMessage));
              }
            }
          } else {
            // Message normal - diffuser à tous
            broadcastMessage({
              type: "chat",
              username,
              message: message.message,
              isCorrectGuess
            });
          }
        }
      } else if (message.type === "word_selected") {
        // Enregistrer le mot sélectionné
        currentWord = message.word;
        console.log(`Mot sélectionné : ${currentWord}`);
        
        const username = clients.get(socket);
        if (username === currentDrawer) {
          // Envoyer un message avec le type word_selected à tous les clients
          broadcastMessage({ 
            type: "word_selected"
          });
          
          // Réinitialiser la liste des joueurs qui ont deviné correctement
          correctGuessers = [];
          
          // Démarrer un timer côté serveur
          setTimeout(() => {
            if (currentWord) {  // Vérifier que le mot existe toujours
              broadcastMessage({
                type: "time_up",
                word: currentWord,
                correctGuessers: correctGuessers,
                scores: Object.fromEntries(playerScores) 
              });
              
              // Réinitialiser le mot actuel
              currentWord = null;
              
              
            }
          }, 90000); // 90 secondes
        }
      } else if (message.type === "time_up") {
        broadcastMessage({
          type: "time_up",
          word: currentWord,
          correctGuessers: correctGuessers,
          scores: Object.fromEntries(playerScores)
        });
        
        // Réinitialiser pour le prochain tour
        currentWord = null;
        correctGuessers = [];
      } else if (message.type === "draw" || message.type === "clear") {
        const username = clients.get(socket);
        if (username === currentDrawer) {
          for (const [client, _] of clients) {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
            }
          }
        }
      } else if (message.type === "new_game") {
        // Réinitialiser le compteur de manche au début d'une nouvelle partie
        currentRound = 1;
        
        // Réinitialiser les scores si nécessaire
        playerScores.clear();
        
        // Choisir un premier dessinateur
        chooseRandomDrawer(false);
      } else if (message.type === "end_game") {
        const username = clients.get(socket);
        if (username) {
          console.log(`${username} a quitté la partie.`);
          clients.delete(socket); // Supprimer le joueur de la liste des clients
        }
      } else if (message.type === "next_round") {
        // Choisir un nouveau dessinateur pour la prochaine manche
        chooseRandomDrawer(true);
      } else if (message.type === "game_over") {
        // Réinitialiser le compteur de manches
        currentRound = 0;

        // Sauvegarder les scores finaux si nécessaire
        console.log("Game over. Scores:", Object.fromEntries(playerScores));
      }
    };
  };

  socket.onclose = () => {
    const username = clients.get(socket);
    clients.delete(socket);
    console.log(`❌ ${username} s'est déconnecté.`);
    
    // NOUVEAU: Enregistrer la déconnexion WebSocket
    if (username) {
      try {
        client.queryObject(
          "INSERT INTO activity_logs (username, action, details) VALUES ($1, $2, $3);",
          [username, "WEBSOCKET_DISCONNECT", "Déconnexion WebSocket"]
        );
      } catch (logError) {
        console.error("❌ Erreur lors de l'enregistrement de déconnexion:", logError);
      }
    }
    
    if (username === currentDrawer) {
      chooseRandomDrawer(); // Choisir un nouveau dessinateur si le dessinateur actuel se déconnecte
    }
  };
}