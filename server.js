// server.js — MCP HTTP/SSE bridge to Train.ai FastAPI
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch'; // keep for future health checks if desired
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// NOTE: openapi-to-mcp is a CommonJS module, use default import:
import openapiToMcp from 'openapi-to-mcp';

const API_BASE = process.env.TRAINAI_API_BASE || 'https://trainai-tools.onrender.com';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

// Build MCP server from your OpenAPI spec
async function main() {
  const { createOpenApiMcpServer } = openapiToMcp;
  const mcp = await createOpenApiMcpServer({
    // Use your live OpenAPI spec from FastAPI
    schemaUrl: `${API_BASE}/openapi.json`,
    // You can optionally set a title/description here
  });

  // Mount MCP over HTTP SSE on /mcp
  const transport = new SSEServerTransport('/mcp');
  transport.attach(mcp, app);

  // simple health endpoint
  app.get('/', (_req, res) => res.send('trainai-mcp-server up'));

  app.listen(PORT, () => {
    console.log(`MCP HTTP server listening on :${PORT} (API_BASE=${API_BASE})`);
  });
}

main().catch(err => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
