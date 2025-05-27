let socket;
let isDrawer = false; // Indique si l'utilisateur est le dessinateur

// Ajouter ces variables au début de votre script.js
let timerInterval;
let remainingTime = 30;

// Ajouter une variable globale pour les scores
const playerScores = new Map();

// Ajouter au début du fichier avec les autres variables globales
let hasGuessedCorrectly = false;

// Ajouter ces variables globales en haut du fichier
let currentRound = 1; 
const TOTAL_ROUNDS = 1;
const RESULTS_DISPLAY_TIME = 15000; // 12 secondes pour l'affichage des résultats

function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    console.log("🔍 Tentative de connexion avec :", { username, password });

    fetch("http://localhost:3000/login", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(response => {
        console.log("📥 Réponse brute du serveur :", response);
        return response.json();
    })
    .then(data => {
        console.log("📦 Données reçues :", data);

        if (data.message === "Login successful") {
            console.log("✅ Connexion réussie :", data);

            localStorage.setItem("username", data.username);
            localStorage.setItem("role", data.role);
            localStorage.setItem("token", data.token); // Stocker le token
            
            if (data.role === "admin") {
                showAdminInterface();
                fetchAdminData();
            } else {
                showChat();
                initializeWebSocket();
            }
        } else {
            console.log("❌ Échec de la connexion :", data.message);
            alert(data.message);
        }
    })
    .catch(error => {
        console.error("❌ Erreur lors de la connexion :", error);
        alert('An error occurred');
    });
}

function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-password').value;

    const registerData = {
        username: username,
        password: password
    };

    fetch("http://localhost:3000/register", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(registerData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === "User registered successfully") {
            alert(data.message);
            showLoginForm(); // Retourner au formulaire de connexion
        } else {
            alert(data.message); // Afficher un message d'erreur
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        alert('An error occurred. Please try again.');
    });
}

function initializeWebSocket() {
    socket = new WebSocket("ws://localhost:3000/ws");

    socket.onopen = () => {
        const username = localStorage.getItem("username");
        socket.send(JSON.stringify({ type: "login", username }));
        console.log("WebSocket connecté.");
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Message reçu:", data);

        if (data.type === "drawer") {
            console.log("Message drawer reçu:", data);
            
            // Réinitialiser l'interface pour tout le monde
            resetGameInterface();
            
            // Utiliser la manche envoyée par le serveur
            if (data.currentRound) {
                currentRound = data.currentRound;
            }
            
            // Définir si l'utilisateur courant est le dessinateur
            isDrawer = data.username === localStorage.getItem("username");
            console.log("Est dessinateur:", isDrawer);
            
            // Mettre à jour l'interface en fonction du rôle
            const drawerIndicator = document.getElementById("drawer-indicator");
            if (isDrawer) {
                drawerIndicator.textContent = "Dessinateur actuel : Vous";
                displayMessage(`Système: Vous êtes le dessinateur. Choisissez un mot.`, true);
                
                // Demander des mots seulement si on est le dessinateur
                fetchRandomWords();
            } else {
                drawerIndicator.textContent = `Dessinateur actuel : ${data.username}`;
                displayMessage(`Système: ${data.username} est le dessinateur.`, true);
            }
        } else if (data.type === "scores") {
            // Mettre à jour les scores localement
            Object.entries(data.scores).forEach(([player, score]) => {
                playerScores.set(player, score);
            });
            
        } else if (data.type === "word_selected") {
            // Réinitialiser le statut de devinette au début d'une nouvelle manche
            hasGuessedCorrectly = false;
            
            // Démarrer le minuteur pour tous les joueurs
            startTimer();
            displayMessage("Système: Le dessinateur a choisi un mot. Vous avez 90 secondes pour deviner!", true);
        } else if (data.type === "time_up") {
            clearInterval(timerInterval);
            document.getElementById("timer-container").style.display = "none";
            
            if (data.word) {
                displayMessage(`Système: Le temps est écoulé! Le mot était: ${data.word}`, true);
                showResultsPopup(data.word, data.correctGuessers);
            }
            
            // Réinitialiser les variables pour la prochaine manche
            isDrawing = false;
        } else if (data.type === "chat") {
            if (data.isCorrectGuess) {
                // Si c'est mon propre message et que j'ai deviné correctement, marquer comme deviné
                if (data.username === localStorage.getItem("username")) {
                    hasGuessedCorrectly = true;
                }
                displayMessage(`${data.username}: ${data.message}`, false, true);
            } else {
                displayMessage(`${data.username}: ${data.message}`);
            }
        } else if (data.type === "draw") {
            // Traitement des événements de dessin existant
            drawLine(data.x1, data.y1, data.x2, data.y2, data.color, false);
        } else if (data.type === "clear") {
            // Traitement des événements de nettoyage existant
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else if (data.type === "game_over") {
            // Afficher l'écran de fin de jeu
            finishGame(data.scores);
        }
    };

    socket.onerror = (error) => {
        console.error("WebSocket erreur :", error);
    };

    socket.onclose = () => {
        console.log("WebSocket fermé.");
    };
}

// Modifier la fonction sendMessage
function sendMessage(event) {
    event.preventDefault();

    const messageInput = document.getElementById("message");
    const message = messageInput.value.trim();

    // Vérifier si l'utilisateur est le dessinateur
    if (isDrawer) {
        displayMessage("Système: En tant que dessinateur, vous ne pouvez pas envoyer de messages dans le chat.", true);
        messageInput.value = "";
        return;
    }
    
    // Vérifier si l'utilisateur a déjà deviné le mot
    if (hasGuessedCorrectly) {
        displayMessage("Système: Vous avez déjà trouvé le mot! Attendez le prochain tour.", true);
        messageInput.value = "";
        return;
    }

    if (message && socket.readyState === WebSocket.OPEN) {
        const username = localStorage.getItem("username");
        const chatMessage = { type: "chat", username, message };
        socket.send(JSON.stringify(chatMessage));
        messageInput.value = "";
    }
}

function displayMessage(message, isSystem = false, isCorrectGuess = false) {
    const chatBox = document.getElementById("chat-box");
    const messageDiv = document.createElement("div");
    messageDiv.textContent = message;
    
    // Appliquer des styles selon le type de message
    if (isSystem) {
        messageDiv.style.color = "#777";
        messageDiv.style.fontStyle = "italic";
    } else if (isCorrectGuess) {
        messageDiv.style.color = "green";
        messageDiv.style.fontWeight = "bold";
    }
    
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight; // Défiler jusqu'au dernier message
}

function showRegisterForm() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('register-container').style.display = 'block';
}

