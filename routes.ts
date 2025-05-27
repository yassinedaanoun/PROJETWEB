import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { client, updatePlayerScore } from "./database.ts";
import { adminMiddleware } from "./middleware.ts";
import { createJWT } from "./auth.ts";

const router = new Router();

// Route d'inscription
router.post("/register", async (ctx) => {
  const body = await ctx.request.body({ type: "json" }).value;
  const { username, password } = body;

  // Check if the user already exists
  const existingUser = await client.queryObject(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );

  if (existingUser.rows.length > 0) {
    ctx.response.status = 409;
    ctx.response.body = { message: "User already exists" };
    return;
  }

  // Hash the password and insert the user
  const hashedPassword = await bcrypt.hash(password);
  await client.queryObject(
    "INSERT INTO users (username, password) VALUES ($1, $2)",
    [username, hashedPassword]
  );

  ctx.response.status = 201;
  ctx.response.body = { message: "User registered successfully" };
});

// Route de connexion
router.post("/login", async (ctx) => {
  console.log("🔍 Tentative de connexion...");
  const body = await ctx.request.body({ type: "json" }).value;
  const { username, password } = body;

  console.log("Données reçues :", { username, password });

  // Vérifier si l'utilisateur est banni avant de procéder
  const bannedCheck = await client.queryObject(
      "SELECT * FROM banned_users WHERE username = $1",
      [username]
  );

  if (bannedCheck.rows.length > 0) {
      console.log("❌ Utilisateur banni :", username);
      ctx.response.status = 403;
      ctx.response.body = { message: "Votre compte a été banni" };
      return;
  }

  const result = await client.queryObject(
      "SELECT * FROM users WHERE username = $1",
      [username]
  );

  if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log("✅ Utilisateur trouvé :", user);

      const passwordMatch = await bcrypt.compare(password, user.password);
      console.log("🔑 Mot de passe valide :", passwordMatch);

      if (passwordMatch) {
          const token = await createJWT({ 
              username: user.username,
              role: user.role 
          });

          // NOUVEAU: Enregistrer la session utilisateur
          const userAgent = ctx.request.headers.get("User-Agent") || "Unknown";
          const ipAddress = ctx.request.ip || "127.0.0.1";

          try {
              // Marquer les anciennes sessions comme inactives
              await client.queryObject(
                  "UPDATE user_sessions SET is_active = false, logout_time = NOW() WHERE username = $1 AND is_active = true;",
                  [user.username]
              );

              // Créer une nouvelle session
              await client.queryObject(`
                  INSERT INTO user_sessions (username, ip_address, user_agent) 
                  VALUES ($1, $2, $3);
              `, [user.username, ipAddress, userAgent]);

              // Enregistrer l'activité de connexion
              await client.queryObject(
                  "INSERT INTO activity_logs (username, action, details, ip_address) VALUES ($1, $2, $3, $4);",
                  [user.username, "LOGIN", "Connexion réussie", ipAddress]
              );

              console.log("✅ Session utilisateur créée");
          } catch (sessionError) {
              console.error("❌ Erreur lors de la création de session:", sessionError);
              // Ne pas bloquer la connexion pour une erreur de session
          }

          console.log("🔐 Token généré :", token);

          ctx.response.status = 200;
          ctx.response.body = { 
              message: "Login successful", 
              username: user.username,
              role: user.role,
              token: token
          };
          return;
      }
  }

  // NOUVEAU: Enregistrer les tentatives de connexion échouées
  const ipAddress = ctx.request.ip || "127.0.0.1";
  try {
      await client.queryObject(
          "INSERT INTO activity_logs (username, action, details, ip_address) VALUES ($1, $2, $3, $4);",
          [username || "UNKNOWN", "LOGIN_FAILED", "Tentative de connexion échouée", ipAddress]
      );
  } catch (logError) {
      console.error("❌ Erreur lors de l'enregistrement du log:", logError);
  }

  console.log("❌ Connexion échouée : nom d'utilisateur ou mot de passe invalide");
  ctx.response.status = 401;
  ctx.response.body = { message: "Invalid username or password" };
});

// Route pour peupler le dictionnaire
router.post("/populate-dictionnaire", async (ctx) => {
  const body = await ctx.request.body({ type: "json" }).value;
  const { mots } = body; // Les mots doivent être envoyés sous forme de tableau

  try {
    for (const mot of mots) {
      await client.queryObject(
        "INSERT INTO dictionnaire (mot) VALUES ($1) ON CONFLICT (mot) DO NOTHING;",
        [mot]
      );
    }
    ctx.response.status = 200;
    ctx.response.body = { message: "Dictionnaire peuplé avec succès" };
  } catch (error) {
    console.error("Erreur lors de l'insertion des mots :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur lors de l'insertion des mots" };
  }
});

