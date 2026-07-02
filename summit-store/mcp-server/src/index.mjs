#!/usr/bin/env node
/**
 * Summit Store MCP Server
 *
 * A comprehensive MCP server that exposes operational intelligence tools
 * for AWS DevOps Agent to use during investigations, prevention evaluations,
 * and on-demand chat queries.
 *
 * Tool categories:
 *   - Operations: service health, dependencies, runbooks, chaos engineering
 *   - Incidents: open incidents, on-call schedules, acknowledgment, escalation
 *   - Knowledge: architecture, SLAs, known issues, design decisions, team contacts
 *   - Deployments: deployment history, code diffs, metrics, rollback, pipeline status
 *
 * Transport: stdio (standard MCP transport for DevOps Agent private MCP server integration)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { operationsTools, handleOperationsTool } from './tools/operations.mjs';
import { incidentTools, handleIncidentTool } from './tools/incidents.mjs';
import { knowledgeTools, handleKnowledgeTool } from './tools/knowledge.mjs';
import { deploymentTools, handleDeploymentTool } from './tools/deployments.mjs';
import { monitoringTools, handleMonitoringTool } from './tools/monitoring.mjs';

// Build the full tool list and dispatch map
const allTools = [
  ...operationsTools,
  ...incidentTools,
  ...knowledgeTools,
  ...deploymentTools,
  ...monitoringTools,
];

const categoryMap = new Map();
for (const tool of operationsTools) categoryMap.set(tool.name, 'operations');
for (const tool of incidentTools) categoryMap.set(tool.name, 'incidents');
for (const tool of knowledgeTools) categoryMap.set(tool.name, 'knowledge');
for (const tool of deploymentTools) categoryMap.set(tool.name, 'deployments');
for (const tool of monitoringTools) categoryMap.set(tool.name, 'monitoring');

// Create the MCP server
const server = new Server(
  {
    name: 'summit-store-ops',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);


// ─── Handle tools/list ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// ─── Handle tools/call ───────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const category = categoryMap.get(name);
  if (!category) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }

  try {
    let result;
    switch (category) {
      case 'operations':
        result = handleOperationsTool(name, args || {});
        break;
      case 'incidents':
        result = handleIncidentTool(name, args || {});
        break;
      case 'knowledge':
        result = handleKnowledgeTool(name, args || {});
        break;
      case 'deployments':
        result = handleDeploymentTool(name, args || {});
        break;
      case 'monitoring':
        result = await handleMonitoringTool(name, args || {});
        break;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error.message, tool: name }) }],
      isError: true,
    };
  }
});

// ─── Start the server ────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[summit-store-ops] MCP server started (${allTools.length} tools registered)`);
  console.error(`[summit-store-ops] Categories: operations(${operationsTools.length}), incidents(${incidentTools.length}), knowledge(${knowledgeTools.length}), deployments(${deploymentTools.length})`);
}

main().catch((error) => {
  console.error('[summit-store-ops] Fatal error:', error);
  process.exit(1);
});