function showLoginForm() {
    document.getElementById('login-container').style.display = 'block';
    document.getElementById('register-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('admin-container').style.display = 'none';

    // Supprimer la classe admin-page du body
    document.body.classList.remove('admin-page');
}

function showChat() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('register-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'block';
}

// Tableau blanc (whiteboard) logic
let isDrawing = false;
let x = 0;
let y = 0;
const canvas = document.getElementById("whiteboard");
const ctx = canvas.getContext("2d");

// Variable pour stocker la couleur actuelle
let currentColor = "#000000";

// Mettre à jour la couleur lorsque l'utilisateur en choisit une
document.getElementById("pen-color").addEventListener("input", (event) => {
    currentColor = event.target.value; // Met à jour la couleur actuelle
});

// Désactiver les fonctionnalités pour les spectateurs
canvas.addEventListener("mousedown", (event) => {
    // Vérifier strictement si l'utilisateur est le dessinateur
    if (!isDrawer) return;
    
    isDrawing = true;
    [x, y] = [event.offsetX, event.offsetY];
});

canvas.addEventListener("mousemove", (event) => {
    // Vérifier strictement si l'utilisateur est en train de dessiner et est le dessinateur
    if (!isDrawing || !isDrawer) return;
    
    drawLine(x, y, event.offsetX, event.offsetY, currentColor, true);
    [x, y] = [event.offsetX, event.offsetY];
});

canvas.addEventListener("mouseup", () => {
    isDrawing = false;
});

canvas.addEventListener("mouseout", () => {
    isDrawing = false;
});

function drawLine(x1, y1, x2, y2, color = currentColor, emit = false) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; // Utilise la couleur actuelle
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();

    // Émettre les coordonnées via WebSocket
    if (emit && socket.readyState === WebSocket.OPEN) {
        const data = { type: "draw", x1, y1, x2, y2, color };
        socket.send(JSON.stringify(data));
    }
}

document.getElementById("clear-whiteboard").addEventListener("click", () => {
    if (!isDrawer) return;
    clearWhiteboard();
});

// Ajouter cette fonction pour effacer le tableau
function clearWhiteboard() {
    // Seul le dessinateur peut effacer le tableau
    if (!isDrawer) {
        displayMessage("Système: Seul le dessinateur peut effacer le tableau.", true);
        return;
    }
    
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Informer les autres utilisateurs
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "clear" }));
        }
    }
}

