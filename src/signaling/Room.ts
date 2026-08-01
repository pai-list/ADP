import { DurableObject } from 'cloudflare:workers';

/** Minimal WebSocket-stub interface the worker passes in for outbound sends. */
interface WsStub {
  send: (m: string) => void;
  readyState: number;
}

// Mirror open WebSocket state without importing `ws`.
const WS_OPEN = 1;

interface AgentInfo {
  did: string;
  displayName: string;
  capabilities: {
    mcpTools: string[];
    skills: string[];
    models: string[];
  };
  workspace: string;
  proof: string;
  joinedAt: number;
  ws: WsStub;
}

interface Session {
  sessionId: string;
  initiator: string;
  responder: string;
  sharedSecret: string;
  toolsGranted: string[];
  memoryGranted: string[];
  status: 'pending' | 'active' | 'completed' | 'revoked';
  createdAt: number;
  expiresAt: number;
}

interface Env {
  ADP_ROOM: DurableObjectNamespace;
  DB: D1Database;
  SESSIONS: KVNamespace;
  AI: Ai;
}

interface Ai {
  run(model: string, options: { text?: string[]; prompt?: string; stream?: boolean }): Promise<any>;
}

export class ADPRoom extends DurableObject<Env> {
  private agents: Map<string, AgentInfo> = new Map();
  private sessions: Map<string, Session> = new Map();
  private messageQueue: Map<string, any[]> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<{ agents: any; sessions: any }>('room-state');
      if (stored) {
        this.agents = new Map(Object.entries(stored.agents));
        this.sessions = new Map(Object.entries(stored.sessions));
      }
    });
  }

  async join(did: string, ws: WsStub, agentInfo?: Partial<AgentInfo>): Promise<void> {
    const info: AgentInfo = {
      did,
      displayName: agentInfo?.displayName || `agent-${did.slice(-8)}`,
      capabilities: agentInfo?.capabilities || { mcpTools: [], skills: [], models: [] },
      workspace: agentInfo?.workspace || 'default',
      proof: agentInfo?.proof || '',
      joinedAt: Date.now(),
      ws
    };

    this.agents.set(did, info);
    await this.persist();

    // Broadcast to all other agents
    this.broadcast({
      type: 'agent-joined',
      protocol: 'adp-v1',
      agent: {
        did: info.did,
        displayName: info.displayName,
        capabilities: info.capabilities,
        workspace: info.workspace,
        proof: info.proof
      }
    }, did);

    // Send current agent list to new joiner
    const agentList = Array.from(this.agents.entries())
      .filter(([d]) => d !== did)
      .map(([d, a]) => ({
        did: a.did,
        displayName: a.displayName,
        capabilities: a.capabilities,
        workspace: a.workspace,
        proof: a.proof
      }));

    ws.send(JSON.stringify({
      type: 'room-state',
      protocol: 'adp-v1',
      agents: agentList,
      yourDID: did
    }));
  }

  /**
   * Called by the worker for every incoming WebSocket message.
   * Dispatch to the same handler pipeline as before.
   */
  async receiveMessage(senderDID: string, data: string): Promise<void> {
    try {
      const message = JSON.parse(data);
      this.handleMessage(senderDID, message);
    } catch (error) {
      console.error('Message parse error:', error);
    }
  }

  async leave(did: string): Promise<void> {
    const agent = this.agents.get(did);
    if (agent) {
      this.agents.delete(did);
      this.broadcast({
        type: 'agent-left',
        protocol: 'adp-v1',
        agent: { did, displayName: agent.displayName }
      }, did);
      
      // Clean up sessions involving this agent
      for (const [sessionId, session] of this.sessions) {
        if (session.initiator === did || session.responder === did) {
          session.status = 'revoked';
        }
      }
      this.persist();
    }
  }

  private handleMessage(senderDID: string, message: any): void {
    switch (message.type) {
      case 'discover':
        this.handleDiscover(senderDID, message);
        break;
      case 'capability':
        this.handleCapability(senderDID, message);
        break;
      case 'session-request':
        this.handleSessionRequest(senderDID, message);
        break;
      case 'session-accept':
        this.handleSessionAccept(senderDID, message);
        break;
      case 'session-confirm':
        this.handleSessionConfirm(senderDID, message);
        break;
      case 'tool-share':
        this.handleToolShare(senderDID, message);
        break;
      case 'memory-grant':
        this.handleMemoryGrant(senderDID, message);
        break;
      case 'a2a-message':
        this.handleA2AMessage(senderDID, message);
        break;
      case 'a2a-task':
        this.handleA2ATask(senderDID, message);
        break;
      case 'leave':
        this.leave(senderDID);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * A2A interop — an agent sends an A2A-format message (parts, task ref)
   * through the ADP room; we validate, attach the ADP session context,
   * and forward to the recipient.
   */
  private handleA2AMessage(senderDID: string, message: any): void {
    const recipientDID = message.recipient?.agentId || message.target;
    if (!recipientDID || !this.agents.has(recipientDID)) {
      console.warn(`[A2A] Recipient ${recipientDID} not in room`);
      return;
    }
    const sender = this.agents.get(senderDID);
    const a2aMessage = {
      messageId: message.messageId || `${senderDID}-${Date.now()}`,
      a2aVersion: message.a2aVersion || '0.2.1',
      sender: { agentId: senderDID, name: sender?.displayName },
      recipient: { agentId: recipientDID },
      parts: message.parts || [],
      context: message.context,
      'x-adp': {
        sessionId: message['x-adp']?.sessionId || this.findSessionFor(senderDID, recipientDID),
        toolsGranted: message['x-adp']?.toolsGranted,
      },
    };
    const recipient = this.agents.get(recipientDID);
    recipient?.ws.send(JSON.stringify({ type: 'a2a-message', payload: a2aMessage }));
  }

  /** Public RPC — called by the worker's HTTP /a2a/tasks endpoint. */
  async rpcA2AMessage(senderDID: string, message: any): Promise<void> {
    this.handleA2AMessage(senderDID, message);
  }

  /** A2A task lifecycle — route tasks/send-style requests to the recipient. */
  private handleA2ATask(senderDID: string, message: any): void {
    const recipientDID = message.recipient?.agentId || message.target;
    if (!recipientDID || !this.agents.has(recipientDID)) {
      console.warn(`[A2A] Task recipient ${recipientDID} not in room`);
      return;
    }
    const recipient = this.agents.get(recipientDID);
    recipient?.ws.send(JSON.stringify({ type: 'a2a-task', payload: message.payload || message }));
  }

  /** Find an active session between two agents (or empty). */
  private findSessionFor(a: string, b: string): string {
    for (const [sessionId, session] of this.sessions) {
      if ((session.initiator === a && session.responder === b) ||
          (session.initiator === b && session.responder === a)) {
        return sessionId;
      }
    }
    return '';
  }

  private handleDiscover(senderDID: string, message: any): void {
    const sender = this.agents.get(senderDID);
    if (sender) {
      this.sendToAgent(senderDID, {
        type: 'discovery-result',
        protocol: 'adp-v1',
        agents: Array.from(this.agents.entries())
          .filter(([d]) => d !== senderDID)
          .map(([d, a]) => ({
            did: a.did,
            displayName: a.displayName,
            capabilities: a.capabilities,
            workspace: a.workspace,
            proof: a.proof
          }))
      });
    }
  }

  private handleCapability(senderDID: string, message: any): void {
    const sender = this.agents.get(senderDID);
    if (sender) {
      sender.capabilities = message.payload?.capabilities || sender.capabilities;
      this.persist();
    }
  }

  private handleSessionRequest(senderDID: string, message: any): void {
    const targetDID = message.target || message.payload?.responder;
    const target = this.agents.get(targetDID);
    
    if (!target) {
      this.sendToAgent(senderDID, {
        type: 'session-reject',
        protocol: 'adp-v1',
        reason: 'Target agent not found in workspace'
      });
      return;
    }

    const sessionId = crypto.randomUUID();
    const session: Session = {
      sessionId,
      initiator: senderDID,
      responder: targetDID,
      sharedSecret: this.generateSharedSecret(),
      toolsGranted: message.payload?.tools || [],
      memoryGranted: message.payload?.memory || [],
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000
    };

    this.sessions.set(sessionId, session);
    this.persist();

    // Forward to target
    this.sendToAgent(targetDID, {
      type: 'session-request',
      protocol: 'adp-v1',
      from: senderDID,
      sessionId,
      payload: {
        tools_needed: message.payload?.tools || [],
        memory_needed: message.payload?.memory || []
      }
    });
  }

  private handleSessionAccept(senderDID: string, message: any): void {
    const sessionId = message.sessionId;
    const session = this.sessions.get(sessionId);
    
    if (!session || session.responder !== senderDID) {
      return;
    }

    session.status = 'active';
    this.persist();

    // Notify initiator
    this.sendToAgent(session.initiator, {
      type: 'session-accept',
      protocol: 'adp-v1',
      sessionId,
      payload: {
        sharedSecret: session.sharedSecret,
        tools_offered: message.payload?.tools || []
      }
    });
  }

  private handleSessionConfirm(senderDID: string, message: any): void {
    const sessionId = message.sessionId;
    const session = this.sessions.get(sessionId);
    
    if (session && session.initiator === senderDID) {
      session.status = 'active';
      this.persist();

      // Notify responder
      this.sendToAgent(session.responder, {
        type: 'session-confirm',
        protocol: 'adp-v1',
        sessionId
      });
    }
  }

  private handleToolShare(senderDID: string, message: any): void {
    const targetDID = message.target;
    this.sendToAgent(targetDID, {
      type: 'tool-grant',
      protocol: 'adp-v1',
      from: senderDID,
      payload: message.payload
    });
  }

  private handleMemoryGrant(senderDID: string, message: any): void {
    const targetDID = message.target;
    this.sendToAgent(targetDID, {
      type: 'memory-grant',
      protocol: 'adp-v1',
      from: senderDID,
      payload: message.payload
    });
  }

  private sendToAgent(did: string, message: any): void {
    const agent = this.agents.get(did);
    if (agent && agent.ws.readyState === WS_OPEN) {
      agent.ws.send(JSON.stringify(message));
    } else {
      // Queue for when agent reconnects
      const queue = this.messageQueue.get(did) || [];
      queue.push(message);
      this.messageQueue.set(did, queue);
    }
  }

  private broadcast(message: any, excludeDID?: string): void {
    for (const [did, agent] of this.agents) {
      if (did !== excludeDID && agent.ws.readyState === WS_OPEN) {
        agent.ws.send(JSON.stringify(message));
      }
    }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('room-state', {
      agents: Object.fromEntries(this.agents),
      sessions: Object.fromEntries(this.sessions)
    });
  }

  private generateSharedSecret(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}