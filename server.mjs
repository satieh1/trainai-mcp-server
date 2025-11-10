// server.mjs
// Minimal Streamable HTTP MCP server that proxies to trainai-tools.onrender.com

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

// Render sets PORT; default to 3000 locally
const PORT = process.env.PORT || 3000;

// Train.ai backend base URL
const API_BASE =
  process.env.TRAINAI_API_BASE || 'https://trainai-tools.onrender.com';

app.use(cors());
app.use(express.json());

/**
 * Health check
 */
app.get('/', (_req, res) => {
  res.send('trainai-mcp-server up');
});

/**
 * MCP manifest
 * This is what Agent Builder fetches at:
 *   https://trainai-mcp-server.onrender.com/.well-known/mcp.json
 */
app.get('/.well-known/mcp.json', (_req, res) => {
  res.json({
    schema: '1.0',
    name: 'TrainaiMCP',
    version: '0.1.0',
    transport: {
      // Agent Builder supports streamable_http
      type: 'streamable_http',
      // Relative MCP endpoint path
      url: '/mcp',
    },
  });
});

/**
 * Helper: send a Streamable HTTP MCP event.
 * NOTE: We do NOT enforce any strict Accept header here.
 */
function sendMcpEvent(res, payload) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write('event: message\n');
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  res.end();
}

/**
 * MCP entrypoint
 * Supports:
 *  - tools/list
 *  - tools/call for: crawl, doc_search, evaluate, persist_flow
 */
app.post('/mcp', async (req, res) => {
  const body = req.body || {};
  const { id, method, params = {} } = body;

  try {
    // 1) List tools
    if (method === 'tools/list') {
      const tools = [
        {
          name: 'crawl',
          title: 'Crawl application',
          description:
            'Crawl a target web application and return routes, selectors, and snippets.',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', format: 'uri' },
              depth: { type: 'integer', minimum: 0, maximum: 3 },
            },
            required: ['url'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
        {
          name: 'doc_search',
          title: 'Search documentation',
          description:
            'Search Train.ai indexed docs/DOM for information relevant to a task.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
        {
          name: 'evaluate',
          title: 'Evaluate selector/route',
          description:
            'Validate that a selector works for a given route in the learned flow.',
          inputSchema: {
            type: 'object',
            properties: {
              selector: { type: 'string' },
              route: { type: 'string' },
            },
            required: ['selector', 'route'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
        {
          name: 'persist_flow',
          title: 'Persist discovered flow',
          description:
            'Store a structured Train.ai flow JSON so it can be replayed or inspected.',
          inputSchema: {
            type: 'object',
            properties: {
              flow: {},
            },
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ];

      return sendMcpEvent(res, {
        jsonrpc: '2.0',
        id,
        result: { tools },
      });
    }

    // 2) Tool calls
    if (method === 'tools/call') {
      const { name, arguments: args = {} } = params;

      if (!name) {
        throw new Error('Missing tool name in tools/call');
      }

      let apiResponse;

      if (name === 'crawl') {
        const { url, depth = 1 } = args;
        if (!url) throw new Error('crawl requires url');

        apiResponse = await fetch(
          `${API_BASE}/crawl?url=${encodeURIComponent(url)}&depth=${depth}`,
          { method: 'POST' },
        );
      } else if (name === 'doc_search') {
        const { query } = args;
        if (!query) throw new Error('doc_search requires query');

        apiResponse = await fetch(
          `${API_BASE}/doc_search?query=${encodeURIComponent(query)}`,
        );
      } else if (name === 'evaluate') {
        const { selector, route } = args;
        if (!selector || !route)
          throw new Error('evaluate requires selector and route');

        apiResponse = await fetch(
          `${API_BASE}/evaluate?selector=${encodeURIComponent(
            selector,
          )}&route=${encodeURIComponent(route)}`,
        );
      } else if (name === 'persist_flow') {
        const { flow } = args;
        if (!flow) throw new Error('persist_flow requires flow');

        apiResponse = await fetch(`${API_BASE}/persist_flow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flow),
        });
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }

      const data = await apiResponse.json().catch(() => null);

      return sendMcpEvent(res, {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'json',
              data,
            },
          ],
        },
      });
    }

    // 3) Fallback
    return sendMcpEvent(res, {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Unknown method: ${method}`,
      },
    });
  } catch (err) {
    console.error(err);
    return sendMcpEvent(res, {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: String(err.message || err),
      },
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(
    `MCP Streamable HTTP server listening on port ${PORT} (API_BASE=${API_BASE})`,
  );
});