function fetchRandomWords() {
    // Vérifier strictement si l'utilisateur est le dessinateur actuel
    if (!isDrawer) {
        console.log("Tentative d'accès aux mots sans être dessinateur");
        return;
    }
    
    fetch("http://localhost:3000/get-random-words")
        .then(response => response.json())
        .then(words => {
            const wordsContainer = document.getElementById("words-container");
            wordsContainer.innerHTML = ""; // Réinitialise le conteneur

            words.forEach(word => {
                const wordBox = document.createElement("div");
                wordBox.textContent = word.mot;
                wordBox.style.border = "1px solid #ddd";
                wordBox.style.padding = "10px";
                wordBox.style.cursor = "pointer";
                wordBox.style.borderRadius = "4px";
                wordBox.style.backgroundColor = "#f4f4f9";
                wordBox.style.textAlign = "center";

                // Ajoute un événement de clic pour sélectionner le mot
                wordBox.addEventListener("click", () => {
                    selectWord(word.mot);
                });

                wordsContainer.appendChild(wordBox);
            });

            document.getElementById("word-selection").style.display = "block";
        })
        
}

// Ajouter cette fonction pour gérer le minuteur
function startTimer() {
    // Réinitialiser le timer
    remainingTime = 90;
    clearInterval(timerInterval);
    
    // Afficher le conteneur du timer
    const timerContainer = document.getElementById("timer-container");
    const timerDisplay = document.getElementById("timer-display");
    timerContainer.style.display = "block";
    timerDisplay.textContent = remainingTime;
    
    // Démarrer le compte à rebours
    timerInterval = setInterval(() => {
        remainingTime--;
        timerDisplay.textContent = remainingTime;
        
        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            displayMessage("Système: Le temps est écoulé!", true);
            
            // Si c'est le dessinateur, informer le serveur
            if (isDrawer) {
                socket.send(JSON.stringify({ type: "time_up" }));
            }
        }
    }, 1000);
}

// Modifier la fonction selectWord pour démarrer le minuteur
function selectWord(selectedWord) {
    if (!isDrawer) return;
    
    const chatMessage = { type: "word_selected", word: selectedWord };
    socket.send(JSON.stringify(chatMessage));
    console.log(`Mot sélectionné : ${selectedWord}`);
    
    // Cacher la sélection de mots
    document.getElementById("word-selection").style.display = "none";
    
    // Afficher le mot choisi
    const chosenWordElement = document.getElementById("chosen-word");
    const chosenWordText = document.getElementById("chosen-word-text");
    
    if (chosenWordElement && chosenWordText) {
        chosenWordText.textContent = selectedWord;
        chosenWordElement.style.display = "block";
    }
    
    // Démarrer le minuteur
    startTimer();
    
    // Informer le joueur
    displayMessage("Système: Vous avez choisi un mot et pouvez commencer à dessiner. Vous avez 90 secondes.", true);
}

// Corriger la fonction showResultsPopup
function showResultsPopup(word, correctGuessers) {
    // Fermer automatiquement et afficher directement les scores finaux
    setTimeout(() => {
        showFinalScores(word, correctGuessers);
    }, 3000); // 3 secondes pour voir le mot révélé
    
    const popup = document.getElementById('results-popup');
    const wordSpan = document.getElementById('revealed-word');
    const guessersList = document.getElementById('correct-guessers-list');
    
    // Cacher les boutons de contrôle manuel
    const buttonContainer = document.querySelector('#results-popup .results-actions');
    buttonContainer.style.display = 'none';
    
    wordSpan.textContent = word;
    guessersList.innerHTML = '';
    
    if (correctGuessers && correctGuessers.length > 0) {
        correctGuessers.forEach(player => {
            const listItem = document.createElement('li');
            listItem.textContent = player;
            guessersList.appendChild(listItem);
        });
    } else {
        const listItem = document.createElement('li');
        listItem.textContent = "Personne n'a deviné le mot";
        guessersList.appendChild(listItem);
    }
    
    popup.style.display = 'flex';
}

