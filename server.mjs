// server.mjs
// Minimal MCP-over-HTTP bridge for Train.ai tools
// No SDK magic, no openapi-to-mcp. Just a clean JSON-RPC server.

import express from "express";
import cors from "cors";

const PORT = parseInt(process.env.PORT || "3000", 10);
const API_BASE =
  process.env.TRAINAI_API_BASE || "https://trainai-tools.onrender.com";

const app = express();
app.use(cors());
app.use(express.json());

// Simple health check
app.get("/", (_req, res) => {
  res.send("trainai-mcp-server up");
});

// MCP metadata for OpenAI Agent Builder
app.get("/.well-known/mcp.json", (_req, res) => {
  res.json({
    schema: "1.0",
    name: "trainai-mcp",
    version: "0.1.0",
    transport: {
      type: "http",
      url: "/mcp"
    }
  });
});

// ---- Tool definitions ----

const tools = {
  crawl: {
    name: "crawl",
    description:
      "Crawl a web app and extract routes, selectors, and snippets using Train.ai /crawl.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Root URL of the app to crawl"
        },
        depth: {
          type: "integer",
          description: "Max depth for following links",
          default: 1
        }
      },
      required: ["url"]
    },
    handler: async (args) => {
      const url = args.url;
      const depth = args.depth ?? 1;

      const resp = await fetch(
        `${API_BASE}/crawl?url=${encodeURIComponent(url)}&depth=${depth}`,
        { method: "POST" }
      );

      if (!resp.ok) {
        return [
          {
            type: "text",
            text: `crawl failed: HTTP ${resp.status}`
          }
        ];
      }

      const data = await resp.json();
      return [
        {
          type: "json",
          json: data
        }
      ];
    }
  },

  doc_search: {
    name: "doc_search",
    description:
      "Search indexed documentation via Train.ai /doc_search for a natural language query.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query"
        }
      },
      required: ["query"]
    },
    handler: async (args) => {
      const q = args.query;

      const resp = await fetch(
        `${API_BASE}/doc_search?query=${encodeURIComponent(q)}`
      );

      if (!resp.ok) {
        return [
          {
            type: "text",
            text: `doc_search failed: HTTP ${resp.status}`
          }
        ];
      }

      const data = await resp.json();
      return [
        {
          type: "json",
          json: data
        }
      ];
    }
  },

  evaluate: {
    name: "evaluate",
    description:
      "Validate a CSS selector on a given route using Train.ai /evaluate (mock today).",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to validate"
        },
        route: {
          type: "string",
          description: "Route/URL to check against"
        }
      },
      required: ["selector", "route"]
    },
    handler: async (args) => {
      const qs = new URLSearchParams({
        selector: args.selector,
        route: args.route
      }).toString();

      const resp = await fetch(`${API_BASE}/evaluate?${qs}`);

      if (!resp.ok) {
        return [
          {
            type: "text",
            text: `evaluate failed: HTTP ${resp.status}`
          }
        ];
      }

      const data = await resp.json();
      return [
        {
          type: "json",
          json: data
        }
      ];
    }
  },

  persist_flow: {
    name: "persist_flow",
    description:
      "Persist a discovered flow JSON via Train.ai /persist_flow so it can be inspected & replayed.",
    input_schema: {
      type: "object",
      description:
        "Full flow JSON (app, task, confidence, sources, steps, etc) as produced by Train.ai."
    },
    handler: async (args) => {
      const resp = await fetch(`${API_BASE}/persist_flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });

      if (!resp.ok) {
        return [
          {
            type: "text",
            text: `persist_flow failed: HTTP ${resp.status}`
          }
        ];
      }

      const data = await resp.json();
      return [
        {
          type: "json",
          json: data
        }
      ];
    }
  }
};

// ---- MCP JSON-RPC endpoint ----

app.post("/mcp", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  if (jsonrpc !== "2.0") {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code: -32600,
        message: "Invalid JSON-RPC version (expected 2.0)"
      }
    });
  }

  // List tools
  if (method === "tools/list") {
    const list = Object.values(tools).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema
    }));

    return res.json({
      jsonrpc: "2.0",
      id,
      result: { tools: list }
    });
  }

  // Call tool
  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};
    const tool = tools[name];

    if (!tool) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Unknown tool: ${name}`
        }
      });
    }

    try {
      const content = await tool.handler(args);
      return res.json({
        jsonrpc: "2.0",
        id,
        result: { content }
      });
    } catch (err) {
      console.error("Tool error:", err);
      return res.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message: `Tool '${name}' failed: ${
            err?.message || String(err)
          }`
        }
      });
    }
  }

  // Unknown method
  return res.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code: -32601,
      message: `Unknown method: ${method}`
    }
  });
});

// ---- Start server ----

app.listen(PORT, () => {
  console.log(`trainai-mcp-server listening on port ${PORT}`);
  console.log(
    "MCP metadata: GET /.well-known/mcp.json ; JSON-RPC: POST /mcp"
  );
});

