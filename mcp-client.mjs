const $ = id => document.getElementById(id);
let session, revision, counter = 0;
function log(line) { $('trace').textContent += `${line}\n`; }
function render(state) {
  revision = state.revision;
  $('status').textContent = state.message;
  $('summary').textContent = `Revision ${revision} · ${state.cuts.length} recorded cuts · Recovery ${state.pendingRecovery ? 'needed' : 'not needed'}`;
  drawLayout(state);
  $('workspace').textContent = JSON.stringify({ pieces: state.plan.pieces, cuts: state.cuts, remainingScraps: state.scraps }, null, 2);
}
async function rpc(method, params, notification = false) {
  const id = notification ? undefined : ++counter;
  const response = await fetch('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(session ? { 'MCP-Session-Id': session, 'MCP-Protocol-Version': '2025-11-25' } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }) });
  log(`${method}${params?.name ? ' → ' + params.name : ''}: HTTP ${response.status}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  session = response.headers.get('MCP-Session-Id') || session;
  if (notification) return;
  let packet;
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    while (!packet) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        if (data) { const parsed = JSON.parse(data); if (parsed.id === id) packet = parsed; }
      }
    }
    await reader.cancel();
  } else packet = await response.json();
  if (!packet || packet.id !== id || packet.error) throw new Error(packet?.error?.message || 'Missing matching response');
  if (packet.result.isError) throw new Error(packet.result.content[0].text);
  return packet.result;
}
async function busy(action) {
  for (const id of ['connect','inspect','send']) $(id).disabled = true;
  try { await action(); } catch (error) { $('status').textContent = String(error.message); }
  finally { $('connect').disabled = !!session; $('inspect').disabled = !session; $('send').disabled = !Number.isSafeInteger(revision); }
}
$('connect').onclick = () => busy(async () => {
  const result = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'offcut-browser', version: '0.2.0' } });
  if (result.protocolVersion !== '2025-11-25') throw new Error('Unsupported protocol');
  await rpc('notifications/initialized', {}, true);
  const listing = await rpc('tools/list', {});
  $('tools').replaceChildren(...listing.tools.map(t => { const li = document.createElement('li'); li.textContent = `${t.name}: ${t.description}`; return li; }));
  render((await rpc('tools/call', { name: 'inspect_workspace', arguments: {} })).structuredContent);
});
$('inspect').onclick = () => busy(async () => render((await rpc('tools/call', { name: 'inspect_workspace', arguments: {} })).structuredContent));
$('command-form').onsubmit = event => { event.preventDefault(); return busy(async () => render((await rpc('tools/call', { name: 'apply_command', arguments: { command: $('command').value, expectedRevision: revision } })).structuredContent)); };

function drawLayout(state) {
  const ns = 'http://www.w3.org/2000/svg';
  const figures = state.scraps.map(scrap => {
    const figure = document.createElement('figure'), caption = document.createElement('figcaption');
    caption.textContent = scrap.name + ' · solid = remaining material; dashed = planned piece';
    const svg = document.createElementNS(ns, 'svg');
    const placements = state.plan.placements.filter(p => p.scrapId === scrap.id);
    const points = [...scrap.geometry.flat(2), ...placements.flatMap(p => p.polygon)];
    const width = Math.max(1, ...points.map(p => p[0])), height = Math.max(1, ...points.map(p => p[1]));
    svg.setAttribute('viewBox', `-5 -5 ${width + 10} ${height + 10}`);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', scrap.name + ' remaining material and planned pieces');
    for (const polygon of scrap.geometry) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', polygon.map(ring => ring.map((p,i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + ' Z').join(' '));
      path.setAttribute('fill-rule','evenodd'); path.setAttribute('fill', scrap.color); path.setAttribute('stroke','#333'); svg.append(path);
    }
    for (const placement of placements) {
      if (state.cuts.some(c => c.piece.id === placement.pieceId)) continue;
      const shape = document.createElementNS(ns, 'polygon');
      shape.setAttribute('points', placement.polygon.map(p => p.join(',')).join(' '));
      shape.setAttribute('fill','none'); shape.setAttribute('stroke',state.pendingRecovery ? '#a42020' : '#111');
      shape.setAttribute('stroke-dasharray','4 3'); shape.setAttribute('stroke-width','1.5');
      const title = document.createElementNS(ns,'title'); title.textContent=placement.pieceId; shape.append(title);svg.append(shape);
    }
    figure.append(caption, svg);return figure;
  });
  $('layout').replaceChildren(...figures);
}