// Modifier la fonction closeResultsPopup pour nettoyer le contenu dynamique
function closeResultsPopup() {
    const popup = document.getElementById('results-popup');
    popup.style.display = 'none';
    
    // Nettoyer l'indication de la manche
    if (popup.querySelector('h3')) {
        popup.querySelector('.popup-content').removeChild(popup.querySelector('h3'));
    }
    
    // Réafficher les boutons pour les utiliser ultérieurement si nécessaire
    const buttonContainer = document.querySelector('#results-popup .popup-content div');
    buttonContainer.style.display = 'flex';
    
    clearWhiteboard();
}
function showFinalScores(word, correctGuessers) {
    // Fermer le popup de résultat
    document.getElementById('results-popup').style.display = 'none';
    
    // Créer le popup de scores final
    const scoresPopup = document.createElement('div');
    scoresPopup.className = 'results-modal';
    scoresPopup.style.display = 'flex';
    
    const popupContent = document.createElement('div');
    popupContent.className = 'results-content';
    popupContent.style.minWidth = '500px';
    
    const title = document.createElement('h2');
    title.className = 'results-title';
    title.textContent = 'Scores de la partie';
    title.style.marginBottom = '30px';
    
    const scoresList = document.createElement('div');
    scoresList.style.margin = '20px 0';
    scoresList.style.fontSize = '20px';
    
    // Convertir et trier les scores actuels
    const sortedScores = Array.from(playerScores.entries())
        .sort((a, b) => b[1] - a[1]);
    
    if (sortedScores.length > 0) {
        sortedScores.forEach(([player, score], index) => {
            const scoreItem = document.createElement("div");
            scoreItem.style.padding = '15px';
            scoreItem.style.margin = '10px 0';
            scoreItem.style.background = 'rgba(99, 102, 241, 0.15)';
            scoreItem.style.borderRadius = '12px';
            scoreItem.style.border = '2px solid rgba(99, 102, 241, 0.3)';
            scoreItem.style.fontSize = '18px';
            
            // Ajouter une icône pour le podium
            let icon = '';
            if (index === 0) icon = '🥇';
            else if (index === 1) icon = '🥈';
            else if (index === 2) icon = '🥉';
            else icon = `${index + 1}.`;
            
            scoreItem.textContent = `${icon} ${player}: ${score} points`;
            
            if (player === localStorage.getItem("username")) {
                scoreItem.style.fontWeight = "bold";
                scoreItem.style.background = 'rgba(245, 158, 11, 0.2)';
                scoreItem.style.border = '3px solid #f59e0b';
                scoreItem.style.transform = 'scale(1.05)';
            }
            
            scoresList.appendChild(scoreItem);
        });
    } else {
        const noScores = document.createElement('div');
        noScores.textContent = 'Aucun score enregistré';
        noScores.style.padding = '20px';
        noScores.style.color = '#888';
        scoresList.appendChild(noScores);
    }
    
    const returnButton = document.createElement('button');
    returnButton.className = 'neon-button primary';
    returnButton.style.marginTop = '30px';
    returnButton.style.fontSize = '18px';
    returnButton.style.padding = '15px 30px';
    returnButton.innerHTML = '<span class="button-text">Retour à l\'accueil</span><div class="button-glow"></div>';
    
    returnButton.addEventListener('click', () => {
        document.body.removeChild(scoresPopup);
        
        // Nettoyer les données
        playerScores.clear();
        
        // Retourner à l'écran de connexion
        document.getElementById("chat-container").style.display = "none";
        document.getElementById("login-container").style.display = "block";
    });
    
    // Assembler le popup
    popupContent.appendChild(title);
    popupContent.appendChild(scoresList);
    popupContent.appendChild(returnButton);
    scoresPopup.appendChild(popupContent);
    
    document.body.appendChild(scoresPopup);
}
// Ajouter cette fonction pour terminer le jeu complet
function finishGame(scores) {
    // Réinitialiser pour préparer une nouvelle partie
    currentRound = 1;
    
    // Créer un popup de fin de jeu stylé
    const gameOverPopup = document.createElement('div');
    gameOverPopup.className = 'results-modal';
    gameOverPopup.style.display = 'flex';
    
    const popupContent = document.createElement('div');
    popupContent.className = 'results-content';
    
    const title = document.createElement('h2');
    title.className = 'results-title';
    title.textContent = 'Partie terminée!';
    
    const message = document.createElement('p');
    message.textContent = 'Merci d\'avoir joué. Voici les scores finaux:';
    message.style.marginBottom = '20px';
    
    const scoresList = document.createElement('div');
    scoresList.style.margin = '20px 0';
    scoresList.style.fontSize = '18px';
    
    // Convertir et trier les scores
    const scoresArray = Object.entries(scores || {});
    const sortedScores = scoresArray.sort((a, b) => b[1] - a[1]);
    
    sortedScores.forEach(([player, score], index) => {
        const scoreItem = document.createElement("div");
        scoreItem.style.padding = '10px';
        scoreItem.style.margin = '5px 0';
        scoreItem.style.background = 'rgba(99, 102, 241, 0.1)';
        scoreItem.style.borderRadius = '8px';
        scoreItem.style.border = '1px solid rgba(99, 102, 241, 0.3)';
        
        // Ajouter une icône pour le podium
        let icon = '';
        if (index === 0) icon = '🥇';
        else if (index === 1) icon = '🥈';
        else if (index === 2) icon = '🥉';
        else icon = `${index + 1}.`;
        
        scoreItem.textContent = `${icon} ${player}: ${score} points`;
        
        if (player === localStorage.getItem("username")) {
            scoreItem.style.fontWeight = "bold";
            scoreItem.style.background = 'rgba(245, 158, 11, 0.2)';
            scoreItem.style.border = '2px solid #f59e0b';
        }
        
        scoresList.appendChild(scoreItem);
    });
    
    const returnButton = document.createElement('button');
    returnButton.className = 'neon-button primary';
    returnButton.style.marginTop = '20px';
    returnButton.innerHTML = '<span class="button-text">Retour à l\'accueil</span><div class="button-glow"></div>';
    
    returnButton.addEventListener('click', () => {
        document.body.removeChild(gameOverPopup);
        
        // Nettoyer les données
        playerScores.clear();
        
        // Retourner à l'écran de connexion
        document.getElementById("chat-container").style.display = "none";
        document.getElementById("login-container").style.display = "block";
    });
    
    // Assembler le popup
    popupContent.appendChild(title);
    popupContent.appendChild(message);
    popupContent.appendChild(scoresList);
    popupContent.appendChild(returnButton);
    gameOverPopup.appendChild(popupContent);
    
    document.body.appendChild(gameOverPopup);
}


