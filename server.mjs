// server.mjs - Train.ai MCP server (stateless streamable_http)

import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE =
  process.env.TRAINAI_API_BASE || "https://trainai-tools.onrender.com";

/**
 * Build a fresh MCP server instance with Train.ai tools.
 * (Stateless pattern: new server per request.)
 */
function buildServer() {
  const server = new McpServer({
    name: "TrainaiMCP",
    version: "0.1.0",
  });

  // 1) Crawl tool
  server.tool(
    "crawl",
    {
      url: z.string().url(),
      depth: z.number().int().min(0).max(3).optional(),
    },
    async ({ url, depth }) => {
      const params = new URLSearchParams({ url });
      if (typeof depth === "number") {
        params.set("depth", String(depth));
      }

      const resp = await fetch(`${API_BASE}/crawl?${params.toString()}`, {
        method: "POST",
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `Train.ai /crawl failed (${resp.status}): ${text || resp.statusText}`
        );
      }

      const json = await resp.json();
      return {
        content: [{ type: "json", json }],
      };
    }
  );

  // 2) Doc search tool
  server.tool(
    "doc_search",
    {
      query: z.string(),
    },
    async ({ query }) => {
      const params = new URLSearchParams({ query });

      const resp = await fetch(`${API_BASE}/doc_search?${params.toString()}`, {
        method: "GET",
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `Train.ai /doc_search failed (${resp.status}): ${
            text || resp.statusText
          }`
        );
      }

      const json = await resp.json();
      return {
        content: [{ type: "json", json }],
      };
    }
  );

  // 3) Evaluate tool
  server.tool(
    "evaluate",
    {
      selector: z.string(),
      route: z.string(),
    },
    async ({ selector, route }) => {
      const params = new URLSearchParams({ selector, route });

      const resp = await fetch(
        `${API_BASE}/evaluate?${params.toString()}`,
        { method: "GET" }
      );

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `Train.ai /evaluate failed (${resp.status}): ${
            text || resp.statusText
          }`
        );
      }

      const json = await resp.json();
      return {
        content: [{ type: "json", json }],
      };
    }
  );

  // 4) Persist flow tool
  server.tool(
    "persist_flow",
    {
      flow: z.any(),
    },
    async ({ flow }) => {
      const resp = await fetch(`${API_BASE}/persist_flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flow),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `Train.ai /persist_flow failed (${resp.status}): ${
            text || resp.statusText
          }`
        );
      }

      const json = await resp.json();
      return {
        content: [{ type: "json", json }],
      };
    }
  );

  return server;
}

const app = express();
app.use(cors());
app.use(express.json());

// Simple health check
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
      type: "streamable_http",
      // IMPORTANT: absolute URL so clients (like Agent Builder) don't get confused
      url: "https://trainai-mcp-server.onrender.com/mcp",
    },
  });
});

/**
 * Stateless Streamable HTTP MCP endpoint.
 * This matches the official SDK example.
 */
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close();
      server.close();
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

// No GET/DELETE on /mcp for stateless mode
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `MCP Stateless Streamable HTTP Server listening on port ${PORT}`
  );
});

