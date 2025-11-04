// server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const API_BASE = process.env.TRAINAI_API_BASE || 'https://trainai-tools.onrender.com';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

// ----- MCP server -----
const mcp = new McpServer({
  name: 'trainai-tools',
  version: '1.0.0',
});

// Helper to POST/GET to your FastAPI
async function getJSON(url) {
  const r = await fetch(url, { method: 'GET', headers: { 'accept': 'application/json' }});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status} ${r.statusText} :: ${text}`);
  }
  return await r.json();
}

// ---- Tools exposed to Agent Builder ----
mcp.tool('crawl', {
  description: 'Crawl app DOM to discover routes, selectors, snippets.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      depth: { type: 'integer', default: 1 }
    },
    required: ['url']
  },
  handler: async ({ url, depth = 1 }) => {
    const u = new URL(`${API_BASE}/crawl`);
    u.searchParams.set('url', url);
    u.searchParams.set('depth', String(depth));
    const res = await postJSON(u.toString(), {}); // POST with query params (matches FastAPI)
    return { content: [{ type: 'json', json: res }] };
  }
});

mcp.tool('doc_search', {
  description: 'Search documentation chunks',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  },
  handler: async ({ query }) => {
    const u = new URL(`${API_BASE}/doc_search`);
    u.searchParams.set('query', query);
    const res = await getJSON(u.toString());
    return { content: [{ type: 'json', json: res }] };
  }
});

mcp.tool('evaluate', {
  description: 'Validate a selector/route pair',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      route: { type: 'string' }
    },
    required: ['selector', 'route']
  },
  handler: async ({ selector, route }) => {
    const u = new URL(`${API_BASE}/evaluate`);
    u.searchParams.set('selector', selector);
    u.searchParams.set('route', route);
    const res = await getJSON(u.toString());
    return { content: [{ type: 'json', json: res }] };
  }
});

mcp.tool('persist_flow', {
  description: 'Persist a discovered Train.ai flow',
  inputSchema: { type: 'object', additionalProperties: true },
  handler: async (flowObj) => {
    const res = await postJSON(`${API_BASE}/persist_flow`, flowObj);
    return { content: [{ type: 'json', json: res }] };
  }
});

mcp.tool('get_flow', {
  description: 'Fetch a flow by id',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id']
  },
  handler: async ({ id }) => {
    const res = await getJSON(`${API_BASE}/flows/${id}`);
    return { content: [{ type: 'json', json: res }] };
  }
});

mcp.tool('list_flows', {
  description: 'List flows',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    const res = await getJSON(`${API_BASE}/flows`);
    return { content: [{ type: 'json', json: res }] };
  }
});

// ---- SSE endpoint for MCP over HTTP ----
const transport = new SSEServerTransport('/mcp');
transport.attach(mcp, app);

// Health
app.get('/', (_req, res) => res.send('trainai-mcp-server up'));

// Start
app.listen(PORT, () => {
  console.log(`MCP HTTP server listening on :${PORT} (API_BASE=${API_BASE})`);
});
