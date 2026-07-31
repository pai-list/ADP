// ADP Signaling Worker - Cloudflare Worker entry point
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { upgradeWebSocket } from 'hono/cloudflare-workers';
import { adpSessionToAgentCard, validateA2AMessage, adpSessionToA2ATask } from '../a2a/bridge.js';

interface Env {
  ADP_ROOM: DurableObjectNamespace;
  DB: D1Database;
  SESSIONS: KVNamespace;
  AI: Ai;
}

/** Typed view of the Room Durable Object for cross-calls. */
interface RoomStub {
  join(did: string, ws: WebSocket, agentInfo?: Record<string, unknown>): Promise<void>;
  rpcA2AMessage(senderDID: string, message: Record<string, unknown>): Promise<void>;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'adp-signaling', version: '0.2.0' }));

/**
 * A2A AgentCard discovery endpoint.
 * Any agent discovered via ADP can expose its A2A AgentCard here,
 * making it addressable by any A2A-compliant client.
 */
app.get('/.well-known/agent-card.json', async (c) => {
  const did = c.req.query('did') || 'did:axiom:adp-gateway';
  const name = c.req.query('name') || 'ADP Gateway';
  const workspace = c.req.query('workspace') || 'default';
  const signaling = `${new URL(c.req.url).origin}/ws`;

  const card = adpSessionToAgentCard({
    did,
    displayName: name,
    capabilities: {
      mcpTools: [],
      skills: ['discovery', 'session-negotiation', 'a2a-bridge'],
      models: [],
    },
    workspace,
    signalingEndpoint: signaling,
  });

  return c.json(card);
});

/**
 * A2A task interop — route tasks/send-style requests through the room.
 * Body: { sessionId, recipient, parts }
 */
app.post('/a2a/tasks', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.recipient?.agentId || !body?.parts) {
    return c.json({ error: { code: 400, message: 'Missing recipient.agentId or parts' } }, 400);
  }
  const room = c.env.ADP_ROOM.idFromName(body.room || 'default');
  const stub = c.env.ADP_ROOM.get(room) as unknown as RoomStub;
  await stub.rpcA2AMessage(body.sender?.agentId || 'anonymous', {
    type: 'a2a-message',
    recipient: body.recipient,
    parts: body.parts,
    'x-adp': { sessionId: body.sessionId },
  });
  return c.json({
    id: `task-${body.sessionId || 'pending'}`,
    status: { state: 'working' },
    'x-adp': { sessionId: body.sessionId },
  });
});

// WebSocket endpoint for ADP signaling
app.get('/ws', upgradeWebSocket((c) => {
  return {
    onMessage: async (evt, ws) => {
      try {
        const data = evt.data instanceof Blob ? await evt.data.text() : String(evt.data);
        const message = JSON.parse(data);
        const room = c.env.ADP_ROOM.idFromName(message.room || 'default');
        const stub = c.env.ADP_ROOM.get(room) as unknown as RoomStub;
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
