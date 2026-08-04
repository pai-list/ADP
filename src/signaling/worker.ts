// Minimal WebSocket test worker with DO export
export class ADPRoom {
  // Minimal DO for migration compatibility
  async fetch(request: Request): Promise<Response> {
    return new Response('DO not used in test');
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      const webSocketPair = new WebSocketPair();
      const client = webSocketPair[0];
      const server = webSocketPair[1];
      
      server.accept();
      
      server.addEventListener('message', (event) => {
        server.send(`Echo: ${event.data}`);
      });
      
      server.addEventListener('close', () => {
        console.log('WebSocket closed');
      });
      
      ctx.waitUntil(new Promise<void>((resolve) => {
        server.addEventListener('close', () => {
          console.log('WebSocket closed');
          resolve();
        });
      }));
      
      return new Response(null, { status: 101, webSocket: client });
    }
    
    return new Response('Send WebSocket upgrade', { status: 200 });
  }
};