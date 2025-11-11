// server.mjs
// Train.ai MCP server exposing crawl, doc_search, evaluate, persist_flow
// Uses MCP TypeScript SDK (ESM) + Streamable HTTP transport.

import express from "express";
import { z } from "zod";
import {
  McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  StreamableHTTPServerTransport,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const API_BASE =
  process.env.TRAINAI_API_BASE || "https://trainai-tools.onrender.com";

// ---------- MCP SERVER SETUP ----------

const server = new McpServer({
  name: "TrainaiMCP",
  version: "0.1.0",
});

// Helper to call Train.ai backend
async function callApi(path, { method = "GET", query = {}, body } = {}) {
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Train.ai API ${url.pathname} failed: ${res.status} ${text}`
    );
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

// ---------- TOOLS ----------

// 1) crawl
server.registerTool(
  "crawl",
  {
    title: "Crawl application",
    description:
      "Crawl a target web application and return routes, selectors, and snippets.",
    inputSchema: z.object({
      url: z.string().url(),
      depth: z.number().int().min(0).max(3).optional(),
    }),
  },
  async ({ url, depth }) => {
    const data = await callApi("/crawl", {
      method: "POST",
      query: { url, depth: depth ?? 1 },
    });
    const text = JSON.stringify(data, null, 2);
    return {
      content: [{ type: "text", text }],
      structuredContent: data,
    };
  }
);

// 2) doc_search
server.registerTool(
  "doc_search",
  {
    title: "Search documentation",
    description:
      "Search Train.ai indexed docs/DOM for information relevant to a task.",
    inputSchema: z.object({
      query: z.string(),
    }),
  },
  async ({ query }) => {
    const data = await callApi("/doc_search", {
      method: "GET",
      query: { query },
    });
    const text = JSON.stringify(data, null, 2);
    return {
      content: [{ type: "text", text }],
      structuredContent: data,
    };
  }
);

// 3) evaluate
server.registerTool(
  "evaluate",
  {
    title: "Evaluate selector/route",
    description:
      "Validate that a selector works for a given route in the learned flow.",
    inputSchema: z.object({
      selector: z.string(),
      route: z.string(),
    }),
  },
  async ({ selector, route }) => {
    const data = await callApi("/evaluate", {
      method: "GET",
      query: { selector, route },
    });
    const text = JSON.stringify(data, null, 2);
    return {
      content: [{ type: "text", text }],
      structuredContent: data,
    };
  }
);

// 4) persist_flow
server.registerTool(
  "persist_flow",
  {
    title: "Persist discovered flow",
    description:
      "Store a structured Train.ai flow JSON so it can be replayed or inspected.",
    inputSchema: z.object({
      flow: z.any(),
    }),
  },
  async ({ flow }) => {
    const data = await callApi("/persist_flow", {
      method: "POST",
      body: flow,
    });
    const text = JSON.stringify(data, null, 2);
    return {
      content: [{ type: "text", text }],
      structuredContent: data,
    };
  }
);

// ---------- EXPRESS + MCP TRANSPORT ----------

const app = express();
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.send("trainai-mcp-server up");
});

// MCP manifest (what Agent Builder reads)
app.get("/.well-known/mcp.json", (_req, res) => {
  res.json({
    schema: "1.0",
    name: "TrainaiMCP",
    version: "0.1.0",
    transport: {
      type: "streamable_http",
      url: "/mcp",
    },
  });
});

// MCP endpoint (Streamable HTTP)
// Agent Builder will POST here with MCP JSON-RPC
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Start server
const port = parseInt(process.env.PORT || "3000", 10);

app
  .listen(port, () => {
    console.log(`Train.ai MCP server running on http://localhost:${port}`);
  })
  .on("error", (err) => {
    console.error("Server error:", err);
    process.exit(1);
  });

