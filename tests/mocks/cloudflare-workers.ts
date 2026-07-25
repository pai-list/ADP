// Mock for Cloudflare Workers types - minimal re-exports to avoid conflicts
// Use types from @cloudflare/workers-types

// Re-export needed types - use type-only imports to avoid conflicts
export type {
  Env,
  D1Database,
  D1PreparedStatement,
  D1Result,
  KVNamespace,
  DurableObjectNamespace,
  DurableObjectId,
  DurableObjectStub,
  DurableObjectState,
  DurableObjectStorage,
  Ai,
} from '@cloudflare/workers-types';

// Add any custom types needed for testing
export interface DurableObjectTransaction {
  get<T = unknown>(key: string): Promise<any | undefined>;
  get<T = unknown>(keys: string[]): Promise<Map<string, any>>;
  list<T = unknown>(options?: { start?: string; end?: string; limit?: number; reverse?: boolean }): Promise<Map<string, any>>;
  put<T>(key: string, value: T, options?: { allowUnconfirmed?: boolean }): Promise<void>;
  delete(key: string): Promise<void>;
}

// Mock the crypto object for tests
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
    subtle: {
      digest: async () => new ArrayBuffer(32),
      sign: async () => new ArrayBuffer(64),
      importKey: async () => ({}),
    }
  },
  writable: true,
  configurable: true
});

// Mock DurableObject base class for testing
export class DurableObject<Env = any, Props = {}> {
  protected ctx: any;
  protected env: Env;
  
  constructor(ctx: any, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}