// Route pour récupérer des mots aléatoires
router.get("/get-random-words", async (ctx) => {
  try {
    const result = await client.queryObject<{ mot: string }>(
      "SELECT mot FROM dictionnaire ORDER BY RANDOM() LIMIT 4;"
    );
    ctx.response.status = 200;
    ctx.response.body = result.rows; // Renvoie les mots sous forme de tableau
  } catch (error) {
    console.error("Erreur lors de la récupération des mots :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur lors de la récupération des mots" };
  }
});

// Route pour récupérer les meilleurs scores
router.get("/highscores", async (ctx) => {
  try {
    const result = await client.queryObject(
      "SELECT username, max_score FROM player_scores ORDER BY max_score DESC LIMIT 10;"
    );
    
    ctx.response.body = { highscores: result.rows };
  } catch (error) {
    console.error("Erreur lors de la récupération des meilleurs scores:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// ==================== ROUTES ADMIN ====================

// Route pour lister les utilisateurs
router.get("/admin/users", adminMiddleware, async (ctx) => {
  console.log("🔍 Requête reçue pour /admin/users");
  try {
    const result = await client.queryObject("SELECT username, role FROM users;");
    console.log("✅ Utilisateurs récupérés :", result.rows);
    ctx.response.body = { users: result.rows };
  } catch (error) {
    console.error("❌ Erreur lors de la récupération des utilisateurs :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour supprimer un utilisateur
router.delete("/admin/users/:username", adminMiddleware, async (ctx) => {
  const username = ctx.params.username;

  try {
    // D'abord supprimer les scores du joueur
    await client.queryObject("DELETE FROM player_scores WHERE username = $1;", [username]);
    
    // Ensuite supprimer l'utilisateur
    await client.queryObject("DELETE FROM users WHERE username = $1;", [username]);
    
    ctx.response.body = { message: `Utilisateur ${username} supprimé.` };
  } catch (error) {
    console.error("Erreur lors de la suppression de l'utilisateur :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur lors de la suppression" };
  }
});

// Route pour lister les scores des joueurs
router.get("/admin/scores", adminMiddleware, async (ctx) => {
  try {
    const result = await client.queryObject(
      "SELECT username, current_score, max_score, games_played FROM player_scores ORDER BY max_score DESC;"
    );
    ctx.response.body = { scores: result.rows };
  } catch (error) {
    console.error("Erreur lors de la récupération des scores :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour réinitialiser les scores d'un joueur
router.put("/admin/scores/:username/reset", adminMiddleware, async (ctx) => {
  const username = ctx.params.username;

  try {
    await client.queryObject(
      "UPDATE player_scores SET current_score = 0, games_played = 0 WHERE username = $1;",
      [username]
    );
    ctx.response.body = { message: `Scores de ${username} réinitialisés.` };
  } catch (error) {
    console.error("Erreur lors de la réinitialisation des scores :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour ajouter un mot au dictionnaire
router.post("/admin/dictionnaire", adminMiddleware, async (ctx) => {
  const body = await ctx.request.body({ type: "json" }).value;
  const { mot } = body;

  try {
    await client.queryObject(
      "INSERT INTO dictionnaire (mot) VALUES ($1) ON CONFLICT (mot) DO NOTHING;",
      [mot]
    );
    ctx.response.body = { message: `Mot "${mot}" ajouté au dictionnaire.` };
  } catch (error) {
    console.error("Erreur lors de l'ajout du mot :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour supprimer un mot du dictionnaire
router.delete("/admin/dictionnaire/:mot", adminMiddleware, async (ctx) => {
  const mot = ctx.params.mot;

  try {
    await client.queryObject("DELETE FROM dictionnaire WHERE mot = $1;", [mot]);
    ctx.response.body = { message: `Mot "${mot}" supprimé du dictionnaire.` };
  } catch (error) {
    console.error("Erreur lors de la suppression du mot :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour lister les mots du dictionnaire
router.get("/admin/dictionnaire", adminMiddleware, async (ctx) => {
  try {
    const result = await client.queryObject("SELECT mot FROM dictionnaire;");
    ctx.response.body = { mots: result.rows };
  } catch (error) {
    console.error("Erreur lors de la récupération des mots :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour rechercher un mot dans le dictionnaire
router.get("/admin/dictionnaire/search/:mot", adminMiddleware, async (ctx) => {
  const mot = ctx.params.mot;

  try {
    const result = await client.queryObject(
      "SELECT * FROM dictionnaire WHERE mot = $1;",
      [mot]
    );

    if (result.rows.length > 0) {
      ctx.response.body = { exists: true, message: `Le mot "${mot}" existe dans le dictionnaire.` };
    } else {
      ctx.response.body = { exists: false, message: `Le mot "${mot}" n'existe pas dans le dictionnaire.` };
    }
  } catch (error) {
    console.error("Erreur lors de la recherche du mot :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour voir les statistiques globales
router.get("/admin/stats", adminMiddleware, async (ctx) => {
  try {
    const userCountResult = await client.queryObject("SELECT COUNT(*) AS count FROM users;");
    const gameCountResult = await client.queryObject("SELECT COUNT(*) AS count FROM games;");
    const wordCountResult = await client.queryObject("SELECT COUNT(*) AS count FROM dictionnaire;");

    // Convertir BigInt en Number pour éviter l'erreur de sérialisation
    const userCount = Number(userCountResult.rows[0]?.count || 0);
    const gameCount = Number(gameCountResult.rows[0]?.count || 0);
    const wordCount = Number(wordCountResult.rows[0]?.count || 0);

    ctx.response.body = {
      users: userCount,
      games: gameCount,
      words: wordCount,
    };
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour lister les utilisateurs bannis
router.get("/admin/banned-users", adminMiddleware, async (ctx) => {
  try {
    const result = await client.queryObject(
      `SELECT bu.username, bu.banned_at, bu.banned_by, bu.reason 
       FROM banned_users bu 
       ORDER BY bu.banned_at DESC;`
    );
    ctx.response.body = { bannedUsers: result.rows };
  } catch (error) {
    console.error("Erreur lors de la récupération des utilisateurs bannis :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour bannir un utilisateur
router.post("/admin/ban-user", adminMiddleware, async (ctx) => {
  const body = await ctx.request.body({ type: "json" }).value;
  const { username, reason } = body;
  const adminUsername = ctx.state.username;

  try {
    // Vérifier que l'utilisateur existe
    const userCheck = await client.queryObject(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (userCheck.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Utilisateur non trouvé" };
      return;
    }

    // Vérifier que l'utilisateur n'est pas déjà banni
    const bannedCheck = await client.queryObject(
      "SELECT * FROM banned_users WHERE username = $1",
      [username]
    );

    if (bannedCheck.rows.length > 0) {
      ctx.response.status = 409;
      ctx.response.body = { message: "Utilisateur déjà banni" };
      return;
    }

    // Bannir l'utilisateur
    await client.queryObject(
      "INSERT INTO banned_users (username, banned_by, reason) VALUES ($1, $2, $3)",
      [username, adminUsername, reason || "Aucune raison spécifiée"]
    );

    ctx.response.body = { message: `Utilisateur ${username} banni avec succès` };
  } catch (error) {
    console.error("Erreur lors du bannissement :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour débannir un utilisateur
router.delete("/admin/unban-user/:username", adminMiddleware, async (ctx) => {
  const username = ctx.params.username;

  try {
    const result = await client.queryObject(
      "DELETE FROM banned_users WHERE username = $1",
      [username]
    );

    ctx.response.body = { message: `Utilisateur ${username} débanni avec succès` };
  } catch (error) {
    console.error("Erreur lors du débannissement :", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour voir les utilisateurs connectés en temps réel
router.get("/admin/active-sessions", adminMiddleware, async (ctx) => {
  try {
    const result = await client.queryObject(`
      SELECT 
        us.username, 
        us.login_time, 
        us.last_activity, 
        us.ip_address,
        EXTRACT(EPOCH FROM (NOW() - us.last_activity)) as seconds_inactive
      FROM user_sessions us 
      WHERE us.is_active = true 
        AND us.last_activity > NOW() - INTERVAL '2 hours'
      ORDER BY us.last_activity DESC;
    `);
    
    ctx.response.body = { activeSessions: result.rows };
  } catch (error) {
    console.error("Erreur lors de la récupération des sessions actives:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour voir les logs d'activité récents
router.get("/admin/activity-logs", adminMiddleware, async (ctx) => {
  try {
    const result = await client.queryObject(`
      SELECT username, action, details, ip_address, timestamp
      FROM activity_logs 
      ORDER BY timestamp DESC 
      LIMIT 50;
    `);
    
    ctx.response.body = { activityLogs: result.rows };
  } catch (error) {
    console.error("Erreur lors de la récupération des logs:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Route pour déconnecter un utilisateur à distance
router.post("/admin/force-logout", adminMiddleware, async (ctx) => {
  const body = await ctx.request.body({ type: "json" }).value;
  const { username } = body;

  try {
    await client.queryObject(
      "UPDATE user_sessions SET is_active = false, logout_time = NOW() WHERE username = $1 AND is_active = true;",
      [username]
    );

    // Log de l'action admin
    await client.queryObject(
      "INSERT INTO activity_logs (username, action, details) VALUES ($1, $2, $3);",
      [ctx.state.username, "FORCE_LOGOUT", `Déconnexion forcée de ${username}`]
    );

    ctx.response.body = { message: `Utilisateur ${username} déconnecté` };
  } catch (error) {
    console.error("Erreur lors de la déconnexion forcée:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur serveur" };
  }
});

// Export du routeur
export { router };