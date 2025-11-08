// server.mjs
// Minimal MCP Streamable HTTP server exposing your Train.ai tools

import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE =
  process.env.TRAINAI_API_BASE || "https://trainai-tools.onrender.com";

/**
 * Build a fresh MCP server instance with Train.ai tools registered.
 * This is called per-request in stateless mode.
 */
function buildServer() {
  const server = new McpServer({
    name: "trainai-mcp-server",
    version: "0.1.0",
  });

  //
  // 1) /crawl
  //
  server.registerTool(
    "crawl",
    {
      title: "Crawl application DOM",
      description:
        "Call Train.ai /crawl to scan a web app and return routes, selectors, snippets.",
      inputSchema: {
        url: z.string().url(),
        depth: z.number().int().min(0).max(3).optional(),
      },
    },
    async ({ url, depth }) => {
      const d = depth ?? 1;
      const res = await fetch(
        `${API_BASE}/crawl?url=${encodeURIComponent(url)}&depth=${d}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`crawl failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  //
  // 2) /doc_search
  //
  server.registerTool(
    "doc_search",
    {
      title: "Search documentation",
      description:
        "Search indexed docs for guidance related to a workflow or selector.",
      inputSchema: {
        query: z.string(),
      },
    },
    async ({ query }) => {
      const res = await fetch(
        `${API_BASE}/doc_search?query=${encodeURIComponent(query)}`
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`doc_search failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  //
  // 3) /evaluate
  //
  server.registerTool(
    "evaluate",
    {
      title: "Evaluate selector/route",
      description:
        "Validate whether a selector works on a given route using Train.ai /evaluate.",
      inputSchema: {
        selector: z.string(),
        route: z.string(),
      },
    },
    async ({ selector, route }) => {
      const url = `${API_BASE}/evaluate?selector=${encodeURIComponent(
        selector
      )}&route=${encodeURIComponent(route)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`evaluate failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  //
  // 4) /persist_flow
  //
  server.registerTool(
    "persist_flow",
    {
      title: "Persist discovered flow",
      description:
        "Store a structured workflow JSON using Train.ai /persist_flow.",
      inputSchema: {
        flow: z.record(z.any()),
      },
    },
    async ({ flow }) => {
      const res = await fetch(`${API_BASE}/persist_flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flow),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`persist_flow failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  //
  // 5) List flows: GET /flows
  //
  server.registerTool(
    "list_flows",
    {
      title: "List stored flows",
      description:
        "Fetch all stored Train.ai flows from the backend (GET /flows).",
      inputSchema: {},
    },
    async () => {
      const res = await fetch(`${API_BASE}/flows`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`list_flows failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  //
  // 6) Get flow by ID: GET /flows/{id}
  //
  server.registerTool(
    "get_flow",
    {
      title: "Get flow by ID",
      description:
        "Fetch a single Train.ai flow (including steps) by its ID (GET /flows/{id}).",
      inputSchema: {
        id: z.string(),
      },
    },
    async ({ id }) => {
      const res = await fetch(`${API_BASE}/flows/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`get_flow failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  return server;
}

// ---------- Express + Streamable HTTP wiring (stateless) ----------

const app = express();
app.use(cors());
app.use(express.json());
app.use("/.well-known", express.static(".well-known"));

// Simple health check
app.get("/", (_req, res) => {
  res.send("trainai-mcp-server up");
});

// Stateless MCP endpoint for OpenAI Agent Builder
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    res.on("close", () => {
      try {
        transport.close();
        server.close();
      } catch {
        /* ignore */
      }
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error handling MCP /mcp request:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

// Optional: reject GET/DELETE nicely (some clients may probe)
app.get("/mcp", (req, res) => {
  res
    .status(405)
    .json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
});

app.delete("/mcp", (req, res) => {
  res
    .status(405)
    .json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(
    `MCP Stateless Streamable HTTP Server listening on port ${PORT} (POST /mcp)`
  );
});

