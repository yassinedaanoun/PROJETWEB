import { jwtVerify } from "npm:jose@5.9.6";
import { client } from "./database.ts";

// JWT secret
const secret = new TextEncoder().encode("ed5a207a8e88013ab968eaf43d0017507508e5efa2129248b713a223eaf66864");

// Middleware pour vérifier si l'utilisateur est un administrateur
export const adminMiddleware = async (ctx: any, next: any) => {
    try {
        const authHeader = ctx.request.headers.get("Authorization");

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            ctx.response.status = 401;
            ctx.response.body = { message: "Token manquant ou invalide" };
            return;
        }

        const token = authHeader.split(" ")[1]; // Récupère le token après "Bearer"

        const { payload } = await jwtVerify(token, secret, {
            algorithms: ["HS256"], // Assurez-vous que l'algorithme correspond à celui utilisé pour signer
        });

        if (payload.role !== "admin") {
            ctx.response.status = 403;
            ctx.response.body = { message: "Accès interdit : admin uniquement" };
            return;
        }

        ctx.state.username = payload.username; // Stocker le nom d'utilisateur dans le contexte
        await next();
    } catch (err) {
        console.error("❌ Erreur lors de la vérification du token :", err);
        ctx.response.status = 401;
        ctx.response.body = { message: "Token invalide" };
    }
};

// Middleware pour vérifier si l'utilisateur est banni
export const checkBannedMiddleware = async (ctx: any, next: any) => {
  try {
      const authHeader = ctx.request.headers.get("Authorization");
      
      if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.split(" ")[1];
          const { payload } = await jwtVerify(token, secret, {
              algorithms: ["HS256"],
          });
          
          // Vérifier si l'utilisateur est banni
          const bannedCheck = await client.queryObject(
              "SELECT * FROM banned_users WHERE username = $1",
              [payload.username]
          );
          
          if (bannedCheck.rows.length > 0) {
              ctx.response.status = 403;
              ctx.response.body = { message: "Votre compte a été banni" };
              return;
          }
      }
      
      await next();
  } catch (err) {
      await next();
  }
};

// Middleware pour mettre à jour l'activité utilisateur
export const updateUserActivity = async (ctx: any, next: any) => {
  try {
      const authHeader = ctx.request.headers.get("Authorization");
      
      if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.split(" ")[1];
          const { payload } = await jwtVerify(token, secret, {
              algorithms: ["HS256"],
          });
          
          // Mettre à jour l'activité de l'utilisateur
          await client.queryObject(
              "UPDATE user_sessions SET last_activity = NOW() WHERE username = $1 AND is_active = true;",
              [payload.username]
          );
      }
  } catch (err) {
      // Ignorer les erreurs de mise à jour d'activité
  }
  
  await next();
};