// Fonction pour démarrer une nouvelle partie
function startNewGame() {
    // Fermer le popup des résultats
    closeResultsPopup();

    // Informer le serveur de démarrer une nouvelle partie
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "new_game" }));
    }

    displayMessage("Système: Une nouvelle partie commence!", true);
}

// Fonction pour terminer le jeu et se déconnecter
function endGame() {
    // Fermer le popup des résultats
    closeResultsPopup();

    // Informer le serveur que le joueur quitte
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "end_game" }));
    }

    // Réinitialiser l'interface et revenir à l'écran de connexion
    localStorage.removeItem("username");
    document.getElementById("chat-container").style.display = "none";
    document.getElementById("login-container").style.display = "block";
    displayMessage("Système: Vous avez quitté la partie.", true);
}


// Fonction pour réinitialiser correctement l'interface entre les manches
function resetGameInterface() {
    // Effacer le tableau
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Réinitialiser le statut de dessinateur
    isDrawer = false;
    
    // Cacher les éléments spécifiques au dessinateur
    document.getElementById("word-selection").style.display = "none";
    if (document.getElementById("chosen-word")) {
        document.getElementById("chosen-word").style.display = "none";
    }
    document.getElementById("timer-container").style.display = "none";
}

// Assurez-vous d'ajouter un gestionnaire d'événement pour le bouton clear-whiteboard
document.addEventListener('DOMContentLoaded', () => {
    const clearButton = document.getElementById('clear-whiteboard');
    if (clearButton) {
        clearButton.addEventListener('click', clearWhiteboard);
    }
    
    const closeButton = document.getElementById('close-results');
    if (closeButton) {
        closeButton.addEventListener('click', closeResultsPopup);
    }
    
    const showHighscoresBtn = document.getElementById('show-highscores');
    if (showHighscoresBtn) {
        showHighscoresBtn.addEventListener('click', fetchHighscores);
    }

    const newGameButton = document.getElementById('new-game');
    const endGameButton = document.getElementById('end-game');

    if (newGameButton) {
        newGameButton.addEventListener('click', startNewGame);
    }

    if (endGameButton) {
        endGameButton.addEventListener('click', endGame);
    }
});

function fetchHighscores() {
    fetch("http://localhost:3000/highscores")
        .then(response => response.json())
        .then(data => {
            const highscoresList = document.getElementById("highscores-list");
            highscoresList.innerHTML = "<h3>Meilleurs scores</h3>";
            
            if (data.highscores && data.highscores.length > 0) {
                data.highscores.forEach((item, index) => {
                    const scoreItem = document.createElement("div");
                    scoreItem.textContent = `${index + 1}. ${item.username}: ${item.max_score} points`;
                    
                    if (item.username === localStorage.getItem("username")) {
                        scoreItem.style.fontWeight = "bold";
                        scoreItem.style.color = "#2c3e50";
                    }
                    
                    highscoresList.appendChild(scoreItem);
                });
            } else {
                highscoresList.innerHTML += "<div>Aucun score enregistré</div>";
            }
            
            highscoresList.style.display = "block";
        })
       
}

function showAdminInterface() {
    const role = localStorage.getItem("role");
    if (role !== "admin") {
        alert("Accès réservé aux administrateurs");
        return;
    }

    // Masquer les autres interfaces
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('register-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'none';

    // Afficher l'interface admin
    document.getElementById('admin-container').style.display = 'block';
    document.getElementById("admin-title").style.display = "block"; // Affiche le titre "Page Admin"

    // Ajouter la classe admin-page au body
    document.body.classList.add('admin-page');

    // Charger les données
    fetchAdminData();
}

function fetchAdminData() {
    const token = localStorage.getItem("token");
    
    fetch("http://localhost:3000/admin/users", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log("✅ Données admin récupérées :", data);
        
    })
    
}

