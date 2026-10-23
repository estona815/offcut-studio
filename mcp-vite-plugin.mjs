import { createMcpHandler } from './mcp-handler.mjs';
export default function offcutMcp() {
  return { name: 'offcut-local-mcp', configureServer(server) {
    let handlerPromise;
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== '/mcp') return next();
      try {
        if (!handlerPromise) {
          handlerPromise = (async () => {
          const [{ createWorkspace }, { executeCommand }] = await Promise.all([
            server.ssrLoadModule('/src/state/workspace.ts'), server.ssrLoadModule('/src/state/commands.ts')
          ]);
          const port = server.config.server.port;
          return createMcpHandler({ createWorkspace, executeCommand, origin: `http://127.0.0.1:${port}` });
          })().catch(error => { handlerPromise = undefined; throw error; });
        }
        await (await handlerPromise)(req, res);
      } catch (error) { server.config.logger.error(String(error)); if (!res.headersSent) res.writeHead(500); res.end('Local MCP failure'); }
    });
  } };
}
