<div align="center">

```ascii
 ╔═══════════════════════════════════════════════════════════════════════════╗
 ║   _  _  _  _  _  ____  _  _  _  _  _  ____  ____  _  _  ____  ____  ____  ║
 ║  / )( \( \/ )( \/ ___)( \/ )( \/ )( \/ ___)(  _ \( \/ )/ ___)/ ___)(  _ \ ║
 ║  ) __ ( )  (  ) )\___ \ )  /  )  (  ) )\___ \ ) __/ )  / \___ \\___ \ ) __/ ║
 ║  \_)(_/(_/\_)(_/ (____/(_/   (_/\_)(_/ (____/(__)  (_/  (____/(____/(__)   ║
 ║                                                                           ║
 ║                 A X I O M  I D  |  P A I  U N I V E R S E                 ║
 ╚═══════════════════════════════════════════════════════════════════════════╝
```

</div>
# ADP — Agent Discovery Protocol

> **Discovery + collaboration layer for AI agents.** Built on insights from SnapDrop, PairDrop, LocalSend — adapted for agent identity.

---

## Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Signaling (Worker + DO)** | 🔄 **In Progress** | WebSocket signaling, room state, auth |
| **Protocol (messages, session, capability)** | 🔄 **In Progress** | Core protocol types & validation |
| **Identity (DID, keys, verification)** | 🔄 **In Progress** | W3C DID, Ed25519, DID verification |
| **Discovery (room, public, mDNS)** | ⏳ **Planned** | SnapDrop/PairDrop/LocalSend patterns |
| **Sharing (tools, memory)** | ⏳ **Planned** | MCP tool sharing, memory access grants |
| **Deployment** | ⏳ **Planned** | Cloudflare Worker + Durable Object |

---

## Architecture

```
pai-list/ADP/
├── src/
│   ├── signaling/         # WebSocket signaling server
│   │   ├── worker.ts          # Cloudflare Worker entry
│   │   ├── room.ts            # Room state (Durable Object)
│   │   ├── handler.ts         # Message handlers
│   │   └── auth.ts            # DID verification
│   ├── protocol/        # Core protocol
│   │   ├── messages.ts        # Message types & validation
│   │   ├── session.ts         # Session negotiation
│   │   ├── capability.ts      # Capability broadcast
│   │   └── transport.ts       # WebSocket/WebRTC/mDNS
│   ├── identity/        # Agent identity
│   │   ├── did.ts             # W3C DID operations
│   │   ├── keys.ts            # Ed25519 key management
│   │   └── verification.ts    # DID verification
│   ├── discovery/       # Discovery modes
│   │   ├── room.ts            # Room join (SnapDrop pattern)
│   │   ├── public.ts          # Public rooms (PairDrop pattern)
│   │   └── mdns.ts            # Local mDNS (LocalSend pattern)
│   ├── sharing/         # Tool & memory sharing
│   │   ├── tools.ts           # MCP tool sharing
│   │   ├── memory.ts          # Memory access grants
│   │   └── ...
```

---

## Quick Start

```bash
# Install
npm install

# Typecheck
npm run typecheck

# Test
npm test

# Deploy (when ready)
wrangler deploy
```

---

## Deployment

- **Platform:** Cloudflare Workers + Durable Objects
- **Domain:** `adp.axiomid.app` (pending `axiomid.app` domain)
- **DNS:** Cloudflare (proxied)

---

## License

MIT — Free for all agents, all humans, all purposes.

---

*Part of the PAI Universe. Discovery + collaboration layer for AI agents.*