/**
 * Lambda handler for the summit-store MCP server.
 * Implements MCP Streamable HTTP protocol directly for stateless Lambda execution.
 *
 * For stateless mode, all JSON-RPC messages come as POST and get direct JSON responses
 * (no SSE streaming needed). This is the simplest approach for Lambda.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { operationsTools, handleOperationsTool } from './tools/operations.mjs';
import { incidentTools, handleIncidentTool } from './tools/incidents.mjs';
import { knowledgeTools, handleKnowledgeTool } from './tools/knowledge.mjs';
import { deploymentTools, handleDeploymentTool } from './tools/deployments.mjs';
import { monitoringTools, handleMonitoringTool } from './tools/monitoring.mjs';

const allTools = [...operationsTools, ...incidentTools, ...knowledgeTools, ...deploymentTools, ...monitoringTools];
const categoryMap = new Map();
for (const tool of operationsTools) categoryMap.set(tool.name, 'operations');
for (const tool of incidentTools) categoryMap.set(tool.name, 'incidents');
for (const tool of knowledgeTools) categoryMap.set(tool.name, 'knowledge');
for (const tool of deploymentTools) categoryMap.set(tool.name, 'deployments');
for (const tool of monitoringTools) categoryMap.set(tool.name, 'monitoring');

function createMcpServer() {
  const server = new Server(
    { name: 'summit-store-ops', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const category = categoryMap.get(name);
    if (!category) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }], isError: true };
    }
    try {
      let result;
      switch (category) {
        case 'operations': result = handleOperationsTool(name, args || {}); break;
        case 'incidents': result = handleIncidentTool(name, args || {}); break;
        case 'knowledge': result = handleKnowledgeTool(name, args || {}); break;
        case 'deployments': result = handleDeploymentTool(name, args || {}); break;
        case 'monitoring': result = await handleMonitoringTool(name, args || {}); break;
        default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown category: ${category}` }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error.message, tool: name }) }], isError: true };
    }
  });

  return server;
}

/**
 * Lambda handler — processes MCP JSON-RPC over HTTP.
 * Uses InMemoryTransport to drive the server and return responses directly.
 */
export async function handler(event) {
  const method = event.requestContext?.http?.method || 'POST';

  // Only POST is meaningful for stateless MCP
  if (method === 'GET') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'SSE streaming not supported in stateless mode. Use POST.' }),
    };
  }

  if (method === 'DELETE') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Session terminated (no-op in stateless mode)' }),
    };
  }

  // Parse the incoming JSON-RPC request
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf-8')
    : (event.body || '');

  let jsonRpcRequest;
  try {
    jsonRpcRequest = JSON.parse(rawBody);
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }),
    };
  }

  // Create server with in-memory transport
  let mcpServer;
  try {
    mcpServer = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await mcpServer.connect(serverTransport);

    // Collect responses
    const responses = [];
    clientTransport.onmessage = (message) => {
      responses.push(message);
    };

    // Send the request(s) — could be a single object or an array (batch)
    const requests = Array.isArray(jsonRpcRequest) ? jsonRpcRequest : [jsonRpcRequest];

    for (const req of requests) {
      await clientTransport.send(req);
    }

    // Wait for all responses (with timeout)
    const expectedResponses = requests.filter(r => r.id !== undefined).length;
    const maxWait = 25000; // 25s max (Lambda timeout is 30s)
    const startTime = Date.now();

    while (responses.length < expectedResponses && (Date.now() - startTime) < maxWait) {
      await new Promise(r => setTimeout(r, 100));
    }

    await mcpServer.close();

    // If we timed out without getting all responses, return an error
    if (responses.length < expectedResponses) {
      const timeoutError = { jsonrpc: '2.0', error: { code: -32000, message: `Timeout: received ${responses.length}/${expectedResponses} responses within ${maxWait}ms` }, id: jsonRpcRequest.id || null };
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(timeoutError),
      };
    }

    // Return the response(s)
    const responseBody = requests.length === 1 && responses.length === 1
      ? JSON.stringify(responses[0])
      : JSON.stringify(responses);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: responseBody,
    };
  } catch (error) {
    if (mcpServer) try { await mcpServer.close(); } catch (e) { /* ignore */ }
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: `Internal error: ${error.message}` }, id: null }),
    };
  }
}
