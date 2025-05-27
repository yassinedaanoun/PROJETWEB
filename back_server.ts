import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

// Imports des modules locaux
import { initializeDatabase } from "./database.ts";
import { router } from "./routes.ts";
import { checkBannedMiddleware, updateUserActivity } from "./middleware.ts";
import { handleWebSocket } from "./websocket.ts";

const app = new Application();
const port = Deno.args[0] ? Number(Deno.args[0]) : 3000;

// Initialiser la base de données
await initializeDatabase();

// Route WebSocket
router.get("/ws", (ctx) => {
  handleWebSocket(ctx);
});

// Apply CORS middleware
app.use(oakCors({
  origin: ["http://localhost:5500", "http://127.0.0.1:5500", "http://127.0.0.1:5501"],
  credentials: true, // Autoriser l'envoi des cookies
}));

// Apply middlewares
app.use(checkBannedMiddleware);
app.use(updateUserActivity);
app.use(router.routes());
app.use(router.allowedMethods());

// Example usage of the fetch function
fetch("http://localhost:3000/admin/dictionnaire/search/someWord", {
    method: "GET",
    credentials: "include", // Inclure les cookies
});

console.log(`Oak server running on port ${port}`);
await app.listen({ port });