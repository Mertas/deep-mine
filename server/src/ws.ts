import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';

export interface WSClient {
  id: string;
  socket: WebSocket;
  connectedAt: number;
}

export type ServerMessage =
  | { type: 'init'; data: InitData }
  | { type: 'move'; data: MoveData }
  | { type: 'episode_end'; data: EpisodeEndData }
  | { type: 'train_step'; data: TrainStepData }
  | { type: 'field_upgrade'; data: FieldUpgradeData }
  | { type: 'stats'; data: StatsData }
  | { type: 'user_count'; data: { count: number } }
  | { type: 'training_started' }
  | { type: 'training_stopped' }
  | { type: 'training_paused' }
  | { type: 'training_resumed' };

export interface InitData {
  grid: any[][];
  rows: number;
  cols: number;
  totalMines: number;
  status: string;
  episode: number;
  epsilon: number;
  winRate: number;
  winRateHistory: { episode: number; winRate: number }[];
  lossHistory: { step: number; loss: number }[];
  fieldSize: string;
  training: boolean;
  userCount: number;
}

export interface MoveData {
  row: number;
  col: number;
  revealed: { row: number; col: number; adjacentMines: number; isMine: boolean; isRevealed: boolean; isFlagged: boolean }[];
  status: string;
  revealedCount: number;
  flaggedCount: number;
}

export interface EpisodeEndData {
  win: boolean;
  episode: number;
  winRate: number;
  loss: number;
  fieldSize: string;
}

export interface TrainStepData {
  loss: number;
  step: number;
}

export interface FieldUpgradeData {
  rows: number;
  cols: number;
  mines: number;
}

export interface StatsData {
  episode: number;
  epsilon: number;
  winRate: number;
}

export type ClientMessage =
  | { type: 'start_training' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'set_speed'; data: { speed: number } }
  | { type: 'get_init' }
  | { type: 'reset' };

export class WSManager {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private messageHandler: ((clientId: string, msg: ClientMessage) => void) | null = null;
  private connectHandler: ((clientId: string) => void) | null = null;
  private disconnectHandler: ((clientId: string) => void) | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HttpServer, heartbeatMs = 30000) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
      const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const client: WSClient = { id, socket, connectedAt: Date.now() };
      this.clients.set(id, client);

      console.log(`[WS] Client connected: ${id} (total: ${this.clients.size})`);

      if (this.connectHandler) {
        this.connectHandler(id);
      }

      socket.on('message', (raw) => {
        try {
          const msg: ClientMessage = JSON.parse(raw.toString());
          if (this.messageHandler) {
            this.messageHandler(id, msg);
          }
        } catch {
          // ignore malformed messages
        }
      });

      socket.on('close', () => {
        this.clients.delete(id);
        console.log(`[WS] Client disconnected: ${id} (total: ${this.clients.size})`);
        if (this.disconnectHandler) {
          this.disconnectHandler(id);
        }
      });

      socket.on('error', () => {
        this.clients.delete(id);
        if (this.disconnectHandler) {
          this.disconnectHandler(id);
        }
      });
    });

    this.heartbeatInterval = setInterval(() => {
      for (const [id, client] of this.clients) {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.ping();
        } else {
          this.clients.delete(id);
        }
      }
    }, heartbeatMs);
  }

  onMessage(handler: (clientId: string, msg: ClientMessage) => void): void {
    this.messageHandler = handler;
  }

  onConnect(handler: (clientId: string) => void): void {
    this.connectHandler = handler;
  }

  onDisconnect(handler: (clientId: string) => void): void {
    this.disconnectHandler = handler;
  }

  broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(data);
      }
    }
  }

  send(clientId: string, message: ServerMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const client of this.clients.values()) {
      client.socket.close();
    }
    this.clients.clear();
    this.wss.close();
  }
}