function fetchAdminStats() {
    const token = localStorage.getItem("token");
    
    fetch("http://localhost:3000/admin/stats", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log("Données reçues:", data); // Debug
        const statsDisplay = document.getElementById("stats-display");
        statsDisplay.innerHTML = `
            <p>Nombre d'utilisateurs : ${data.users || 0}</p>
            <p>Nombre de parties : ${data.games || 0}</p>
            <p>Nombre de mots : ${data.words || 0}</p>
        `;
    })
    
}

// Lister les utilisateurs
// Lister les utilisateurs (version modifiée)
function fetchAdminUsers() {
    const token = localStorage.getItem("token");
    
    fetch("http://localhost:3000/admin/users", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 403) {
                throw new Error("Accès refusé - Admin uniquement");
            }
            throw new Error(`Erreur HTTP : ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("Utilisateurs:", data);
        const usersList = document.getElementById("admin-users-list");
        usersList.innerHTML = "";
        
        data.users.forEach(user => {
            const userItem = document.createElement("div");
            userItem.style.padding = "10px";
            userItem.style.border = "1px solid #333";
            userItem.style.margin = "5px 0";
            userItem.style.borderRadius = "5px";
            userItem.style.display = "flex";
            userItem.style.justifyContent = "space-between";
            userItem.style.alignItems = "center";
            
            const userInfo = document.createElement("span");
            userInfo.textContent = `${user.username} (${user.role})`;
            
            const buttonContainer = document.createElement("div");
            
            const deleteButton = document.createElement("button");
            deleteButton.textContent = "Supprimer";
            deleteButton.style.marginRight = "5px";
            deleteButton.onclick = () => deleteUser(user.username);
            
            const banButton = document.createElement("button");
            banButton.textContent = "Bannir";
            banButton.style.background = "#dc3545";
            banButton.style.color = "white";
            banButton.style.border = "none";
            banButton.style.padding = "5px 10px";
            banButton.style.borderRadius = "3px";
            banButton.style.cursor = "pointer";
            banButton.onclick = () => {
                document.getElementById("ban-username").value = user.username;
                alert("Nom d'utilisateur pré-rempli dans la section bannissement");
            };
            
            buttonContainer.appendChild(deleteButton);
            if (user.role !== "admin") { // Ne pas permettre de bannir un admin
                buttonContainer.appendChild(banButton);
            }
            
            userItem.appendChild(userInfo);
            userItem.appendChild(buttonContainer);
            usersList.appendChild(userItem);
        });
    })
    .catch(error => {
        console.error("Erreur:", error);
        alert("Erreur lors de la récupération des utilisateurs");
    });
}

// Supprimer un utilisateur
function deleteUser(username) {
    const token = localStorage.getItem("token");
    
    fetch(`http://localhost:3000/admin/users/${username}`, {
        method: "DELETE",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        alert(data.message);
        fetchAdminUsers(); // Rafraîchir la liste
    })
    
}

// Lister les scores
function fetchAdminScores() {
    const token = localStorage.getItem("token");
    
    fetch("http://localhost:3000/admin/scores", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log("Scores reçus:", data); // Debug
        const scoresList = document.getElementById("admin-scores-list");
        scoresList.innerHTML = "";
        
        if (data.scores && data.scores.length > 0) {
            data.scores.forEach(score => {
                const scoreItem = document.createElement("div");
                scoreItem.style.padding = "10px";
                scoreItem.style.border = "1px solid #ddd";
                scoreItem.style.margin = "5px 0";
                scoreItem.style.borderRadius = "5px";
                
                scoreItem.innerHTML = `
                    <strong>${score.username}</strong><br>
                    Score actuel: ${score.current_score}<br>
                    Score maximum: ${score.max_score}<br>
                    Parties jouées: ${score.games_played}
                    <button onclick="resetUserScores('${score.username}')" style="margin-left: 10px;">Réinitialiser</button>
                `;
                
                scoresList.appendChild(scoreItem);
            });
        } else {
            scoresList.innerHTML = "<div>Aucun score enregistré.</div>";
        }
    })
    
}

// Réinitialiser les scores d'un utilisateur
function resetUserScores(username) {
    const token = localStorage.getItem("token");
    
    if (!confirm(`Êtes-vous sûr de vouloir réinitialiser les scores de ${username} ?`)) {
        return;
    }
    
    fetch(`http://localhost:3000/admin/scores/${username}/reset`, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        alert(data.message);
        fetchAdminScores(); // Rafraîchir la liste des scores
    })
   
}

