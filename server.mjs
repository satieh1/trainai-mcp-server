// server.mjs
// Train.ai MCP server using Streamable HTTP (stateless)

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// Point this at your Train.ai tools API
const API_BASE =
  process.env.TRAINAI_API_BASE || "https://trainai-tools.onrender.com";

function getServer() {
  const server = new McpServer({
    name: "trainai-mcp",
    version: "0.1.0",
  });

  //
  // TOOLS
  //

  // 1) /crawl
  server.registerTool(
    "crawl",
    {
      title: "Crawl application",
      description:
        "Crawl a target web application and return routes, selectors, and snippets.",
      inputSchema: {
        url: z.string().url(),
        depth: z.number().int().min(0).max(3).optional(),
      },
    },
    async ({ url, depth }) => {
      const d = depth ?? 1;
      const resp = await fetch(
        `${API_BASE}/crawl?url=${encodeURIComponent(url)}&depth=${d}`,
        { method: "POST" }
      );

      if (!resp.ok) {
        const text = await resp.text();
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `crawl failed: ${resp.status} ${resp.statusText} - ${text}`,
            },
          ],
        };
      }

      const json = await resp.json();
      return {
        content: [{ type: "json", json }],
      };
    }
  );

  // 2) /doc_search
  server.registerTool(
    "doc_search",
    {
      title: "Search documentation",
      description:
        "Search Train.ai indexed docs/DOM for information relevant to a task.",
      inputSchema: {
        query: z.string(),
      },
    },
    async ({ query }) => {
      const resp = await fetch(
        `${API_BASE}/doc_search?query=${encodeURIComponent(query)}`,
        { method: "GET" }
      );

      if (!resp.ok) {
        const text = await resp.text();
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `doc_search failed: ${resp.status} ${resp.statusText} - ${text}`,
            },
          ],
        };
      }

      const json = await resp.json();
      return {
        content: [{ type: "json", json }],
      };
    }
  );

  // 3) /evaluate
  server.registerTool(
    "evaluate",
    {
      title: "Evaluate selector/route",
      description:
        "Validate that a selector works for a given route in the learned flow.",
      inputSchema: {
        selector: z.string(),
        route: z.string(),
      },
    },
    async ({ selector, route }) => {
      const url = `${API_BASE}/evaluate?selector=${encodeURIComponent(
        selector
      )}&route=${encodeURIComponent(route)}`;

      const resp = await fetch(url, { method: "GET" });

      if (!resp.ok) {
        const text = await resp.text();
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `evaluate failed: ${resp.status} ${resp.statusText} - ${text}`,
            },
          ],
        };
      }

      const json = await resp.json();
      return {
        content: [{ type: "json", json }],
      };
    }
  );

  // 4) /persist_flow
  server.registerTool(
    "persist_flow",
    {
      title: "Persist discovered flow",
      description:
        "Store a structured Train.ai flow JSON so it can be replayed or inspected.",
      inputSchema: {
        flow: z.unknown(),
      },
    },
    async ({ flow }) => {
      const resp = await fetch(`${API_BASE}/persist_flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flow),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `persist_flow failed: ${resp.status} ${resp.statusText} - ${text}`,
            },
          ],
        };
      }

      const json = await resp.json();
      return {
        content: [{ type: "json", json }],
      };
    }
  );

  return server;
}

// ---------- Express + Streamable HTTP wiring (stateless) ----------

const app = express();
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.send("trainai-mcp-server up");
});

// MCP manifest (.well-known/mcp.json)
app.get("/.well-known/mcp.json", (req, res) => {
  const baseUrl =
    process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;

  res.json({
    schema: "1.0",
    name: "TrainaiMCP",
    version: "0.1.0",
    transport: {
      type: "streamable_http",
      url: `${baseUrl}/mcp`,
    },
  });
});

// Stateless Streamable HTTP MCP endpoint
app.post("/mcp", async (req, res) => {
  try {
    const server = getServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    res.on("close", () => {
      try {
        transport.close();
        server.close();
      } catch (e) {
        console.error("Error closing transport/server:", e);
      }
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

// Reject non-POSTs to /mcp (required by spec)
app.get("/mcp", (req, res) => {
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

app.delete("/mcp", (req, res) => {
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `MCP Stateless Streamable HTTP Server listening on port ${PORT} (API_BASE=${API_BASE})`
  );
});

