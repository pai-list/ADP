/**
 * ADP ↔ A2A (Agent2Agent) Protocol Bridge
 *
 * The Agent Discovery Protocol (ADP) discovers agents and negotiates sessions.
 * Google's A2A protocol defines HOW discovered agents talk to each other:
 *   - AgentCard (/.well-known/agent-card.json) — discovery document
 *   - message type — structured peer-to-peer messaging
 *   - tasks/ methods — task lifecycle (send, get, cancel)
 *
 * This module bridges ADP's room/session layer to A2A's AgentCard + task model,
 * so an agent discovered via ADP can immediately speak A2A with any other
 * A2A-compliant agent.
 *
 * Spec: https://a2a-protocol.org/latest/
 */

/** A2A AgentCard — subset of the full spec, aligned with OpenIdentity manifest. */
export interface A2AAgentCard {
  /** Schema version, e.g. "1.0" */
  version: string;
  /** Protocol name — always "a2a" */
  protocol: "a2a";
  /** Agent metadata */
  name: string;
  description: string;
  url: string;
  /** Provider info */
  provider: {
    organization: string;
    url: string;
  };
  /** Capabilities this agent exposes */
  capabilities: {
    /** A2A task lifecycle methods this agent supports */
    methods: Array<
      "tasks/send" | "tasks/get" | "tasks/cancel" | "tasks/pushNotification" | "tasks/setPushNotification"
    >;
    /** Streaming support */
    streaming: boolean;
    /** Push notification support */
    pushNotifications: boolean;
    /** State transition history support */
    stateTransitionHistory: boolean;
  };
  /** Skill definitions (MCP-tool-like) */
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags?: string[];
    examples?: string[];
    inputModes: string[];
    outputModes: string[];
  }>;
  /** Security schemes — minimal DID-based auth */
  securitySchemes: Array<{
    id: string;
    type: "did" | "oauth2" | "apiKey";
    didMethod?: string;
    /** ADP session reference for the handshake */
    adpSessionRef?: string;
  }>;
  /** ADP extensions — the discovery-side metadata */
  "x-adp": {
    did: string;
    workspace: string;
    signalingEndpoint: string;
    mcpTools: string[];
    capabilities: string[];
  };
}

/** A2A Message — the unit of agent-to-agent communication. */
export interface A2AMessage {
  /** Unique message id */
  messageId: string;
  /** A2A protocol version */
  a2aVersion: string;
  /** Origin agent DID */
  sender: { agentId: string; name?: string };
  /** Target agent DID */
  recipient: { agentId: string };
  /** Message parts (text, file, data) */
  parts: A2APart[];
  /** Context — optional thread metadata */
  context?: {
    threadId?: string;
    parentMessageId?: string;
  };
  /** Custom ADP metadata — session/tool grants */
  "x-adp"?: {
    sessionId: string;
    toolsGranted?: string[];
    memoryGranted?: string[];
  };
}

/** A2A Part — text, file, or structured data */
export type A2APart =
  | { kind: "text"; text: string }
  | { kind: "file"; file: { name: string; mimeType: string; bytes?: string; uri?: string } }
  | { kind: "data"; data: Record<string, unknown> };

/** A2A Task — lifecycle state */
export interface A2ATask {
  id: string;
  status: A2ATaskStatus;
  artifacts?: unknown[];
  history?: Array<{ role: "agent" | "user"; message: A2AMessage }>;
  "x-adp"?: { sessionId: string };
}

export type A2ATaskStatus =
  | { state: "submitted" }
  | { state: "working"; message?: A2AMessage }
  | { state: "input-required"; message?: A2AMessage }
  | { state: "completed"; message?: A2AMessage }
  | { state: "canceled"; message?: A2AMessage }
  | { state: "failed"; error?: { code: number; message: string } };

/** ADP session → A2A AgentCard adapter */
export function adpSessionToAgentCard(input: {
  did: string;
  displayName: string;
  capabilities: { mcpTools: string[]; skills: string[]; models: string[] };
  workspace: string;
  signalingEndpoint: string;
}): A2AAgentCard {
  const { did, displayName, capabilities, workspace, signalingEndpoint } = input;

  const skills = capabilities.skills.map((skillName, i) => ({
    id: `skill-${i + 1}`,
    name: skillName,
    description: `${displayName} exposes the ${skillName} capability`,
    inputModes: ["text"],
    outputModes: ["text"],
    tags: ["adp", "skill"],
  }));

  const mcpTools = capabilities.mcpTools.map((tool, i) => ({
    id: `mcp-${i + 1}`,
    name: tool,
    description: `MCP tool: ${tool}`,
    inputModes: ["text"],
    outputModes: ["text"],
    tags: ["mcp"],
  }));

  return {
    version: "1.0",
    protocol: "a2a",
    name: displayName,
    description: `Agent ${displayName} (${did}) discovered via ADP`,
    url: signalingEndpoint,
    provider: {
      organization: "PAI",
      url: "https://axiomid.app",
    },
    capabilities: {
      methods: ["tasks/send", "tasks/get", "tasks/cancel"],
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: [...skills, ...mcpTools],
    securitySchemes: [
      {
        id: `did-${did.slice(0, 8)}`,
        type: "did",
        didMethod: "did:axiom",
        adpSessionRef: workspace,
      },
    ],
    "x-adp": {
      did,
      workspace,
      signalingEndpoint,
      mcpTools: capabilities.mcpTools,
      capabilities: capabilities.skills,
    },
  };
}

/** Build a well-formed A2A message from ADP session data */
export function createA2AMessage(input: {
  messageId?: string;
  senderDid: string;
  senderName?: string;
  recipientDid: string;
  parts: A2APart[];
  threadId?: string;
  sessionId?: string;
  toolsGranted?: string[];
}): A2AMessage {
  const genId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    messageId: input.messageId ?? genId(),
    a2aVersion: "0.2.1",
    sender: { agentId: input.senderDid, name: input.senderName },
    recipient: { agentId: input.recipientDid },
    parts: input.parts,
    context: input.threadId ? { threadId: input.threadId } : undefined,
    "x-adp": input.sessionId
      ? {
          sessionId: input.sessionId,
          toolsGranted: input.toolsGranted,
        }
      : undefined,
  };
}

/** Validate an A2A message minimally — returns error string or null */
export function validateA2AMessage(message: unknown): string | null {
  if (!message || typeof message !== "object") return "Message must be an object";
  const m = message as Partial<A2AMessage>;
  if (!m.messageId) return "Missing messageId";
  if (!m.a2aVersion) return "Missing a2aVersion";
  if (!m.sender?.agentId) return "Missing sender.agentId";
  if (!m.recipient?.agentId) return "Missing recipient.agentId";
  if (!Array.isArray(m.parts) || m.parts.length === 0) return "Missing parts array";
  return null;
}

/** Map an ADP session status to an A2A task status */
export function adpSessionToA2ATask(input: {
  sessionId: string;
  status: "pending" | "active" | "completed" | "revoked";
}): A2ATask {
  const statusMap: Record<string, A2ATaskStatus> = {
    pending: { state: "submitted" },
    active: { state: "working" },
    completed: { state: "completed" },
    revoked: { state: "canceled" },
  };
  return {
    id: `task-${input.sessionId}`,
    status: statusMap[input.status] ?? { state: "failed", error: { code: 500, message: "Unknown session status" } },
    "x-adp": { sessionId: input.sessionId },
  };
}