// Lister les mots du dictionnaire
function fetchAdminDictionnaire() {
    const token = localStorage.getItem("token");
    
    fetch("http://localhost:3000/admin/dictionnaire", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        const dictionnaireList = document.getElementById("admin-dictionnaire-list");
        dictionnaireList.innerHTML = "";
        
        if (data.mots && data.mots.length > 0) {
            data.mots.forEach(mot => {
                const motItem = document.createElement("div");
                motItem.style.padding = "5px";
                motItem.style.border = "1px solid #ddd";
                motItem.style.margin = "2px 0";
                motItem.style.display = "flex";
                motItem.style.justifyContent = "space-between";
                motItem.style.alignItems = "center";
                
                motItem.innerHTML = `
                    <span>${mot.mot}</span>
                    <button onclick="deleteWordFromDictionnaire('${mot.mot}')">Supprimer</button>
                `;
                
                dictionnaireList.appendChild(motItem);
            });
        } else {
            dictionnaireList.innerHTML = "<div>Aucun mot dans le dictionnaire.</div>";
        }
    })
   
}

// Ajouter un mot au dictionnaire
function addWordToDictionnaire() {
    const newWord = document.getElementById("new-word").value.trim();
    if (!newWord) {
        alert("Veuillez entrer un mot à ajouter.");
        return;
    }

    const token = localStorage.getItem("token");

    fetch("http://localhost:3000/admin/dictionnaire", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ mot: newWord }),
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        alert(data.message);
        document.getElementById("new-word").value = ""; // Vider le champ
        fetchAdminDictionnaire(); // Rafraîchir la liste
    })
   
}

// Supprimer un mot du dictionnaire
function deleteWordFromDictionnaire(word) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le mot "${word}" ?`)) {
        return;
    }

    const token = localStorage.getItem("token");

    fetch(`http://localhost:3000/admin/dictionnaire/${encodeURIComponent(word)}`, {
        method: "DELETE",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        alert(data.message);
        fetchAdminDictionnaire(); // Rafraîchir la liste
    })
    
}
// Fonction pour récupérer la liste des utilisateurs bannis
function fetchBannedUsers() {
    const token = localStorage.getItem("token");
    
    fetch("http://localhost:3000/admin/banned-users", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log("Utilisateurs bannis:", data);
        const bannedUsersList = document.getElementById("banned-users-list");
        bannedUsersList.innerHTML = "";
        
        if (data.bannedUsers && data.bannedUsers.length > 0) {
            data.bannedUsers.forEach(bannedUser => {
                const userItem = document.createElement("div");
                userItem.style.padding = "10px";
                userItem.style.border = "1px solid #666";
                userItem.style.margin = "5px 0";
                userItem.style.borderRadius = "5px";
                userItem.style.backgroundColor = "#1a1a1a";
                
                const banDate = new Date(bannedUser.banned_at).toLocaleString();
                
                userItem.innerHTML = `
                    <strong style="color: #ff6b6b;">${bannedUser.username}</strong><br>
                    <small>Banni le: ${banDate}</small><br>
                    <small>Par: ${bannedUser.banned_by}</small><br>
                    <small>Raison: ${bannedUser.reason}</small><br>
                    <button onclick="unbanUser('${bannedUser.username}')" 
                            style="margin-top: 5px; background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                        Débannir
                    </button>
                `;
                
                bannedUsersList.appendChild(userItem);
            });
        } else {
            bannedUsersList.innerHTML = "<div>Aucun utilisateur banni.</div>";
        }
    })
    .catch(error => {
        console.error("Erreur:", error);
        alert("Erreur lors de la récupération des utilisateurs bannis");
    });
}

// Fonction pour bannir un utilisateur
function banUser() {
    const username = document.getElementById("ban-username").value.trim();
    const reason = document.getElementById("ban-reason").value.trim();
    
    if (!username) {
        alert("Veuillez entrer un nom d'utilisateur à bannir.");
        return;
    }
    
    if (!confirm(`Êtes-vous sûr de vouloir bannir l'utilisateur "${username}" ?`)) {
        return;
    }

    const token = localStorage.getItem("token");

    fetch("http://localhost:3000/admin/ban-user", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ username, reason }),
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        alert(data.message);
        document.getElementById("ban-username").value = "";
        document.getElementById("ban-reason").value = "";
        fetchBannedUsers(); // Rafraîchir la liste
        fetchAdminUsers(); // Rafraîchir la liste des utilisateurs
    })
    .catch(error => {
        console.error("Erreur:", error);
        alert("Erreur lors du bannissement");
    });
}

