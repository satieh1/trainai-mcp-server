// server.mjs
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json());

// --- MCP description exposed at .well-known/mcp.json ---
const mcpDescription = {
  schema: "1.0",
  name: "TrainaiMCP",
  version: "0.1.0",
  transport: {
    // We use simple HTTP JSON-RPC over a single endpoint
    type: "streamable_http",
    url: "/mcp",
  },
};

// --- Tool definitions for tools/list ---
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
        flow: {}, // any JSON object
      },
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
];

// --- Health check ---
app.get("/", (_req, res) => {
  res.send("trainai-mcp-server up");
});

// --- MCP discovery endpoint ---
app.get("/.well-known/mcp.json", (_req, res) => {
  res.json(mcpDescription);
});

// --- Helper: JSON-RPC error response ---
function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
}

// --- MCP JSON-RPC endpoint ---
// For now: support tools/list (so Agent Builder can load tools).
// We can add tools/call later if needed.
app.post("/mcp", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  if (jsonrpc !== "2.0" || !method) {
    return res
      .status(400)
      .json(jsonRpcError(id, -32600, "Invalid Request"));
  }

  try {
    // 1) tools/list -> return tool metadata
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: { tools },
      });
    }

    // 2) tools/call -> OPTIONAL (not required just to “load tools”)
    // Leaving this stubbed so the server doesn’t crash if the client calls it.
    if (method === "tools/call") {
      const toolName = params?.name;
      return res.json(
        jsonRpcError(
          id,
          -32601,
          `tools/call not implemented yet for tool "${toolName}"`
        )
      );
    }

    // Fallback for other methods
    return res.json(jsonRpcError(id, -32601, "Method not found"));
  } catch (err) {
    console.error("Error in /mcp handler:", err);
    return res
      .status(500)
      .json(jsonRpcError(id, -32603, "Internal server error"));
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`MCP HTTP server listening on :${PORT}`);
});

