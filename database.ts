import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

// Initialize PostgreSQL client
export const client = new Client({
  user: "yassinedaanoun", // Utilisez votre rôle PostgreSQL
  database: "userdb", // Nom de la base de données
  hostname: "localhost",
  password: "", // Laissez vide si aucun mot de passe n'est défini
  port: 65432,
});

// Initialize database connection and create tables
export async function initializeDatabase() {
  try {
    await client.connect();
    console.log("✅ Connected to the database successfully.");
  } catch (error) {
    console.error("❌ Failed to connect to the database:", error);
    Deno.exit(1); // Arrête le serveur si la connexion échoue
  }

  // Disable NOTICE messages
  await client.queryObject(`SET client_min_messages TO WARNING;`);

  // Create the users table if it doesn't exist
  await client.queryObject(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    );
  `);

  // Create the dictionnaire table if it doesn't exist
  await client.queryObject(`
    CREATE TABLE IF NOT EXISTS dictionnaire (
      id SERIAL PRIMARY KEY,
      mot TEXT UNIQUE NOT NULL
    );
  `);

  // Créer la table des scores
  await client.queryObject(`
    CREATE TABLE IF NOT EXISTS player_scores (
      username TEXT PRIMARY KEY REFERENCES users(username),
      current_score INTEGER DEFAULT 0,
      max_score INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0
    );
  `);

  // Créer la table des parties
  await client.queryObject(`
    CREATE TABLE IF NOT EXISTS games (
      game_id UUID PRIMARY KEY,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP,
      player_count INTEGER NOT NULL
    );
  `);

  // Add role column if it doesn't exist
  await client.queryObject(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role TEXT;
      END IF;
    END;
    $$;
  `);

  // Update admin role
  await client.queryObject(`
    UPDATE users SET role = 'admin' WHERE username = 'admin';
  `);

  // Créer la table des utilisateurs bannis
  await client.queryObject(`
    CREATE TABLE IF NOT EXISTS banned_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL REFERENCES users(username),
      banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      banned_by TEXT NOT NULL REFERENCES users(username),
      reason TEXT DEFAULT 'Aucune raison spécifiée'
    );
  `);

  // Créer la table des sessions utilisateurs
  await client.queryObject(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL REFERENCES users(username),
      login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      logout_time TIMESTAMP,
      ip_address INET,
      user_agent TEXT,
      is_active BOOLEAN DEFAULT true,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Créer la table des logs d'activité
  await client.queryObject(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      log_id SERIAL PRIMARY KEY,
      username TEXT REFERENCES users(username),
      action TEXT NOT NULL,
      details TEXT,
      ip_address INET,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Fonction pour gérer les scores persistants
export async function updatePlayerScore(username: string, addedPoints: number) {
  try {
    // Vérifier si le joueur existe dans la table des scores
    const checkResult = await client.queryObject(
      "SELECT * FROM player_scores WHERE username = $1;",
      [username]
    );
    
    if (checkResult.rows.length === 0) {
      // Créer une entrée pour ce joueur
      await client.queryObject(
        "INSERT INTO player_scores (username, current_score, max_score, games_played) VALUES ($1, $2, $2, 1);",
        [username, addedPoints]
      );
    } else {
      // Mettre à jour le score du joueur
      const currentRow = checkResult.rows[0];
      const newCurrentScore = (currentRow.current_score as number) + addedPoints;
      const newMaxScore = Math.max(newCurrentScore, currentRow.max_score as number);
      
      await client.queryObject(
        "UPDATE player_scores SET current_score = $1, max_score = $2, games_played = games_played + 1 WHERE username = $3;",
        [newCurrentScore, newMaxScore, username]
      );
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour du score:", error);
  }
}