/**
 * Operations tools — service health, runbooks, and chaos injection
 * DevOps Agent uses these during investigations to get real-time service context.
 */

import { getServiceHealth, getRunbooks, getChaosState } from '../data/fixtures.mjs';

export const operationsTools = [
  {
    name: 'get_service_health',
    description: 'Get current health status, metrics, and recent events for a summit-store service. Returns CPU/memory usage, request rates, error rates, p99 latency, and active alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Service name: order-service, payment-service, or inventory-service',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
      },
      required: ['service_name'],
    },
  },
  {
    name: 'get_service_dependencies',
    description: 'Get the dependency graph for a service including upstream callers and downstream dependencies with health status of each.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Service name: order-service, payment-service, or inventory-service',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
      },
      required: ['service_name'],
    },
  },
  {
    name: 'get_runbook',
    description: 'Retrieve the operational runbook for a specific scenario. Contains step-by-step mitigation procedures, escalation contacts, and rollback instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        runbook_id: {
          type: 'string',
          description: 'Runbook identifier: high-latency, payment-failures, dynamodb-throttling, deployment-rollback, circuit-breaker-open',
          enum: ['high-latency', 'payment-failures', 'dynamodb-throttling', 'deployment-rollback', 'circuit-breaker-open'],
        },
      },
      required: ['runbook_id'],
    },
  },
  {
    name: 'get_chaos_status',
    description: 'Get current chaos engineering injection status across all services. Shows active fault injections, scheduled experiments, and recent results.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'trigger_chaos',
    description: 'Inject a fault into a service for testing resilience. Supports latency injection, error injection, and resource exhaustion simulations.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Target service',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
        fault_type: {
          type: 'string',
          description: 'Type of fault to inject',
          enum: ['latency', 'error', 'timeout', 'cpu-spike'],
        },
        duration_seconds: {
          type: 'number',
          description: 'Duration of the fault injection in seconds (max 300)',
          default: 60,
        },
        parameters: {
          type: 'object',
          description: 'Fault-specific parameters (e.g., {delayMs: 2000} for latency, {errorRate: 0.5} for error)',
        },
      },
      required: ['service_name', 'fault_type'],
    },
  },
];

export function handleOperationsTool(name, args) {
  switch (name) {
    case 'get_service_health':
      return getServiceHealth(args.service_name);

    case 'get_service_dependencies':
      return getServiceDependencies(args.service_name);

    case 'get_runbook':
      return getRunbooks(args.runbook_id);

    case 'get_chaos_status':
      return getChaosState();

    case 'trigger_chaos':
      return triggerChaos(args);

    default:
      return { error: `Unknown operations tool: ${name}` };
  }
}

function getServiceDependencies(serviceName) {
  const deps = {
    'order-service': {
      service: 'order-service',
      upstreamCallers: [
        { name: 'ALB (internet-facing)', protocol: 'HTTP', healthStatus: 'healthy' },
        { name: 'load-test-client', protocol: 'HTTP', healthStatus: 'healthy' },
      ],
      downstreamDependencies: [
        { name: 'payment-service', protocol: 'HTTP (sync)', port: 5000, healthStatus: 'healthy', circuitBreaker: 'NOT_CONFIGURED' },
        { name: 'SQS (order-events)', protocol: 'AWS SDK', healthStatus: 'healthy' },
        { name: 'CloudWatch', protocol: 'AWS SDK', healthStatus: 'healthy' },
      ],
      criticalPath: 'ALB → order-service → payment-service → external-gateway',
      singlePointsOfFailure: ['payment-service (no circuit breaker, no retry logic)'],
    },
    'payment-service': {
      service: 'payment-service',
      upstreamCallers: [
        { name: 'order-service', protocol: 'HTTP', port: 5000, healthStatus: 'healthy' },
      ],
      downstreamDependencies: [
        { name: 'external-payment-gateway (httpbin.org)', protocol: 'HTTPS (sync)', healthStatus: 'degraded', circuitBreaker: 'NOT_CONFIGURED', timeout: '5000ms (env: GATEWAY_TIMEOUT_MS)' },
        { name: 'CloudWatch', protocol: 'AWS SDK', healthStatus: 'healthy' },
      ],
      criticalPath: 'order-service → payment-service → external-gateway',
      singlePointsOfFailure: ['external-gateway (no circuit breaker, timeout-only protection)'],
    },
    'inventory-service': {
      service: 'inventory-service',
      upstreamCallers: [
        { name: 'SQS (order-events)', protocol: 'AWS SDK (async)', healthStatus: 'healthy' },
      ],
      downstreamDependencies: [
        { name: 'DynamoDB (summit-store-inventory)', protocol: 'AWS SDK', healthStatus: 'healthy', throttlingRisk: 'HIGH — GSI under-provisioned' },
        { name: 'CloudWatch', protocol: 'AWS SDK', healthStatus: 'healthy' },
      ],
      criticalPath: 'SQS → inventory-service → DynamoDB',
      singlePointsOfFailure: ['DynamoDB GSI (status-index) — 5 WCU limit, no auto-scaling'],
    },
  };

  return deps[serviceName] || { error: `Unknown service: ${serviceName}` };
}

function triggerChaos({ service_name, fault_type, duration_seconds = 60, parameters = {} }) {
  const experimentId = `exp-${Date.now().toString(36)}`;
  return {
    experimentId,
    status: 'RUNNING',
    target: service_name,
    faultType: fault_type,
    durationSeconds: Math.min(duration_seconds, 300),
    parameters,
    startedAt: new Date().toISOString(),
    expectedEndAt: new Date(Date.now() + Math.min(duration_seconds, 300) * 1000).toISOString(),
    message: `Chaos experiment ${experimentId} started. ${fault_type} fault injected into ${service_name} for ${Math.min(duration_seconds, 300)}s.`,
    monitoringUrl: `https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=summit-store`,
    rollbackCommand: `curl -X DELETE http://localhost:3000/chaos`,
  };
}