// Fonction pour débannir un utilisateur
function unbanUser(username) {
    if (!confirm(`Êtes-vous sûr de vouloir débannir l'utilisateur "${username}" ?`)) {
        return;
    }

    const token = localStorage.getItem("token");

    fetch(`http://localhost:3000/admin/unban-user/${encodeURIComponent(username)}`, {
        method: "DELETE",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        alert(data.message);
        fetchBannedUsers(); // Rafraîchir la liste des utilisateurs bannis
        fetchAdminUsers(); // Rafraîchir la liste des utilisateurs
    })
    .catch(error => {
        console.error("Erreur:", error);
        alert("Erreur lors du débannissement");
    });
}

// Ajouter une fonction pour rechercher un mot dans le dictionnaire
function searchWordInDictionnaire() {
    const searchWord = document.getElementById("search-word").value.trim();
    if (!searchWord) {
        alert("Veuillez entrer un mot à rechercher.");
        return;
    }

    const token = localStorage.getItem("token");

    fetch(`http://localhost:3000/admin/dictionnaire/search/${encodeURIComponent(searchWord)}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    })
    .then(response => {
        if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
        return response.json();
    })
    .then(data => {
        const searchResult = document.getElementById("search-result");
        searchResult.textContent = data.message;
        searchResult.style.color = data.exists ? "green" : "red";
        searchResult.style.fontWeight = "bold";
        searchResult.style.padding = "10px";
    })
   
}

// Version simplifiée - juste voir qui est connecté
function fetchActiveSessions() {
    const token = localStorage.getItem("token");
    
    if (!token) {
        alert("Token manquant - reconnectez-vous");
        return;
    }
    
    fetch("http://localhost:3000/admin/active-sessions", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
    })
    .then(response => {
        console.log("Response status:", response.status);
        if (!response.ok) {
            if (response.status === 403) {
                throw new Error("Accès refusé - Token invalide ou expiré");
            }
            throw new Error(`Erreur HTTP : ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("Sessions reçues:", data);
        const display = document.getElementById("realtime-display");
        display.innerHTML = "<h4 style='color: #00ff00; margin-bottom: 1rem;'>👥 Utilisateurs Connectés</h4>";
        
        if (data.activeSessions && data.activeSessions.length > 0) {
            data.activeSessions.forEach(session => {
                const sessionItem = document.createElement("div");
                sessionItem.style.padding = "10px";
                sessionItem.style.border = "1px solid #444";
                sessionItem.style.margin = "5px 0";
                sessionItem.style.borderRadius = "5px";
                sessionItem.style.backgroundColor = "#1a1a1a";
                
                const loginTime = new Date(session.login_time).toLocaleString();
                const lastActivity = new Date(session.last_activity).toLocaleString();
                const secondsInactive = Math.floor(session.seconds_inactive || 0);
                
                // Déterminer le statut d'activité
                let statusColor = "#00ff00"; // Vert par défaut
                let statusText = "🟢 Actif";
                
                if (secondsInactive > 300) { // Plus de 5 minutes
                    statusColor = "#ff9500";
                    statusText = "🟡 Inactif";
                } else if (secondsInactive > 1800) { // Plus de 30 minutes
                    statusColor = "#ff0000";
                    statusText = "🔴 Très inactif";
                }
                
                sessionItem.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: ${statusColor};">${statusText} ${session.username}</strong><br>
                            <small>Connecté: ${loginTime}</small><br>
                            <small>Dernière activité: ${lastActivity}</small><br>
                            <small>Inactif depuis: ${secondsInactive}s</small>
                        </div>
                    </div>
                `;
                
                display.appendChild(sessionItem);
            });
            
            // Ajouter un bouton de rafraîchissement automatique
            const refreshButton = document.createElement("button");
            refreshButton.textContent = "🔄 Actualiser";
            refreshButton.className = "admin-button";
            refreshButton.style.marginTop = "1rem";
            refreshButton.onclick = fetchActiveSessions;
            display.appendChild(refreshButton);
            
        } else {
            display.innerHTML += "<div style='color: #888;'>Aucun utilisateur connecté actuellement</div>";
        }
    })
    .catch(error => {
        console.error("Erreur détaillée:", error);
        const display = document.getElementById("realtime-display");
        display.innerHTML = `
            <h4 style='color: #ff0000; margin-bottom: 1rem;'>❌ Erreur</h4>
            <div style='color: #ff6b6b;'>${error.message}</div>
            <button onclick="fetchActiveSessions()" class="admin-button" style="margin-top: 1rem;">Réessayer</button>
        `;
    });
}

// Supprimer les fonctions fetchActivityLogs, forceLogout et toggleAutoRefresh
// Remplacer par des fonctions vides ou les supprimer complètement
function fetchActivityLogs() {
    alert("Fonctionnalité non disponible");
}

function toggleAutoRefresh() {
    alert("Fonctionnalité non disponible");
}