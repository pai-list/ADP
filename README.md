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
| **CodeRabbit AI Review** | ✅ **Configured** | Automated PR reviews on every push |
| **Test Coverage** | 🔄 **In Progress** | Target: 80%+ coverage on protocol/signaling |

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
│   ├── a2a/             # Agent-to-Agent bridge
│   │   └── bridge.ts          # A2A protocol translation
```

---

## Quick Start

```bash
# Install
npm install

# Typecheck
npm run typecheck

# Lint
npm run lint

# Test (unit)
npm test

# Test with coverage
npm run test:coverage

# Test (e2e - requires Cloudflare dev)
npm run test:e2e

# Deploy (when ready)
wrangler deploy
```

---

## CI/CD Pipeline

The project uses a comprehensive CI pipeline with automated CodeRabbit AI reviews:

### Checks Run on Every PR

| Check | Description | Required |
|-------|-------------|----------|
| **Monorepo CI** | TypeScript build, lint, typecheck, tests via Turbo | ✅ |
| **CF Workers CI** | Cloudflare Workers build + preview deployment | ✅ |
| **Security Scan** | CodeQL + npm audit + dependency scanning | ✅ |
| **Dependency Audit** | Production dependency vulnerability scan | ✅ |
| **CodeRabbit Review** | AI-powered code review (security, perf, style) | ✅ |

### CodeRabbit Integration

- **Config:** `.coderabbit.yaml` - protocol-aware review rules
- **Auto-review:** Enabled on PR open and update
- **Categories:** Security, Performance, Correctness, Style, Best Practices, Documentation, Testing
- **Path-specific rules:** Signaling, Protocol, Identity, Discovery, Sharing, A2A

### Branch Protection

Required status checks (configured in GitHub):
- `Monorepo CI (Turbo)`
- `CF Workers CI`
- `Security Scan`
- `Dependency Audit`
- `CodeRabbit Review`

---

## Testing Strategy

### Unit Tests (`tests/`)
- **Room.test.ts** - Durable Object room state management
- **a2a-bridge.test.ts** - A2A protocol translation
- **mocks/** - Shared test fixtures and mocks

### Coverage Targets
- **Protocol layer:** 90%+ (critical for interoperability)
- **Signaling layer:** 80%+ (WebSocket lifecycle, auth)
- **Identity layer:** 85%+ (crypto operations, DID ops)
- **Overall:** 80%+ minimum

### Running Tests Locally

```bash
# Unit tests with coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch

# E2E tests (requires wrangler dev running)
npm run test:e2e
```

### Writing Tests

Follow these patterns:

```typescript
// tests/protocol/messages.test.ts
import { describe, it, expect } from 'vitest';
import { MessageSchema, SessionMessage } from '../src/protocol/messages';

describe('Protocol Messages', () => {
  it('should validate session initiation message', () => {
    const msg = {
      type: 'session.init',
      payload: { agentId: 'did:example:agent1', capabilities: ['discovery'] }
    };
    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should reject invalid message type', () => {
    const msg = { type: 'invalid.type', payload: {} };
    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});
```

### Test Conventions

- Use `describe`/`it` from `vitest`
- Test file naming: `*.test.ts` (unit), `*.e2e.test.ts` (e2e)
- Mock external dependencies (Cloudflare bindings, crypto)
- Test both success and error paths
- Use `setup.ts` for global test configuration

---

## Deployment

- **Platform:** Cloudflare Workers + Durable Objects
- **Domain:** `adp.axiomid.app` (pending `axiomid.app` domain)
- **DNS:** Cloudflare (proxied)

### Preview Deployments

Every PR gets a preview deployment via Cloudflare Workers CI:
- Unique preview URL per PR
- Automated smoke tests against preview
- Preview URL posted as PR comment

---

## CodeRabbit Review Guidelines

CodeRabbit reviews focus on ADP-specific concerns:

### Security (High Priority)
- Cryptographic operations (constant-time, proper entropy)
- Input validation on all protocol messages
- Authorization checks on signaling handlers
- No secrets in code or logs

### Protocol Correctness (High Priority)
- Zod schema validation matches spec
- Message type discrimination exhaustive
- Session state machine handles all transitions
- Capability grants respect consent boundaries

### Performance (Medium Priority)
- Durable Object state access patterns
- WebSocket message batching
- Memory grant/revoke efficiency

### Style & Best Practices (Standard)
- TypeScript strict mode compliance
- ESLint rules (no-explicit-any, consistent imports)
- Import ordering
- No console.log in production paths

---

## Contributing

1. Fork and create feature branch
2. Run `npm run typecheck && npm run lint && npm test` locally
3. Push - CI runs automatically including CodeRabbit review
4. Address all CI failures and CodeRabbit findings
5. PR requires: All checks green + CodeRabbit "No findings" or acknowledged

---

## License

MIT — Free for all agents, all humans, all purposes.

---

*Part of the PAI Universe. Discovery + collaboration layer for AI agents.*