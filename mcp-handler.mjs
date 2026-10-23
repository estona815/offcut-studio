import { randomUUID } from 'node:crypto';
export const PROTOCOL = '2025-11-25';
const empty = { type: 'object', properties: {}, additionalProperties: false };
const tools = [
  { name: 'inspect_workspace', description: 'Read the current synthetic fabric workspace, revision and recorded cuts.', inputSchema: empty, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'apply_command', description: 'Apply an explicit supported cutting/replanning command to this session. A cut records the user report; never infer physical completion. Inspect first and pass the observed revision. Repeating a marked piece does not deduct material again.', inputSchema: { type: 'object', properties: { command: { type: 'string', minLength: 1, maxLength: 300 }, expectedRevision: { type: 'integer', minimum: 0 } }, required: ['command', 'expectedRevision'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } }
];
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const toolResult = (state, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(state) }], structuredContent: state, isError });

/** Local, memory-only JSON-response Streamable HTTP transport. No cloud, disk writes or LLM. */
export function createMcpHandler({ createWorkspace, executeCommand, origin, now = Date.now }) {
  const sessions = new Map();
  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'Cache-Control': 'no-store', ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) });
    res.end(body ? JSON.stringify(body) : undefined);
  };
  return async (req, res) => {
    if (req.url?.split('?')[0] !== '/mcp') return false;
    const bad = (code, message, status = 400, id = null) => send(res, status, { jsonrpc: '2.0', id, error: { code, message } });
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) { bad(-32600, 'Origin or Host rejected', 403); return true; }
    for (const [id, s] of sessions) if (now() - s.seen > 30 * 60 * 1000) sessions.delete(id);
    const sid = req.headers['mcp-session-id'];
    const session = sessions.get(sid);
    if (req.headers['mcp-protocol-version'] && req.headers['mcp-protocol-version'] !== PROTOCOL) { bad(-32600, 'Unsupported protocol version'); return true; }
    if (sid && !session) { bad(-32600, 'Session expired or unknown', 404); return true; }
    if (req.method === 'DELETE') {
      if (!session) bad(-32600, 'Session required'); else { sessions.delete(sid); send(res, 204); }
      return true;
    }
    if (req.method !== 'POST') { send(res, 405, undefined, { Allow: 'POST, DELETE' }); return true; }
    if (!req.headers.accept?.includes('application/json') || !req.headers.accept?.includes('text/event-stream')) { bad(-32600, 'Accept must include application/json and text/event-stream', 406); return true; }
    if (!req.headers['content-type']?.startsWith('application/json')) { bad(-32600, 'application/json required', 415); return true; }
    let raw = '', size = 0, packet;
    try {
      for await (const chunk of req) { size += chunk.length; if (size > 8192) { bad(-32600, 'Request too large', 413); return true; } raw += chunk; }
      packet = JSON.parse(raw);
    } catch { bad(-32700, 'Invalid JSON'); return true; }
    if (!object(packet) || packet.jsonrpc !== '2.0' || typeof packet.method !== 'string' || (packet.id !== undefined && typeof packet.id !== 'string' && !Number.isSafeInteger(packet.id))) { bad(-32600, 'Invalid request'); return true; }
    const id = packet.id;
    const fail = (code, message) => bad(code, message, 200, id ?? null);
    const result = body => send(res, 200, { jsonrpc: '2.0', id, result: body });
    const p = packet.params ?? {};
    if (!object(p)) { fail(-32602, 'Invalid params'); return true; }
    if (packet.method === 'initialize') {
      if (id === undefined || session || typeof p.protocolVersion !== 'string' || !object(p.capabilities) || !object(p.clientInfo)) { bad(-32602, 'Invalid initialization'); return true; }
      if (sessions.size >= 32) { bad(-32000, 'Local session limit reached', 503); return true; }
      const key = randomUUID();
      sessions.set(key, { state: createWorkspace(), initialized: false, seen: now(), replay: new Map() });
      send(res, 200, { jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'offcut-local', version: '0.2.0' }, instructions: 'Synthetic session workspace. Inspect revision before explicit commands. Never infer a physical cut.' } }, { 'MCP-Session-Id': key });
      return true;
    }
    if (!session) { bad(-32600, 'Initialize a session first'); return true; }
    session.seen = now();
    if (id === undefined) {
      if (packet.method === 'notifications/initialized') session.initialized = true;
      send(res, 202); return true;
    }
    if (packet.method === 'ping') { result({}); return true; }
    if (!session.initialized) { fail(-32600, 'Send notifications/initialized first'); return true; }
    if (packet.method === 'tools/list') { result({ tools }); return true; }
    if (packet.method !== 'tools/call') { fail(-32601, 'Method not found'); return true; }
    const args = p.arguments ?? {};
    if (!object(args)) { fail(-32602, 'Arguments must be an object'); return true; }
    if (p.name === 'inspect_workspace') {
      if (Object.keys(args).length) fail(-32602, 'No arguments expected'); else result(toolResult(session.state));
      return true;
    }
    if (p.name !== 'apply_command') { fail(-32602, 'Unknown tool'); return true; }
    if (Object.keys(args).some(k => !['command', 'expectedRevision'].includes(k)) || typeof args.command !== 'string' || !args.command.trim() || args.command.length > 300 || !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) { fail(-32602, 'command and nonnegative expectedRevision required'); return true; }
    // Keep bounded request replay: response retries must never re-execute a mutation.
    const fingerprint = JSON.stringify(args), key = typeof id + ':' + id;
    const prior = session.replay.get(key);
    if (prior) { if (prior.fingerprint !== fingerprint) fail(-32600, 'Request id reused with different arguments'); else result(prior.output); return true; }
    let output;
    if (args.expectedRevision !== session.state.revision) output = toolResult({ error: 'STALE_REVISION', expected: session.state.revision, message: 'Inspect workspace before retrying. No command was applied.' }, true);
    else {
      session.state = executeCommand(session.state, args.command);
      output = toolResult(session.state);
    }
    session.replay.set(key, { fingerprint, output });
    if (session.replay.size > 128) session.replay.delete(session.replay.keys().next().value);
    result(output); return true;
  };
}
