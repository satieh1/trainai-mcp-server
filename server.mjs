// server.mjs — Minimal MCP SSE bridge for Train.ai FastAPI

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const API_BASE = process.env.TRAINAI_API_BASE || 'https://trainai-tools.onrender.com';

// ------------ Express setup ------------
const app = express();
app.use(cors());
app.use(express.json());

// Health
app.get('/', (_req, res) => res.send('trainai-mcp-server up'));

// MCP server
const server = new McpServer({ name: 'TrainaiMCP', version: '0.1.0' }); 

// Example tool (keep or remove)
server.tool('ping', {
  description: 'Health check',
  inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
  handler: async ({ msg = 'ok' }) => ({ content: [{ type: 'text', text: `pong: ${msg}` }] })
});

// Discovery: advertise SSE on /mcp
app.get('/.well-known/mcp.json', (_req, res) => {
  res.json({
    schema: '1.0',
    name: 'TrainaiMCP',
    version: '0.1.0',
    transport: { type: 'sse', url: '/mcp' }
  });
});

// SSE transport at /mcp (must match your .well-known/mcp.json)
const transport = new SSEServerTransport('/mcp');
await transport.start(app, server);

// SSE transport at /mcp (must match your .well-known/mcp.json)
const transport = new SSEServerTransport('/mcp');
await transport.start(app, server);

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

// ------------ MCP server + tools ------------
const server = new McpServer({ name: 'trainai-tools', version: '1.0.0' });

// ping
server.tool(
  'ping',
  { message: z.string().default('pong') },
  async ({ message }) => ({ ok: true, message })
);

// crawl -> POST /crawl?url=&depth=
server.tool(
  'crawl',
  {
    url: z.string().url(),
    depth: z.number().int().min(0).max(3).default(1)
  },
  async ({ url, depth }) => postJSON(`${API_BASE}/crawl?url=${encodeURIComponent(url)}&depth=${depth}`)
);

// doc_search -> GET /doc_search?query=
server.tool(
  'doc_search',
  { query: z.string().min(1) },
  async ({ query }) => getJSON(`${API_BASE}/doc_search?query=${encodeURIComponent(query)}`)
);

// evaluate -> GET /evaluate?selector=&route=
server.tool(
  'evaluate',
  {
    selector: z.string().min(1),
    route: z.string().min(1)
  },
  async ({ selector, route }) =>
    getJSON(`${API_BASE}/evaluate?selector=${encodeURIComponent(selector)}&route=${encodeURIComponent(route)}`)
);

// persist_flow -> POST /persist_flow (JSON body)
server.tool(
  'persist_flow',
  {
    flow: z.record(z.any()) // accept arbitrary JSON
  },
  async ({ flow }) => postJSON(`${API_BASE}/persist_flow`, flow)
);

// ------------ Bind MCP to SSE transport ------------
transport.register(app, server);

