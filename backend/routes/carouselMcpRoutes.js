const express = require('express');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { verifyPlatformAccessToken } = require('../middlewares/verifyPlatformAccessToken');
const { createCarouselMcpServer } = require('../services/pivotCarouselMcpServer');

const router = express.Router();

router.use(verifyPlatformAccessToken);

function jsonRpcError(res, status, code, message) {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

function sessionId(req) {
  const value = req.headers['mcp-session-id'];
  if (Array.isArray(value)) return value.find(Boolean) || '';
  return value || '';
}

// Stateless Streamable HTTP: one JSON response per POST, and no session id.
router.post('/', async (req, res) => {
  if (sessionId(req)) {
    return jsonRpcError(res, 400, -32000, 'This server does not use session ids.');
  }
  const server = createCarouselMcpServer(req);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[carouselMcp]', err);
    if (!res.headersSent) {
      jsonRpcError(res, 500, -32603, 'Carousel MCP request failed.');
    }
  } finally {
    await server.close().catch(() => {});
  }
});

router.use((req, res) => {
  res.set('Allow', 'POST');
  jsonRpcError(res, 405, -32000, 'Method not allowed.');
});

module.exports = router;
