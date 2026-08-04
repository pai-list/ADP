import { DurableObject } from 'cloudflare:workers';

interface SignalingMessage {
  type: string;
  [key: string]: unknown;
}

interface SessionData {
  ws: WebSocket;
  pending: SignalingMessage[];
}

export class ADPRoom extends DurableObject<Env> {
  private sessions: Map<string, SessionData> = new Map();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/ws') {
      return this.handleWebSocket(request);
    }
    
    if (url.pathname === '/broadcast') {
      return this.handleBroadcast(request);
    }
    
    if (url.pathname.startsWith('/session/')) {
      return this.handleSessionMessage(request);
    }
    
    if (url.pathname === '/rooms') {
      return this.listRooms();
    }
    
    return new Response('Not found', { status: 404 });
  }
  
  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 400 });
    }

    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1];
    
    server.accept();
    
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { ws: server, pending: [] });
    
    server.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handleMessage(sessionId, message);
      } catch (err) {
        console.error('Message parse error:', err);
        server.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
      }
    });
    
    server.addEventListener('close', () => {
      this.sessions.delete(sessionId);
      console.log(`Session ${sessionId} closed`);
    });
    
    // Send any pending messages
    const session = this.sessions.get(sessionId);
    if (session) {
      for (const msg of session.pending) {
        server.send(JSON.stringify(msg));
      }
      session.pending = [];
    }
    
    return new Response(null, { status: 101, webSocket: client });
  }
  
  private async handleBroadcast(request: Request): Promise<Response> {
    const body = await request.json();
    let sent = 0;
    for (const [, session] of this.sessions) {
      try {
        session.ws.send(JSON.stringify(body));
        sent++;
      } catch (err) {
        console.error('Broadcast error:', err);
      }
    }
    return new Response(JSON.stringify({ sent }));
  }
  
  private async handleSessionMessage(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length === 0) {
      return new Response('Not found', { status: 404 });
    }
    const id = pathParts[pathParts.length - 1] as string;
    const session = this.sessions.get(id);
    if (!session) {
      return new Response('Not found', { status: 404 });
    }
    const body = await request.json();
    session.ws.send(JSON.stringify(body));
    return new Response(JSON.stringify({ sent: true }));
  }
  
  private listRooms(): Response {
    const rooms = Array.from(this.sessions.keys());
    return new Response(JSON.stringify({ rooms, count: rooms.length }));
  }
  
  private async handleMessage(sessionId: string, message: SignalingMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    switch (message.type) {
      case 'register':
        session.ws.send(JSON.stringify({ 
          type: 'registered', 
          sessionId,
          timestamp: Date.now()
        }));
        break;
        
      case 'offer':
      case 'answer':
      case 'ice-candidate':
      case 'discovery':
      case 'task':
      case 'result':
        // Forward to all other sessions
        for (const [id, session] of this.sessions) {
          if (id !== sessionId) {
            session.ws.send(JSON.stringify({
              ...message,
              from: sessionId,
              timestamp: Date.now()
            }));
          }
        }
        break;
        
      case 'ping':
        session.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
        
      default:
        session.ws.send(JSON.stringify({ 
          type: 'error', 
          error: `Unknown message type: ${message.type}` 
        }));
    }
  }
}

interface Env {
  ADPRoom: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/ws')) {
      // Route WebSocket to ADPRoom DO
      const id = env.ADPRoom.idFromName('signaling-room');
      const stub = env.ADPRoom.get(id);
      return stub.fetch(request);
    }
    
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }
    
    if (url.pathname === '/rooms') {
      // List active rooms/sessions
      const id = env.ADPRoom.idFromName('signaling-room');
      const stub = env.ADPRoom.get(id);
      return stub.fetch(new Request('https://internal/rooms'));
    }
    
    return new Response('ADP Signaling Service', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};