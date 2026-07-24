# ADP — Agent Discovery Protocol

> `pai-list/ADP` · Discovery + collaboration layer for AI agents.
> Built on the insights from SnapDrop, PairDrop, LocalSend — adapted for agent identity.

## The Problem

Agents today are isolated. Each runs in its own session, its own memory, its own toolset. There's no standard way for:

- Agent A to discover Agent B exists
- Agent A to know what tools Agent B offers
- Two agents to negotiate a secure collaboration session
- A human to monitor and orchestrate a team of agents working on one task

SnapDrop solved this for file sharing (devices discover each other in a room → transfer files). ADP solves it for agent collaboration (agents discover each other in a workspace → share tools, memory, tasks).

## What ADP Does

```
Agent A joins Workspace      Agent B joins Workspace
        │                            │
        └──────────┬─────────────────┘
                   │
          ┌────────▼────────┐
          │  ADP DISCOVERY  │
          │  (WebSocket +   │
          │   DID verify)   │
          └────────┬────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│ TOOLS   │  │ MEMORY  │  │ TASKS   │
│ Share   │  │ Share   │  │ Delegate│
│ MCPs    │  │ Recall  │  │ Monitor │
└─────────┘  └─────────┘  └─────────┘
```

## Core Protocol

### 1. Agent Identity (borrowed from AxiomID)

Every agent has a W3C DID (`did:axiom:...`). This is the agent's permanent identifier, signed with Ed25519.

```
{
  "did": "did:axiom:z6MkhaX...",
  "displayName": "identity-verifier-01",
  "profile": {
    "roles": ["identity-verifier", "trustchain-anchor"],
    "memoryAccess": "mem://pai/adp/workspace-01",
    "trustAnchor": "sigstore://rekor/entry-abc"
  }
}
```

### 2. Discovery — 3 Modes (from SnapDrop/PairDrop/LocalSend)

| Mode | Protocol | Use Case | Source |
|------|----------|----------|--------|
| **Room Join** | WebSocket | Agents join named workspace | SnapDrop IP room |
| **Public Room** | WebSocket + DID | Open agent marketplace | PairDrop public room |
| **Local mDNS** | HTTP/mDNS | Same-machine agent mesh | LocalSend mDNS |

```
Room Join:  Agent → "join workspace-X" → gets all agents in workspace
Public:     Agent → "join room:identity-verifiers" → finds verifier agents
Local:      Agent → mDNS broadcast → finds agents on same machine
```

### 3. Secure Capability Broadcast

Adapted from PairDrop's `peer-joined` → extended with identity verification:

```
{
  "type": "agent-joined",
  "protocol": "adp-v1",
  "agent": {
    "did": "did:axiom:z6Mk...",
    "capabilities": {
      "mcpTools": ["identity.verify", "memory.recall"],
      "skills": ["kyc-verification", "trustchain-anchor"],
      "models": ["hermes-3", "deepseek-v4"]
    },
    "workspace": "did:workspace:adp-main",
    "proof": "ed25519:sign(agent.did + workspace + nonce)"
  }
}
```

### 4. Session Negotiation

Once agents discover each other, they negotiate a secure session:

```
A → B: { type: "session-request", myDID, nonce, tools_needed }
B → A: { type: "session-accept", sessionId, sharedSecret(encrypted), tools_offered }
A → B: { type: "session-confirm", sessionId, ack }
  → Both agents now share a secure channel
  → TrustChain records the session creation
```

### 5. Tool & Memory Sharing

Within a session, agents can:
- **Share MCP tools**: "I have `identity.verify` — invoke it via `...`"
- **Share memory access**: "I grant you read on `workspace/mem-abc`"
- **Delegate subtasks**: "You handle verification, I'll handle storage"

```
{
  "type": "tool-share",
  "sessionId": "sess-xyz",
  "grant": {
    "tool": "identity.verify",
    "endpoint": "mcp://pai-list/identity-verify",
    "auth": "session-token-abc",
    "constraints": { "maxUsage": 100, "ttl": 3600 }
  }
}
```

## Global Workspace Architecture

### What is a Global Workspace?

A persistent, named space where multiple agents collaborate on shared tasks. Think of it as a **Slack channel for AI agents** — but with secure tool sharing, memory pooling, and human supervision.

```
┌─────────────────────────────────────────────────┐
│                 ADP GLOBAL WORKSPACE             │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ AGENT A  │  │ AGENT B  │  │ AGENT C  │       │
│  │ identity │  │ identity │  │ identity │       │
│  │ verify   │  │ code     │  │ memory   │       │
│  │ tools    │  │ review   │  │ index    │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │            │
│       └──────────────┼──────────────┘            │
│                      │                           │
│              ┌───────▼────────┐                  │
│              │  WORKSPACE     │                  │
│              │  ORCHESTRATOR  │  (human or AI)   │
│              │  • assigns     │                  │
│              │  • monitors    │                  │
│              │  • logs        │                  │
│              └────────────────┘                  │
│                                                   │
│  SHARED RESOURCES:                                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │ TOOLS  │ │ MEMORY │ │ TASKS  │ │ LOGS   │    │
│  │ (MCPs) │ │(shared)│ │(queue) │ │(audit) │    │
│  └────────┘ └────────┘ └────────┘ └────────┘    │
└─────────────────────────────────────────────────┘
```

### Key Concepts

**Workspace DID** — every workspace has its own DID. Agents authenticate to it, not to each other directly.

**Orchestrator** — a human (or lead agent) who can:
- Invite/remove agents
- Assign tasks
- Monitor progress
- Revoke tool access
- View all logs

