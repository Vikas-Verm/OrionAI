require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { init: initWS } = require("./services/websocketServer");

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  // Create HTTP server from Express app
  const server = http.createServer(app);

  // Attach WebSocket server to the same port
  initWS(server);

  server.listen(PORT, () => {
    console.log(`🚀 HTTP + WebSocket server running on port ${PORT}`);
  });
});
