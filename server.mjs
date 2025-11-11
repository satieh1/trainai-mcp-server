import express from "express";
import cors from "cors";

const app = express();

// Use Render's PORT in production, 3000 locally
const PORT = process.env.PORT || 3000;

// Your Train.ai tools API base
const TRAINAI_API_BASE =
  process.env.TRAINAI_API_BASE || "https://trainai-tools.onrender.com";

app.use(cors());
app.use(express.json());

// Simple health check
app.get("/", (_req, res) => {
  res.type("text/plain").send("trainai-mcp-server up");
});

// MCP manifest
app.get("/.well-known/mcp.json", (_req, res) => {
  res.type("application/json").send({
    schema: "1.0",
    name: "TrainaiMCP",
    version: "0.1.0",
    transport: {
      // Agent Builder expects this for Hosted MCP
      type: "streamable_http",
      // Relative path from this same origin
      url: "/mcp",
    },
  });
});

// Helper: write one MCP message as a streamable_http event
function writeEvent(res, payload) {
  // Minimal framing that Agent Builder understands
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// In-memory tool definitions (what Agent Builder should see)
const tools = [
  {
    name: "crawl",
    title: "Crawl application",
    description:
      "Crawl a target web application and return routes, selectors, and snippets.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        depth: { type: "integer", minimum: 0, maximum: 3 },
      },
      required: ["url"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "doc_search",
    title: "Search documentation",
    description:
      "Search Train.ai indexed docs/DOM for information relevant to a task.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "evaluate",
    title: "Evaluate selector/route",
    description:
      "Validate that a selector works for a given route in the learned flow.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        route: { type: "string" },
      },
      required: ["selector", "route"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "persist_flow",
    title: "Persist discovered flow",
    description:
      "Store a structured Train.ai flow JSON so it can be replayed or inspected.",
    inputSchema: {
      type: "object",
      properties: {
        flow: {}, // allow any valid flow object
      },
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
];

// MCP endpoint (streamable_http)
app.post("/mcp", async (req, res) => {
  const { id = null, method, params } = req.body || {};

  // Always respond as a stream
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    if (method === "tools/list") {
      writeEvent(res, {
        jsonrpc: "2.0",
        id,
        result: { tools },
      });
      return res.end();
    }

    // (Optional) Implement tools/call so Agent Builder can actually use them.
    // For now, we just say "method not implemented" so tools at least load.
    writeEvent(res, {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not implemented: ${method}`,
      },
    });
    return res.end();
  } catch (err) {
    console.error("MCP handler error:", err);
    writeEvent(res, {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: "Internal MCP server error",
      },
    });
    return res.end();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(
    `trainai-mcp-server listening on :${PORT} (MCP at /mcp, manifest at /.well-known/mcp.json)`
  );
});

