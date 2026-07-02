/**
 * Internal Knowledge tools — architecture, SLAs, known issues, and team runbooks
 * DevOps Agent uses these to contextualize findings with institutional knowledge
 * that isn't available in observability data alone.
 */

import { getArchitecture, getSlaDefinitions, getKnownIssues, getTeamRunbooks } from '../data/fixtures.mjs';

export const knowledgeTools = [
  {
    name: 'get_architecture',
    description: 'Get the architecture documentation for summit-store or a specific service. Returns component descriptions, data flows, technology choices, and design decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Architecture scope to retrieve',
          enum: ['system-overview', 'order-service', 'payment-service', 'inventory-service', 'data-flow', 'infrastructure'],
        },
      },
      required: ['scope'],
    },
  },
  {
    name: 'get_sla_definitions',
    description: 'Get SLA/SLO definitions for summit-store services. Returns availability targets, latency budgets, error budgets, and measurement methodology.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Service to get SLAs for, or "all" for system-wide SLAs',
          enum: ['order-service', 'payment-service', 'inventory-service', 'all'],
        },
      },
      required: ['service_name'],
    },
  },
  {
    name: 'get_known_issues',
    description: 'Get known issues, technical debt, and architectural weaknesses that the team is aware of but has not yet resolved. Includes risk ratings and planned remediation timelines.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Filter by affected service',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
        category: {
          type: 'string',
          description: 'Filter by issue category',
          enum: ['resilience', 'performance', 'security', 'observability', 'deployment'],
        },
      },
    },
  },
  {
    name: 'get_design_decisions',
    description: 'Get Architecture Decision Records (ADRs) explaining why specific technology and design choices were made. Useful for understanding constraints during incident response.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Decision topic to look up',
          enum: ['async-messaging', 'database-choice', 'service-communication', 'deployment-strategy', 'observability-stack', 'security-model'],
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_team_contacts',
    description: 'Get team ownership information, communication channels, and escalation paths for summit-store services.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Service to get team info for',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
      },
      required: ['service_name'],
    },
  },
];

export function handleKnowledgeTool(name, args) {
  switch (name) {
    case 'get_architecture':
      return getArchitecture(args.scope);

    case 'get_sla_definitions':
      return getSlaDefinitions(args.service_name);

    case 'get_known_issues':
      return handleGetKnownIssues(args);

    case 'get_design_decisions':
      return getDesignDecision(args.topic);

    case 'get_team_contacts':
      return getTeamContacts(args.service_name);

    default:
      return { error: `Unknown knowledge tool: ${name}` };
  }
}

function handleGetKnownIssues({ service_name, category }) {
  let issues = getKnownIssues();

  if (service_name) {
    issues = issues.filter(i => i.affectedServices.includes(service_name));
  }
  if (category) {
    issues = issues.filter(i => i.category === category);
  }

  return {
    totalIssues: issues.length,
    issues,
    summary: `${issues.length} known issue(s)` +
      (service_name ? ` affecting ${service_name}` : '') +
      (category ? ` in category ${category}` : ''),
  };
}

