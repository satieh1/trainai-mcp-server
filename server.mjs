// server.mjs
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

// ✅ High-level MCP server with .tool()
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ✅ HTTP(S) transport for MCP
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { z } from "zod";

const API_BASE = process.env.TRAINAI_API_BASE || 'https://trainai-tools.onrender.com';
const PORT = process.env.PORT || 3000;

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
const server = new McpServer({ name: 'trainai-tools', version: '1.0.0' });

server.tool(
  "ping",
  { message: z.string().default("pong") },
  async ({ message }) => ({
    content: [{ type: "text", text: `pong: ${message}` }],
  })
);

server.tool(
  "crawl",
  { url: z.string().url(), depth: z.number().int().min(0).max(3).default(1) },
  async ({ url, depth }) => {
    const r = await fetch(`${API_BASE}/crawl?url=${encodeURIComponent(url)}&depth=${depth}`, { method: "POST" });
    const data = await r.json();
    return { content: [{ type: "json", json: data }] };
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

const app = express();
app.use(cors());

const port = process.env.PORT || 3000;
const transport = new StreamableHTTPServerTransport({
  path: "/sse",       // MCP endpoint
  heartbeatIntervalMs: 25000,
});

await transport.start(app, server);

app.get("/", (_req, res) => res.send("Train.ai MCP server is running"));
app.listen(port, () => console.log(`MCP SSE on :${port}/sse`));

