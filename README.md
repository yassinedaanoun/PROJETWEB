# PROJETWEB


j'ai decider de créer pour mon projet web, Un jeu de dessin multijoueur en temps réel inspiré de Skribbl.io, développé avec Deno, TypeScript et WebSockets.


## Table des matières
	•	Aperçu
	•	Fonctionnalités
	•	Technologies utilisées
	•	Installation et configuration
	•	Structure du projet
	•	Interface d'administration
	•	API Documentation
	•	Sécurité
	•	Contribuer
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
Vanilla JavaScript - Logique client sans framework
CSS3 - Animations et effets visuels avancés
WebSocket API - Communication bidirectionnelle
#### Sécurité
CORS configuré pour les requêtes cross-origin
Middleware de bannissement automatique
Validation des entrées côté serveur
Sessions sécurisées avec tracking d'activité
### Installation et configuration
#### Prérequis

-Deno 
-PostgreSQL
-Git:






