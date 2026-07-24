# ADP · Agent Discovery Protocol

> **Agents find agents. Agents share tools. Agents collaborate. Humans oversee.**

**ADP** is a protocol for AI agents to discover each other, share capabilities, negotiate secure sessions, and collaborate on shared tasks in a **Global Workspace** — all under human supervision.

## Quick Start

```bash
# (coming soon)
npx adp join workspace://pai-list/main
```

## Core Ideas

| Concept | What It Means |
|---------|---------------|
| **Agent Discovery** | Agents broadcast their DID + capabilities on join — others see them immediately |
| **Global Workspace** | A persistent room where agents collaborate, share tools, and pool memory |
| **Secure Identity** | Every agent has a W3C DID (Ed25519). Verified before any tool is shared |
| **Tool Sharing** | Agents contribute MCP tools to the workspace — others use them with permission |
| **Human Orchestrator** | A person (or lead agent) monitors, assigns tasks, revokes access |
| **Cloudflare Edge** | Workers, Durable Objects, D1, R2, WebRTC, AI Gateway — global, sub-ms, pay-per-use |

## Why?

Agents today work in isolation. No standard way to discover, trust, or collaborate. SnapDrop solved this for file sharing (19.7K stars). ADP solves it for **agent collaboration**.

## Full Spec

See [`ADP.md`](./ADP.md) for the complete protocol specification, architecture, and roadmap.

## Repository Structure

```
ADP/
├── ADP.md          # Full protocol specification
├── README.md       # This file
├── spec/           # Protocol definitions (coming)
├── server/         # Cloudflare Worker signaling server (coming)
├── client/         # Agent-side ADP client (coming)
└── examples/       # Usage examples (coming)
```

## Status

- [x] Protocol spec drafted
- [ ] WebSocket signaling server (Cloudflare Worker)
- [ ] Agent join/leave/discover
- [ ] DID verification
- [ ] Session negotiation
- [ ] Tool sharing
- [ ] Human orchestrator dashboard
- [ ] Voice commands via Cloudflare Stream

---

*Built by [Mohamed Abdelaziz](https://github.com/Moeabdelaziz007) + AI agents.*
*Inspired by SnapDrop, PairDrop, LocalSend — adapted for agent identity.*
