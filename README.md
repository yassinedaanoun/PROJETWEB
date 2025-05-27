# PROJETWEB


j'ai decider de créer pour mon projet web, Un jeu de dessin multijoueur en temps réel inspiré de Skribbl.io, développé avec Deno, TypeScript et WebSockets.


## Table des matières
	•	Aperçu
	•	Fonctionnalités
	•	Technologies utilisées
	•	Installation et configuration
	•	Interface d'administration
	•	Sécurité
### Aperçu
The Guess Game est un jeu multijoueur en ligne où les joueurs alternent entre dessiner et deviner des mots. Un joueur dessine un mot secret sur un canvas partagé tandis que les autres tentent de le deviner dans le chat. Plus vous devinez rapidement, plus vous gagnez de points.

### Fonctionnalités:
#### Fonctionnalités de jeu:

Multijoueur en temps réel avec WebSockets
Canvas de dessin interactif avec outils de couleur
Chat en temps réel pour les devinettes
Système de tours avec dessinateur rotatif automatique
Timer de 90 secondes par manche
Système de points progressif :

1er à deviner : 600 points
2ème à deviner : 450 points
3ème à deviner : 300 points
Autres : 100 points


Dictionnaire personnalisable de mots à deviner
Scores persistants sauvegardés en base de données

#### Système d'authentification:

Inscription/Connexion sécurisée avec JWT
Hashage des mots de passe avec bcrypt
Sessions utilisateur trackées
Système de bannissement pour la modération

#### Interface d'administration:

Gestion des utilisateurs (liste, suppression, bannissement)
Gestion des scores (consultation, réinitialisation)
Gestion du dictionnaire (ajout/suppression de mots)
Statistiques globales du jeu
Surveillance en temps réel des utilisateurs connectés
Logs d'activité détaillés
### Technologies utilisées
#### Backend
Deno - Runtime JavaScript/TypeScript moderne
Oak - Framework web pour Deno (équivalent Express)
PostgreSQL - Base de données relationnelle
WebSockets - Communication temps réel
JWT - Authentification par tokens
bcrypt - Hashage sécurisé des mots de passe
#### Frontend
HTML5 Canvas - Zone de dessin interactive
 JavaScript - Logique client sans framework
CSS - Animations et effets visuels avancés
WebSocket API
#### Sécurité
CORS configuré pour les requêtes cross-origin
Middleware de bannissement automatique
Validation des entrées côté serveur
Sessions sécurisées avec tracking d'activité
### Installation et configuration
#### Prérequis
-Le dossier est en zip sur le depot moodle
-Deno 
-PostgreSQL

- Lancement du serveur commande: deno run --allow-net --allow-read back_server.ts
-Telecharger lextension: Live Server sur vscode et ensuite faire un clic droit login.html et faire: open with live server
#### Base de données - Tables:
users : Comptes utilisateurs avec rôles
dictionnaire : Mots disponibles pour le jeu
player_scores : Scores persistants des joueurs
games : Historique des parties
banned_users : Utilisateurs bannis
user_sessions : Sessions actives trackées
activity_logs : Logs d'activité système

### Interface d'administration:
#### connexion avec le compte: 
utilisateur: yassine
mot de passe:Rayan123mot
#### Fonctionnalités disponibles
Gestion des utilisateurs
Lister tous les utilisateurs inscrits
Supprimer un compte utilisateur
Bannir/Débannir des utilisateurs
Voir les utilisateurs connectés en temps réel

Gestion des scores
Consulter tous les scores des joueurs
Réinitialiser les scores d'un joueur spécifique
Statistiques globales de performance

Gestion du dictionnaire

Ajouter de nouveaux mots
Supprimer des mots existants
Rechercher un mot spécifique

Création d'un compte admin
sql-- Après création d'un compte via l'interface
UPDATE users SET role = 'admin' WHERE username = 'votre_username';
### Sécurité:
JWT sécurisé avec secret robuste
Hashage bcrypt des mots de passe
Middleware de bannissement automatique
Validation des rôles pour l'administration
CORS configuré pour éviter les attaques cross-origin
Sanitisation des entrées utilisateur

NB:j'ai eu un probleme pour les tokens, ils sont effectivement renvoye dans le body. j'ai bien compris qu'il fallait que ce soit en http only seulemt j'ai eu des problemes pour l'implenter.




