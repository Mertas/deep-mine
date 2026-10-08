import express from 'express';
import { createServer } from 'http';
import { join } from 'path';
import { config } from './config';
import { WSManager } from './ws';
import { GameDatabase } from './db';
import { Orchestrator } from './orchestrator';

const app = express();
const server = createServer(app);

const staticPath = join(__dirname, '..', '..', config.server.staticDir);
app.use(express.static(staticPath));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const db = new GameDatabase(config.db.path);
const ws = new WSManager(server, config.ws.heartbeatInterval);
const orchestrator = new Orchestrator(db, ws);

server.listen(config.server.port, config.server.host, () => {
  console.log(`[Deep Mine] Server running at http://${config.server.host}:${config.server.port}`);
  console.log(`[Deep Mine] Static files: ${staticPath}`);
  console.log(`[Deep Mine] DB path: ${config.db.path}`);
});

process.on('SIGINT', () => {
  console.log('\n[Deep Mine] Shutting down...');
  orchestrator.stop();
  ws.close();
  db.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  orchestrator.stop();
  ws.close();
  db.close();
  server.close();
  process.exit(0);
});
