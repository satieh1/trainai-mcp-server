import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const API_BASE = process.env.TRAINAI_API_BASE || 'https://trainai-tools.onrender.com';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

// Helpers
async function getJSON(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

// MCP server
const server = new Server({ name: 'trainai-tools', version: '1.0.0' });

server.tool('crawl',
  {
    description: 'Crawl app DOM to discover routes, selectors, and snippets.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, depth: { type: 'integer', default: 1 } },
      required: ['url']
    }
  },
  async ({ url, depth = 1 }) => {
    const u = new URL(`${API_BASE}/crawl`); u.searchParams.set('url', url); u.searchParams.set('depth', String(depth));
    return { content: [{ type: 'json', json: await postJSON(u.toString(), {}) }] };
  }
);

server.tool('doc_search',
  {
    description: 'Search documentation chunks for a query.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  },
  async ({ query }) => {
    const u = new URL(`${API_BASE}/doc_search`); u.searchParams.set('query', query);
    return { content: [{ type: 'json', json: await getJSON(u.toString()) }] };
  }
);

server.tool('evaluate',
  {
    description: 'Validate a selector against a route.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' }, route: { type: 'string' } }, required: ['selector','route'] }
  },
  async ({ selector, route }) => {
    const u = new URL(`${API_BASE}/evaluate`); u.searchParams.set('selector', selector); u.searchParams.set('route', route);
    return { content: [{ type: 'json', json: await getJSON(u.toString()) }] };
  }
);

server.tool('persist_flow',
  { description: 'Persist a discovered Train.ai flow.', inputSchema: { type: 'object', additionalProperties: true } },
  async (flowObj) => ({ content: [{ type: 'json', json: await postJSON(`${API_BASE}/persist_flow`, flowObj) }] })
);

server.tool('get_flow',
  { description: 'Fetch a flow by id.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  async ({ id }) => ({ content: [{ type: 'json', json: await getJSON(`${API_BASE}/flows/${id}`) }] })
);

server.tool('list_flows',
  { description: 'List flows.', inputSchema: { type: 'object', properties: {} } },
  async () => ({ content: [{ type: 'json', json: await getJSON(`${API_BASE}/flows`) }] })
);

// Expose MCP over SSE
const transport = new SSEServerTransport('/mcp');
transport.attach(server, app);

// Health
app.get('/', (_req, res) => res.send('trainai-mcp-server up'));

// Start
app.listen(PORT, () => {
  console.log(`MCP HTTP server listening on :${PORT} (API_BASE=${API_BASE})`);
});
