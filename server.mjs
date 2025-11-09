// server.mjs
// Minimal MCP HTTP server that wraps your Train.ai tools API

import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE =
  process.env.TRAINAI_API_BASE || "https://trainai-tools.onrender.com";
const PORT = process.env.PORT || 3000;

/**
 * Build a fresh MCP server with Train.ai tools for each request.
 * Stateless pattern from the official MCP SDK docs.
 */
function getServer() {
  const server = new McpServer({
    name: "TrainaiMCP",
    version: "0.1.0",
  });

  // 1) /crawl
  server.registerTool(
    "crawl",
    {
      title: "Crawl app DOM",
      description:
        "Call Train.ai /crawl to discover routes, selectors, and snippets for a target web app.",
      inputSchema: z.object({
        url: z.string().url(),
        depth: z.number().int().min(0).max(3).default(1),
      }),
    },
    async ({ url, depth }) => {
      const params = new URLSearchParams({
        url,
        depth: String(depth ?? 1),
      });

      const resp = await fetch(`${API_BASE}/crawl?${params.toString()}`, {
        method: "POST",
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`crawl failed: ${resp.status} ${text}`);
      }

      const data = await resp.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  // 2) /doc_search
  server.registerTool(
    "doc_search",
    {
      title: "Search documentation",
      description: "Call Train.ai /doc_search to search product docs.",
      inputSchema: z.object({
        query: z.string(),
      }),
    },
    async ({ query }) => {
      const resp = await fetch(
        `${API_BASE}/doc_search?` +
          new URLSearchParams({ query }).toString(),
        { method: "GET" }
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`doc_search failed: ${resp.status} ${text}`);
      }

      const data = await resp.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  // 3) /evaluate
  server.registerTool(
    "evaluate",
    {
      title: "Evaluate selector",
      description:
        "Call Train.ai /evaluate to validate a CSS/XPath selector for a given route.",
      inputSchema: z.object({
        selector: z.string(),
        route: z.string(),
      }),
    },
    async ({ selector, route }) => {
      const resp = await fetch(
        `${API_BASE}/evaluate?` +
          new URLSearchParams({ selector, route }).toString(),
        { method: "GET" }
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`evaluate failed: ${resp.status} ${text}`);
      }

      const data = await resp.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  // 4) /persist_flow
  server.registerTool(
    "persist_flow",
    {
      title: "Persist discovered flow",
      description:
        "Call Train.ai /persist_flow to save a generated workflow JSON (flows table in Supabase).",
      // If you want stricter typing later, replace z.any() with a concrete schema.
      inputSchema: z.any(),
    },
    async (flow) => {
      const resp = await fetch(`${API_BASE}/persist_flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flow),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`persist_flow failed: ${resp.status} ${text}`);
      }

      const data = await resp.json();
      return {
        content: [{ type: "json", json: data }],
      };
    }
  );

  return server;
}

// ---------- Express + MCP wiring (stateless HTTP) ----------

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.send("trainai-mcp-server up");
});

// MCP discovery
app.get("/.well-known/mcp.json", (_req, res) => {
  res.json({
    schema: "1.0",
    name: "TrainaiMCP",
    version: "0.1.0",
    transport: {
      type: "http",
      url: "/mcp",
    },
  });
});

/**
 * POST /mcp
 * Stateless handler: new server + transport per request.
 * Matches the official MCP Streamable HTTP example.
 */
app.post("/mcp", async (req, res) => {
  try {
    const server = getServer();
    const transport = new StreamableHTTPServerTransport({
      // no sessionIdGenerator -> stateless
    });

    res.on("close", () => {
      try {
        transport.close();
      } catch (_) {}
      try {
        server.close();
      } catch (_) {}
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
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

// Optional: block GET/DELETE nicely so clients don't get HTML
app.get("/mcp", (_req, res) => {
  res
    .status(405)
    .json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
});

app.delete("/mcp", (_req, res) => {
  res
    .status(405)
    .json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(
    `MCP HTTP server listening on :${PORT} — POST /.well-known/mcp.json & /mcp ready`
  );
});
