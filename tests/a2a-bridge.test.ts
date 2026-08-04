/**
 * ADP ↔ A2A bridge tests
 */
import { describe, it, expect } from 'vitest';
import {
  adpSessionToAgentCard,
  createA2AMessage,
  validateA2AMessage,
  adpSessionToA2ATask,
  type A2AMessage,
} from '../src/a2a/bridge.js';

const sampleAgent = {
  did: 'did:axiom:test123',
  displayName: 'TestAgent',
  capabilities: {
    mcpTools: ['get_weather', 'search'],
    skills: ['discovery', 'code-review'],
    models: ['qwen-72b'],
  },
  workspace: 'alpha',
  signalingEndpoint: 'wss://adp.axiomid.app/ws',
};

describe('adpSessionToAgentCard', () => {
  it('produces a valid A2A AgentCard', () => {
    const card = adpSessionToAgentCard(sampleAgent);
    expect(card.protocol).toBe('a2a');
    expect(card.version).toBe('1.0');
    expect(card.name).toBe('TestAgent');
    expect(card.capabilities.methods).toContain('tasks/send');
    expect(card.skills.length).toBe(4); // 2 skills + 2 mcp tools
    expect(card.securitySchemes[0].type).toBe('did');
    expect(card['x-adp'].did).toBe('did:axiom:test123');
    expect(card['x-adp'].workspace).toBe('alpha');
  });

  it('includes MCP tools as skills with mcp tags', () => {
    const card = adpSessionToAgentCard(sampleAgent);
    const mcpSkills = card.skills.filter((s) => s.tags?.includes('mcp'));
    expect(mcpSkills.map((s) => s.name)).toEqual(['get_weather', 'search']);
  });
});

describe('createA2AMessage', () => {
  it('builds a well-formed message with ADP extension', () => {
    const msg = createA2AMessage({
      senderDid: 'did:axiom:a',
      senderName: 'Agent A',
      recipientDid: 'did:axiom:b',
      parts: [{ kind: 'text', text: 'hello' }],
      sessionId: 'sess-1',
      toolsGranted: ['search'],
    });
    expect(msg.a2aVersion).toBe('0.2.1');
    expect(msg.sender.agentId).toBe('did:axiom:a');
    expect(msg.recipient.agentId).toBe('did:axiom:b');
    expect(msg.parts[0]).toEqual({ kind: 'text', text: 'hello' });
    expect(msg['x-adp']?.sessionId).toBe('sess-1');
    expect(msg['x-adp']?.toolsGranted).toEqual(['search']);
  });

  it('generates messageId when not provided', () => {
    const msg = createA2AMessage({
      senderDid: 'did:axiom:a',
      recipientDid: 'did:axiom:b',
      parts: [{ kind: 'text', text: 'hi' }],
    });
    expect(msg.messageId).toBeTruthy();
  });
});

describe('validateA2AMessage', () => {
  it('accepts a valid message', () => {
    const msg = createA2AMessage({
      senderDid: 'did:axiom:a',
      recipientDid: 'did:axiom:b',
      parts: [{ kind: 'text', text: 'hi' }],
    });
    expect(validateA2AMessage(msg)).toBeNull();
  });

  it('rejects missing parts', () => {
    const bad = { messageId: '1', a2aVersion: '0.2.1', sender: { agentId: 'a' }, recipient: { agentId: 'b' } };
    expect(validateA2AMessage(bad)).toContain('parts');
  });

  it('rejects non-objects', () => {
    expect(validateA2AMessage(null)).toContain('object');
    expect(validateA2AMessage('nope')).toContain('object');
  });
});

describe('adpSessionToA2ATask', () => {
  it('maps session states to A2A task states', () => {
    expect(adpSessionToA2ATask({ sessionId: 's1', status: 'pending' }).status.state).toBe('submitted');
    expect(adpSessionToA2ATask({ sessionId: 's2', status: 'active' }).status.state).toBe('working');
    expect(adpSessionToA2ATask({ sessionId: 's3', status: 'completed' }).status.state).toBe('completed');
    expect(adpSessionToA2ATask({ sessionId: 's4', status: 'revoked' }).status.state).toBe('canceled');
  });

  it('carries the ADP session reference', () => {
    const task = adpSessionToA2ATask({ sessionId: 'sess-x', status: 'active' });
    expect(task['x-adp']?.sessionId).toBe('sess-x');
  });
});