function getDesignDecision(topic) {
  const decisions = {
    'async-messaging': {
      id: 'ADR-001',
      title: 'Use SQS for order-to-inventory communication',
      status: 'Accepted',
      date: '2026-05-15',
      context: 'order-service needs to notify inventory-service of new orders. Synchronous calls would create tight coupling and cascade failures if inventory-service is slow.',
      decision: 'Use Amazon SQS with a dead-letter queue (DLQ) for async order event delivery. Inventory-service polls the queue and processes reservations independently.',
      consequences: [
        'Positive: order-service is not blocked by inventory-service latency',
        'Positive: natural backpressure via queue depth',
        'Negative: eventual consistency — stock may briefly show as available after an order',
        'Negative: DLQ messages require manual investigation if processing fails repeatedly',
      ],
      alternatives: ['SNS fan-out (rejected: no replay)', 'EventBridge (rejected: overkill for single consumer)', 'Direct HTTP call (rejected: tight coupling)'],
    },
    'database-choice': {
      id: 'ADR-002',
      title: 'Use DynamoDB for inventory with GSI on status',
      status: 'Accepted',
      date: '2026-05-15',
      context: 'Inventory lookups need sub-10ms latency. Access patterns: get by itemId (primary), query by status (secondary).',
      decision: 'Single DynamoDB table with itemId as partition key. GSI (status-index) with status as partition key for status-based queries.',
      consequences: [
        'Positive: single-digit ms reads at any scale',
        'Positive: fully managed, no patching',
        'Negative: GSI has separate capacity — must be provisioned independently',
        'Negative: hot partition risk if one status dominates (e.g., "available")',
        'Known risk: GSI is intentionally under-provisioned at 100 WCU for demo purposes',
      ],
      alternatives: ['Aurora Serverless (rejected: higher latency for simple key-value)', 'ElastiCache (rejected: added complexity)'],
    },
    'service-communication': {
      id: 'ADR-003',
      title: 'Synchronous HTTP between order-service and payment-service',
      status: 'Accepted (with known risks)',
      date: '2026-05-15',
      context: 'Payment must complete before confirming an order. Async payment would create poor UX.',
      decision: 'order-service calls payment-service synchronously via HTTP. Cloud Map provides service discovery.',
      consequences: [
        'Positive: simple request/response model',
        'Positive: immediate payment confirmation to customer',
        'Negative: payment-service latency directly impacts order-service latency',
        'Negative: payment-service failure causes order-service failure',
        'KNOWN GAP: No circuit breaker implemented — cascade failure risk is HIGH',
        'KNOWN GAP: No retry logic — single failure = order failure',
      ],
      alternatives: ['Saga pattern with SQS (rejected: UX latency)', 'Step Functions orchestration (rejected: complexity for demo)'],
    },
    'deployment-strategy': {
      id: 'ADR-004',
      title: 'ECS Fargate with rolling deployments',
      status: 'Accepted (gaps identified)',
      date: '2026-05-15',
      context: 'Need containerized services with minimal ops overhead.',
      decision: 'ECS Fargate with rolling updates. GitHub Actions CI/CD pushes new images and updates task definitions.',
      consequences: [
        'Positive: zero server management',
        'Positive: automatic scaling based on CPU/memory',
        'Negative: cold starts during scale-out events',
        'KNOWN GAP: No canary deployment stage — bad deploys go to 100% immediately',
        'KNOWN GAP: No automated rollback on health check failure',
      ],
      alternatives: ['EKS (rejected: ops overhead for 3 services)', 'Lambda (rejected: long-running request patterns)'],
    },
    'observability-stack': {
      id: 'ADR-005',
      title: 'CloudWatch + X-Ray + Application Signals for full-stack observability',
      status: 'Accepted',
      date: '2026-05-15',
      context: 'Need metrics, logs, and traces with minimal agent configuration.',
      decision: 'ADOT sidecar for metrics/traces export. Structured JSON logging to CloudWatch Logs. X-Ray for distributed tracing. Application Signals for SLO monitoring.',
      consequences: [
        'Positive: unified AWS-native observability',
        'Positive: automatic service map via X-Ray',
        'Positive: SLO tracking with Application Signals',
        'Negative: ADOT sidecar adds ~128MB memory per task',
        'KNOWN GAP: No alarm on SQS DLQ depth — failed messages go unnoticed',
      ],
      alternatives: ['Datadog (rejected: cost for demo)', 'Grafana Cloud (rejected: additional integration)'],
    },
    'security-model': {
      id: 'ADR-006',
      title: 'IAM roles per service with task-level isolation',
      status: 'Accepted (with known violation)',
      date: '2026-05-15',
      context: 'Each service should have least-privilege access to only its required resources.',
      decision: 'Separate IAM task role per ECS service. Roles scoped to specific resources.',
      consequences: [
        'Positive: blast radius contained if one service is compromised',
        'Positive: CloudTrail shows exactly which service accessed what',
        'KNOWN VIOLATION: order-service role has s3:* on * — overly broad, should be scoped to specific bucket and actions',
        'Remediation planned: Q3 2026 security sprint',
      ],
      alternatives: ['Shared role (rejected: no isolation)', 'IRSA equivalent (rejected: not applicable to ECS)'],
    },
  };

  return decisions[topic] || { error: `Unknown topic: ${topic}`, availableTopics: Object.keys(decisions) };
}

function getTeamContacts(serviceName) {
  const contacts = {
    'order-service': {
      service: 'order-service',
      owningTeam: 'Platform Team',
      teamLead: 'Sarah Chen',
      slackChannel: '#summit-store-platform',
      oncallRotation: 'platform-oncall',
      escalationPath: ['Platform On-call', 'Sarah Chen (Team Lead)', 'VP Engineering'],
      codeOwners: ['@platform-team'],
      repository: 'summit-store/services/order-service',
      documentation: 'https://wiki.internal/summit-store/order-service',
    },
    'payment-service': {
      service: 'payment-service',
      owningTeam: 'Payments Team',
      teamLead: 'Marcus Rivera',
      slackChannel: '#summit-store-payments',
      oncallRotation: 'payments-oncall',
      escalationPath: ['Payments On-call', 'Marcus Rivera (Team Lead)', 'VP Engineering'],
      codeOwners: ['@payments-team'],
      repository: 'summit-store/services/payment-service',
      documentation: 'https://wiki.internal/summit-store/payment-service',
      externalDependencyContact: {
        vendor: 'Payment Gateway Inc.',
        supportEmail: 'support@paymentgateway.example.com',
        statusPage: 'https://status.paymentgateway.example.com',
        sla: '99.5% availability',
      },
    },
    'inventory-service': {
      service: 'inventory-service',
      owningTeam: 'Data Team',
      teamLead: 'Priya Patel',
      slackChannel: '#summit-store-data',
      oncallRotation: 'data-oncall',
      escalationPath: ['Data On-call', 'Priya Patel (Team Lead)', 'VP Engineering'],
      codeOwners: ['@data-team'],
      repository: 'summit-store/services/inventory-service',
      documentation: 'https://wiki.internal/summit-store/inventory-service',
    },
  };

  return contacts[serviceName] || { error: `Unknown service: ${serviceName}` };
}