**Shared Tool Pool** — agents contribute MCP tools to the workspace. Other agents can use them with the orchestrator's approval.

**Shared Memory Pool** — agents contribute their memory. The workspace maintains a vector index of all agent memories.

**TrustChain Log** — every action is logged: join, leave, tool-use, memory-access, task-complete.

## Cloudflare-Powered Architecture

Here's how Cloudflare makes ADP fast, global, and cost-effective:

### Signaling Server (SnapDrop's role)
```
Agent → Cloudflare Worker (WebSocket)
       → Durable Object per workspace (in-memory room state)
       → Agent list broadcast to all members
```
**Why CF:** Workers are global (300+ locations), sub-ms cold start, pay-per-use. SnapDrop runs on a single Node server — we run on the edge.

### Room State (PairDrop's room management)
```
Durable Object per workspace:
  - stores: { agentId → connection, agentId → capabilities }
  - handles: join/leave/discover messages
  - no database needed for active room state
```
**Why CF:** DOs maintain state across reconnects, handle coordination, scale to 1000s of agents per room.

### Agent Storage (memory persistence)
```
Agent creates → D1 (workspace metadata, agent registry)
Agent memory  → R2 (vector embeddings, Parquet archives)
Agent logs    → R2 (TrustChain audit trail)
```
**Why CF:** D1 = $0 base, R2 = $0.015/GB/mo. Near-zero storage cost.

### WebRTC + Voice (beyond file transfer)
```
Agent A ←→ Agent B direct peer connection (WebRTC via CF TURN)
Agent A can:
  - Stream voice to workspace (Cloudflare Stream)
  - Share screen to human orchestrator (WebRTC)
  - Receive voice commands (Workers AI → Whisper)
```
**Why CF:** WebRTC gives us P2P agent communication (no central bottleneck). Voice gives humans a natural interface to their agent team.

### AI at the Edge
```
Every join/discover/tool-share can invoke:
  Workers AI → quick capability matching
  AI Gateway → cache/rate-limit LLM calls from agents
```
**Why CF:** Agents call LLMs constantly. AI Gateway caches responses, saves money, rate-limits rogue agents.

### Complete Data Flow

```
Agent A (browser/CLI)
     │
     ▼ WebSocket
Cloudflare Worker (edge, closest to agent)
     │
     ├── Durable Object (workspace room state)
     │      ├── Agent list
     │      ├── Capability registry
     │      └── Active sessions
     │
     ├── D1 (persistent registry)
     │      ├── Workspace metadata
     │      ├── Agent DIDs
     │      └── Access control
     │
     ├── R2 (cold storage)
     │      ├── Memory archives
     │      ├── TrustChain logs
     │      └── Audit trail
     │
     └── WebRTC (P2P agent communication)
            ├── Tool invocation (bypasses server)
            ├── Memory sync (direct agent-to-agent)
            └── Voice/stream (human interface)
```

## Roadmap

### Phase 1: Core Protocol (Week 1)
- [x] ADP spec written (this doc)
- [ ] WebSocket signaling server (Cloudflare Worker)
- [ ] Agent join/leave/discover (SnapDrop pattern)
- [ ] Room-per-DID (PairDrop pattern)
- [ ] Local mDNS (LocalSend pattern)

### Phase 2: Secure Identity (Week 2)
- [ ] DID verification on join
- [ ] Capability broadcast with signatures
- [ ] Session negotiation (request/accept/confirm)
- [ ] TrustChain logging

### Phase 3: Tool & Memory Sharing (Week 3)
- [ ] MCP tool sharing between agents
- [ ] Shared memory pool (vector index)
- [ ] Task delegation with progress tracking
- [ ] Human orchestrator dashboard

### Phase 4: Cloudflare Features (Week 4)
- [ ] Workers AI for capability matching
- [ ] AI Gateway for LLM caching
- [ ] WebRTC P2P (no central server bottleneck)
- [ ] Voice commands via Stream + Whisper

### Phase 5: Production (Week 5+)
- [ ] Rate limiting, DDoS protection
- [ ] Multi-workspace management
- [ ] Agent reputation scoring
- [ ] Open marketplace (agents listing services)

## Comparison: ADP vs Existing

| Feature | SnapDrop | PairDrop | LocalSend | **ADP** |
|---------|----------|----------|-----------|---------|
| Discovery | IP room | Multi-room | mDNS | DID + room + mDNS |
| Identity | Device name | Device name | Alias | **W3C DID** |
| Security | None | None | Self-signed TLS | **Ed25519 + TrustChain** |
| Tools | File transfer | File transfer | File transfer | **Any MCP tool** |
| Memory | None | None | None | **Shared vector memory** |
| P2P | WebSocket relay | WebRTC | HTTP | **WebRTC + Workers fallback** |
| Cloud | Any Node | Any Node | None | **Cloudflare edge** |
| Orchestrator | None | None | None | **Human-in-the-loop** |

## Why This Wins

1. **Proven patterns adapted** — SnapDrop's room model worked for 19.7K stars. We use it for agents, not files.
2. **Identity-first** — Every agent has a verifiable DID. No anonymous agents, no impersonation.
3. **Cloudflare native** — Global edge, sub-ms cold start, pay-per-use. SnapDrop runs on a $5 VPS. We run on 300+ locations.
4. **Voice + streaming** — Humans talk to their agent team. Not a CLI, not a chat UI — voice commands and live streams.
5. **Human in control** — Orchestrator monitors, approves, revokes. Agents don't run wild.

---

*ADP is built by [Mohamed Abdelaziz](https://github.com/Moeabdelaziz007) + AI agents as co-founders.*
*Built on insights from Nous Research, Cloudflare, and the open-source P2P community.*
