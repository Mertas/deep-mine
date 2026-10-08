import { ServerMessage, ClientMessage } from './types';

type MessageHandler = (msg: ServerMessage) => void;

export class WSClient {
  private socket: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private reconnectDelay = 2000;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.updateStatus('connected');
      this.send({ type: 'get_init' });
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        this.dispatch(msg);
      } catch {
        // ignore parse errors
      }
    };

    this.socket.onclose = () => {
      this.updateStatus('disconnected');
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  private dispatch(msg: ServerMessage): void {
    const handlers = this.handlers.get(msg.type) || [];
    for (const h of handlers) {
      h(msg);
    }
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.updateStatus('connecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
  }

  private updateStatus(status: string): void {
    const el = document.getElementById('connection-status');
    if (!el) return;
    el.textContent = status.toUpperCase();
    el.className = `stat-value ${status}`;

    const bottomEl = document.getElementById('status-message');
    if (bottomEl) {
      bottomEl.textContent = status === 'connected'
        ? 'AI learning in progress...'
        : 'Awaiting connection...';
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }
}
