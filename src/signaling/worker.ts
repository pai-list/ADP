// ADP Signaling Worker - Cloudflare Worker entry point
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { upgradeWebSocket } from 'hono/cloudflare-workers';

interface Env {
  ADP_ROOM: DurableObjectNamespace;
  DB: D1Database;
  SESSIONS: KVNamespace;
  AI: Ai;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'adp-signaling', version: '0.1.0' }));

// WebSocket endpoint for ADP signaling
app.get('/ws', upgradeWebSocket((c) => {
  return {
    onMessage: async (evt, ws) => {
      try {
        const data = evt.data instanceof Blob ? await evt.data.text() : String(evt.data);
        const message = JSON.parse(data);
        const room = c.env.ADP_ROOM.idFromName(message.room || 'default');
        const stub = c.env.ADP_ROOM.get(room);
        await stub.join(message.did || 'unknown', ws, message);
      } catch (error) {
        console.error('Message parse error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    },
    onClose: () => {
      // Handle cleanup if needed
    }
  };
}));

export default app;