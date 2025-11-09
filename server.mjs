// server.mjs
// Train.ai MCP HTTP bridge for Train.ai Tools API

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE =
  process.env.TRAINAI_API_BASE || "https://trainai-tools.onrender.com";
const PORT = parseInt(process.env.PORT || "3000", 10);

// ----- Create MCP server -----

const server = new McpServer({
  name: "trainai-mcp-server",
  version: "0.1.0",
});

// Helper to wrap HTTP calls to Train.ai API
async function callJson(method, path, { query, body } = {}) {
  const url = new URL(path, API_BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers:
      body != null
        ? { "Content-Type": "application/json" }
        : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = { raw: text, parseError: String(e) };
  }

  if (!res.ok) {
    throw new Error(
      `Upstream ${method} ${url.toString()} failed: ${res.status} ${res.statusText} ${text}`,
    );
  }

  return json;
}

// ----- Tools -----

// Health / sanity check
server.registerTool(
  "ping",
  {
    title: "Ping",
    description: "Check connectivity to the Train.ai MCP server.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      ok: z.boolean(),
      message: z.string(),
    }),
  },
  async () => {
    return {
      structuredContent: { ok: true, message: "pong from trainai-mcp-server" },
      content: [
        {
          type: "text",
          text: "pong from trainai-mcp-server",
        },
      ],
    };
  },
);

// POST /crawl
server.registerTool(
  "crawl",
  {
    title: "Crawl app DOM",
    description:
      "Call Train.ai /crawl to scan a web app and return routes, selectors, and snippets.",
    inputSchema: z.object({
      url: z.string().url(),
      depth: z.number().int().min(0).max(3).default(1).optional(),
    }),
    outputSchema: z.any(),
  },
  async ({ url, depth }) => {
    const json = await callJson("POST", "/crawl", {
      query: { url, depth },
    });

    return {
      structuredContent: json,
      content: [
        {
          type: "text",
          text: JSON.stringify(json, null, 2),
        },
      ],
    };
  },
);

// GET /doc_search
server.registerTool(
  "doc_search",
  {
    title: "Documentation search",
    description: "Search docs via Train.ai /doc_search.",
    inputSchema: z.object({
      query: z.string(),
    }),
    outputSchema: z.any(),
  },
  async ({ query }) => {
    const json = await callJson("GET", "/doc_search", {
      query: { query },
    });

    return {
      structuredContent: json,
      content: [
        {
          type: "text",
          text: JSON.stringify(json, null, 2),
        },
      ],
    };
  },
);

// GET /evaluate
server.registerTool(
  "evaluate",
  {
    title: "Evaluate selector",
    description:
      "Validate a CSS/XPath selector & route via Train.ai /evaluate.",
    inputSchema: z.object({
      selector: z.string(),
      route: z.string(),
    }),
    outputSchema: z.any(),
  },
  async ({ selector, route }) => {
    const json = await callJson("GET", "/evaluate", {
      query: { selector, route },
    });

    return {
      structuredContent: json,
      content: [
        {
          type: "text",
          text: JSON.stringify(json, null, 2),
        },
      ],
    };
  },
);

// POST /persist_flow
server.registerTool(
  "persist_flow",
  {
    title: "Persist workflow flow",
    description:
      "Persist a discovered workflow JSON to Train.ai via /persist_flow.",
    inputSchema: z.object({
      flow: z.record(z.any()),
    }),
    outputSchema: z.any(),
  },
  async ({ flow }) => {
    const json = await callJson("POST", "/persist_flow", {
      body: flow,
    });

    return {
      structuredContent: json,
      content: [
        {
          type: "text",
          text: JSON.stringify(json, null, 2),
        },
      ],
    };
  },
);

// ----- HTTP wiring (Streamable HTTP MCP) -----

const app = express();
app.use(express.json());

// Health endpoint
app.get("/", (_req, res) => {
  res.send("trainai-mcp-server up");
});

// MCP discovery manifest for OpenAI Agent Builder, etc.
app.get("/.well-known/mcp.json", (_req, res) => {
  res.json({
    schema: "1.0",
    name: "trainai-mcp-server",
    version: "0.1.0",
    transport: {
      type: "http",
      url: "/mcp",
    },
  });
});

// MCP HTTP endpoint
app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error handling /mcp request:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Internal MCP server error",
          data: String(err),
        },
        id: null,
      });
    }
  }
});

// Start server
app
  .listen(PORT, () => {
    console.log(
      `Train.ai MCP server running on http://localhost:${PORT}/mcp (API_BASE=${API_BASE})`,
    );
  })
  .on("error", (err) => {
    console.error("Server failed to start:", err);
    process.exit(1);
  });

