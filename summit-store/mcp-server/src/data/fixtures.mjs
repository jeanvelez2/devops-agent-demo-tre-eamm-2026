/**
 * Realistic demo data fixtures for the summit-store MCP server.
 * Data is designed to tell a coherent story for the DevOps Agent demo:
 * - A recent deployment changed GATEWAY_TIMEOUT_MS from 5000 to 100
 * - This caused payment-service timeouts and cascading order failures
 * - Known architectural weaknesses (no circuit breaker) amplified the issue
 */

// ─── Operations Fixtures ─────────────────────────────────────────────────────

export function getServiceHealth(serviceName) {
  const health = {
    'order-service': {
      service: 'order-service',
      status: 'degraded',
      lastChecked: new Date().toISOString(),
      metrics: {
        cpu: '34%',
        memory: '52%',
        requestRate: '45 req/min',
        errorRate: '12.3%',
        p50Latency: '180ms',
        p99Latency: '520ms',
        activeConnections: 28,
      },

      activeAlerts: [
        { alarm: 'order-service-error-rate', state: 'ALARM', since: '2026-06-28T14:45:00Z' },
        { alarm: 'order-service-p99-latency', state: 'ALARM', since: '2026-06-28T14:42:00Z' },
      ],
      recentEvents: [
        { time: '2026-06-28T14:45:00Z', event: 'Error rate alarm triggered (12.3% > 5% threshold)' },
        { time: '2026-06-28T14:42:00Z', event: 'P99 latency alarm triggered (520ms > 500ms threshold)' },
        { time: '2026-06-28T14:30:00Z', event: 'Deployment deploy-2026-0628-001 completed (payment-service)' },
      ],
    },
    'payment-service': {
      service: 'payment-service',
      status: 'critical',
      lastChecked: new Date().toISOString(),
      metrics: {
        cpu: '12%',
        memory: '38%',
        requestRate: '45 req/min',
        errorRate: '87.3%',
        p50Latency: '100ms',
        p99Latency: '102ms',
        activeConnections: 45,
      },

      activeAlerts: [
        { alarm: 'payment-gateway-timeout', state: 'ALARM', since: '2026-06-28T14:32:00Z' },
      ],
      recentEvents: [
        { time: '2026-06-28T14:32:00Z', event: 'Gateway timeout rate spiked to 87% — GATEWAY_TIMEOUT_MS=100 too low' },
        { time: '2026-06-28T14:30:00Z', event: 'Deployment deploy-2026-0628-001 changed GATEWAY_TIMEOUT_MS from 5000 to 100' },
        { time: '2026-06-28T14:29:00Z', event: 'New task definition deployed via GitHub Actions' },
      ],
      rootCauseHint: 'GATEWAY_TIMEOUT_MS reduced to 100ms — external gateway avg response is 1-2s, causing systematic timeouts',
    },
    'inventory-service': {
      service: 'inventory-service',
      status: 'healthy',
      lastChecked: new Date().toISOString(),
      metrics: {
        cpu: '18%',
        memory: '41%',
        requestRate: '20 req/min',
        errorRate: '0.1%',
        p50Latency: '8ms',
        p99Latency: '45ms',
        activeConnections: 5,
      },
      activeAlerts: [],
      recentEvents: [
        { time: '2026-06-27T09:54:00Z', event: 'Deployment deploy-2026-0627-002 completed successfully' },
      ],
    },
  };
  return health[serviceName] || { error: `Unknown service: ${serviceName}` };
}


export function getRunbooks(runbookId) {
  const runbooks = {
    'high-latency': {
      id: 'high-latency',
      title: 'High Latency Response Runbook',
      severity: 'P2',
      lastUpdated: '2026-06-15',
      steps: [
        { step: 1, action: 'Check CloudWatch p99 latency dashboard', command: 'Open https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=summit-store' },
        { step: 2, action: 'Identify which service is slow using X-Ray trace map', command: 'aws xray get-service-graph --start-time $(date -u -v-1H +%s) --end-time $(date -u +%s)' },
        { step: 3, action: 'Check if latency correlates with a recent deployment', command: 'Check deployment history in CI/CD pipeline' },
        { step: 4, action: 'Check downstream dependency health (payment-service, DynamoDB)', command: 'curl http://payment-service.summit-store.local:5000/health' },
        { step: 5, action: 'If payment-service is slow, check GATEWAY_TIMEOUT_MS env var', command: 'aws ecs describe-task-definition --task-definition payment-service' },
        { step: 6, action: 'If caused by recent deploy, rollback to previous task definition', command: 'aws ecs update-service --cluster summit-store --service payment-service --task-definition payment-service:<previous-revision>' },
      ],
      escalation: 'If not resolved in 15 minutes, escalate to SRE team lead',
    },
    'payment-failures': {
      id: 'payment-failures',
      title: 'Payment Service Failure Runbook',
      severity: 'P1',
      lastUpdated: '2026-06-20',
      steps: [
        { step: 1, action: 'Check payment-service health endpoint', command: 'curl http://payment-service.summit-store.local:5000/health' },
        { step: 2, action: 'Check external gateway status page', url: 'https://status.paymentgateway.example.com' },
        { step: 3, action: 'Verify GATEWAY_TIMEOUT_MS is set to 5000ms (not lower)', command: 'aws ecs describe-task-definition --task-definition payment-service | grep GATEWAY_TIMEOUT_MS' },
        { step: 4, action: 'Check payment-service error logs for timeout patterns', command: 'aws logs filter-log-events --log-group-name /ecs/summit-store/payment-service --filter-pattern "timeout"' },
        { step: 5, action: 'If gateway is down, enable circuit breaker (NOTE: not yet implemented)', note: 'KNOWN GAP: No circuit breaker exists. Manual mitigation: return cached success or queue payments.' },
        { step: 6, action: 'Rollback payment-service if caused by config change', command: 'aws ecs update-service --cluster summit-store --service payment-service --task-definition payment-service:<previous-revision>' },
      ],
      escalation: 'Immediate escalation to Payments team lead (Marcus Rivera) and VP Engineering',
    },

    'dynamodb-throttling': {
      id: 'dynamodb-throttling',
      title: 'DynamoDB GSI Throttling Runbook',
      severity: 'P2',
      lastUpdated: '2026-06-10',
      steps: [
        { step: 1, action: 'Check DynamoDB throttling metrics', command: 'aws cloudwatch get-metric-data for ReadThrottleEvents on status-index GSI' },
        { step: 2, action: 'Verify current provisioned capacity', command: 'aws dynamodb describe-table --table-name summit-store-inventory' },
        { step: 3, action: 'Check if traffic spike is temporary (load test) or organic growth' },
        { step: 4, action: 'If temporary: wait for traffic to subside' },
        { step: 5, action: 'If persistent: increase GSI WCU from 100 to 500', command: 'aws dynamodb update-table --table-name summit-store-inventory --global-secondary-index-updates ...' },
        { step: 6, action: 'Long-term: enable auto-scaling on the GSI', note: 'Tracked in JIRA-4521' },
      ],
      escalation: 'Escalate to Data team lead (Priya Patel) if throttling persists > 30 minutes',
    },
    'deployment-rollback': {
      id: 'deployment-rollback',
      title: 'Emergency Deployment Rollback Runbook',
      severity: 'P1',
      lastUpdated: '2026-06-22',
      steps: [
        { step: 1, action: 'Identify the problematic deployment and service' },
        { step: 2, action: 'Get previous task definition revision', command: 'aws ecs list-task-definitions --family-prefix <service-name> --sort DESC' },
        { step: 3, action: 'Update service to previous revision', command: 'aws ecs update-service --cluster summit-store --service <service-name> --task-definition <service-name>:<prev-revision>' },
        { step: 4, action: 'Monitor new tasks becoming healthy (2-3 minutes)' },
        { step: 5, action: 'Verify error rate returns to baseline' },
        { step: 6, action: 'Post-mortem: document what went wrong and why canary would have caught it' },
      ],
      escalation: 'No escalation needed — any on-call engineer can execute this runbook',
    },
    'circuit-breaker-open': {
      id: 'circuit-breaker-open',
      title: 'Circuit Breaker Activation Runbook',
      severity: 'P2',
      lastUpdated: '2026-06-01',
      steps: [
        { step: 1, action: 'NOTE: Circuit breaker is NOT YET IMPLEMENTED for payment-service' },
        { step: 2, action: 'This runbook is aspirational — describes the DESIRED behavior' },
        { step: 3, action: 'When implemented: check circuit breaker state via /admin/circuit-breaker endpoint' },
        { step: 4, action: 'If open: verify downstream dependency health before resetting' },
        { step: 5, action: 'Manual reset: POST /admin/circuit-breaker/reset' },
        { step: 6, action: 'Monitor for re-opening (indicates persistent downstream failure)' },
      ],
      note: 'IMPLEMENTATION PENDING — DevOps Agent Prevention should recommend implementing this',
    },
  };
  return runbooks[runbookId] || { error: `Unknown runbook: ${runbookId}`, available: Object.keys(runbooks) };
}


export function getChaosState() {
  return {
    activeExperiments: [],
    recentExperiments: [
      {
        experimentId: 'exp-prev-001',
        target: 'order-service',
        faultType: 'latency',
        parameters: { delayMs: 2000 },
        status: 'completed',
        startedAt: '2026-06-26T15:00:00Z',
        endedAt: '2026-06-26T15:05:00Z',
        result: 'Latency alarm triggered correctly at 520ms p99. No circuit breaker activated (not implemented).',
      },
    ],
    scheduledExperiments: [],
    chaosEndpoint: {
      url: 'POST /chaos on order-service',
      description: 'Injects configurable latency delay into order processing',
      currentState: 'disabled',
    },
  };
}

// ─── Incident Fixtures ───────────────────────────────────────────────────────

export function getIncidents() {
  return [
    {
      incidentId: 'INC-2026-0042',
      title: 'Payment service systematic timeouts causing order failures',
      severity: 'critical',
      status: 'open',
      affectedServices: ['payment-service', 'order-service'],
      startedAt: '2026-06-28T14:32:00Z',
      detectedAt: '2026-06-28T14:42:00Z',
      assignee: 'Unassigned',
      customerImpact: '87% of orders failing — customers receiving 500 errors',

      timeline: [
        { time: '2026-06-28T14:30:00Z', event: 'Deployment deploy-2026-0628-001 completed (payment-service)' },
        { time: '2026-06-28T14:32:00Z', event: 'Payment gateway timeouts begin (GATEWAY_TIMEOUT_MS=100ms < gateway response time)' },
        { time: '2026-06-28T14:42:00Z', event: 'CloudWatch alarm: order-service-p99-latency triggered' },
        { time: '2026-06-28T14:45:00Z', event: 'CloudWatch alarm: order-service-error-rate triggered' },
        { time: '2026-06-28T14:47:00Z', event: 'DevOps Agent investigation started automatically' },
      ],
      relatedAlarms: ['order-service-p99-latency', 'order-service-error-rate'],
      impactAssessment: 'Revenue impact: ~$2,400/hour based on avg order value $53 × 45 orders/min × 87% failure rate',
      mitigationActions: [],
      probableCause: 'deploy-2026-0628-001 reduced GATEWAY_TIMEOUT_MS from 5000ms to 100ms',
    },
    {
      incidentId: 'INC-2026-0041',
      title: 'DynamoDB GSI throttling during load test',
      severity: 'medium',
      status: 'open',
      affectedServices: ['inventory-service'],
      startedAt: '2026-06-26T15:10:00Z',
      detectedAt: '2026-06-26T15:12:00Z',
      assignee: 'Priya Patel',
      customerImpact: 'Stock status queries returning stale data during throttling periods',
      timeline: [
        { time: '2026-06-26T15:00:00Z', event: 'Load test started — 200 req/s to inventory-service' },
        { time: '2026-06-26T15:10:00Z', event: 'DynamoDB GSI ReadThrottleEvents > 0' },
        { time: '2026-06-26T15:12:00Z', event: 'CloudWatch alarm: dynamodb-gsi-throttling triggered' },
        { time: '2026-06-26T15:30:00Z', event: 'Load test ended — throttling stopped' },
      ],
      relatedAlarms: ['dynamodb-gsi-throttling'],
      impactAssessment: 'Low customer impact — only affects /stock/status endpoint during high load',
      mitigationActions: ['Load test stopped manually', 'GSI capacity increase planned for next sprint'],
      probableCause: 'GSI provisioned at 5 WCU — insufficient for load test traffic pattern',
    },
  ];
}


export function getOnCallSchedule(team) {
  const schedules = {
    platform: {
      team: 'Platform',
      currentPrimary: { name: 'Alex Kim', alias: 'akim', phone: '+1-555-0101', slack: '@akim' },
      currentSecondary: { name: 'Jordan Lee', alias: 'jlee', phone: '+1-555-0102', slack: '@jlee' },
      rotationStart: '2026-06-28T09:00:00Z',
      rotationEnd: '2026-07-05T09:00:00Z',
      escalationChain: [
        { level: 1, name: 'Alex Kim (Primary On-call)', responseTime: '5 min' },
        { level: 2, name: 'Sarah Chen (Team Lead)', responseTime: '10 min' },
        { level: 3, name: 'VP Engineering', responseTime: '15 min' },
      ],
      services: ['order-service'],
    },
    payments: {
      team: 'Payments',
      currentPrimary: { name: 'Diana Santos', alias: 'dsantos', phone: '+1-555-0201', slack: '@dsantos' },
      currentSecondary: { name: 'Marcus Rivera', alias: 'mrivera', phone: '+1-555-0202', slack: '@mrivera' },
      rotationStart: '2026-06-28T09:00:00Z',
      rotationEnd: '2026-07-05T09:00:00Z',
      escalationChain: [
        { level: 1, name: 'Diana Santos (Primary On-call)', responseTime: '5 min' },
        { level: 2, name: 'Marcus Rivera (Team Lead)', responseTime: '10 min' },
        { level: 3, name: 'VP Engineering', responseTime: '15 min' },
      ],
      services: ['payment-service'],
    },
    data: {
      team: 'Data',
      currentPrimary: { name: 'Raj Mehta', alias: 'rmehta', phone: '+1-555-0301', slack: '@rmehta' },
      currentSecondary: { name: 'Priya Patel', alias: 'ppatel', phone: '+1-555-0302', slack: '@ppatel' },
      rotationStart: '2026-06-28T09:00:00Z',
      rotationEnd: '2026-07-05T09:00:00Z',
      escalationChain: [
        { level: 1, name: 'Raj Mehta (Primary On-call)', responseTime: '5 min' },
        { level: 2, name: 'Priya Patel (Team Lead)', responseTime: '10 min' },
        { level: 3, name: 'VP Engineering', responseTime: '15 min' },
      ],
      services: ['inventory-service'],
    },
    sre: {
      team: 'SRE',
      currentPrimary: { name: 'Casey Morgan', alias: 'cmorgan', phone: '+1-555-0401', slack: '@cmorgan' },
      currentSecondary: { name: 'Taylor Swift', alias: 'tswift', phone: '+1-555-0402', slack: '@tswift-sre' },
      rotationStart: '2026-06-28T09:00:00Z',
      rotationEnd: '2026-07-05T09:00:00Z',
      escalationChain: [
        { level: 1, name: 'Casey Morgan (Primary SRE)', responseTime: '5 min' },
        { level: 2, name: 'SRE Manager', responseTime: '10 min' },
        { level: 3, name: 'VP Infrastructure', responseTime: '15 min' },
      ],
      services: ['all — cross-cutting'],
    },
  };

  if (team) {
    return schedules[team] || { error: `Unknown team: ${team}`, availableTeams: Object.keys(schedules) };
  }
  return { teams: Object.values(schedules) };
}


export function getIncidentHistory(serviceName, daysBack = 30, includeResolved = true) {
  const history = {
    'order-service': [
      { incidentId: 'INC-2026-0042', title: 'Payment timeouts causing order failures', severity: 'critical', status: 'open', date: '2026-06-28', duration: 'ongoing', rootCause: 'GATEWAY_TIMEOUT_MS misconfiguration' },
      { incidentId: 'INC-2026-0035', title: 'Order service OOM during traffic spike', severity: 'high', status: 'resolved', date: '2026-06-15', duration: '23 min', rootCause: 'Memory limit too low for connection pooling under load' },
      { incidentId: 'INC-2026-0029', title: 'Elevated latency after dependency update', severity: 'medium', status: 'resolved', date: '2026-06-08', duration: '45 min', rootCause: 'New SDK version had slower serialization' },
    ],
    'payment-service': [
      { incidentId: 'INC-2026-0042', title: 'Systematic gateway timeouts', severity: 'critical', status: 'open', date: '2026-06-28', duration: 'ongoing', rootCause: 'GATEWAY_TIMEOUT_MS reduced to 100ms' },
      { incidentId: 'INC-2026-0031', title: 'External gateway 30-min outage', severity: 'high', status: 'resolved', date: '2026-06-10', duration: '30 min', rootCause: 'External gateway maintenance (unannounced)', lesson: 'Need circuit breaker — all payments failed during outage' },
      { incidentId: 'INC-2026-0022', title: 'Payment double-charging', severity: 'critical', status: 'resolved', date: '2026-06-01', duration: '2 hours', rootCause: 'Retry without idempotency key caused duplicate charges' },
    ],
    'inventory-service': [
      { incidentId: 'INC-2026-0041', title: 'DynamoDB GSI throttling during load test', severity: 'medium', status: 'open', date: '2026-06-26', duration: 'ongoing', rootCause: 'Under-provisioned GSI capacity' },
      { incidentId: 'INC-2026-0033', title: 'Stale inventory cache causing overselling', severity: 'high', status: 'resolved', date: '2026-06-12', duration: '1 hour', rootCause: 'SQS consumer lag during peak' },
    ],
  };

  let incidents = history[serviceName] || [];
  if (!includeResolved) {
    incidents = incidents.filter(i => i.status === 'open');
  }

  return {
    service: serviceName,
    daysBack,
    totalIncidents: incidents.length,
    incidents,
    patterns: analyzePatterns(incidents),
  };
}

function analyzePatterns(incidents) {
  if (incidents.length < 2) return 'Insufficient data for pattern analysis';
  return {
    recurringThemes: ['External dependency failures', 'Configuration changes causing outages'],
    meanTimeToDetect: '10 minutes',
    meanTimeToResolve: '35 minutes',
    recommendation: 'Implement circuit breakers and canary deployments to reduce blast radius',
  };
}


// ─── Knowledge Fixtures ──────────────────────────────────────────────────────

export function getArchitecture(scope) {
  const architectures = {
    'system-overview': {
      name: 'Summit Store',
      type: 'Microservices e-commerce backend',
      services: 3,
      infrastructure: 'AWS ECS Fargate + DynamoDB + SQS',
      description: 'Simplified e-commerce backend with order processing, payment handling, and inventory management. Deployed on ECS Fargate behind an ALB with CloudFront CDN.',
      dataFlow: 'Customer → CloudFront → ALB → order-service → (sync) payment-service → external gateway | order-service → (async) SQS → inventory-service → DynamoDB',
      observability: 'CloudWatch Metrics + Logs + X-Ray Traces + Application Signals',
      knownGaps: [
        'No circuit breaker on payment-service external calls',
        'No retry logic in order-service for payment calls',
        'DynamoDB GSI under-provisioned',
        'No canary deployments in CI/CD',
        'No alarm on SQS DLQ depth',
        'Overly broad IAM role on order-service (s3:*)',
      ],
    },
    'order-service': {
      name: 'order-service',
      runtime: 'Node.js 20 / Express',
      deployment: 'ECS Fargate (2 tasks, 512 CPU, 1024 MB)',
      endpoints: ['POST /orders', 'POST /chaos', 'DELETE /chaos', 'GET /health'],
      dependencies: ['payment-service (sync HTTP)', 'SQS queue (async)'],
      dataStore: 'None (stateless — delegates to payment and inventory)',
      scalingPolicy: 'Fixed count (2 tasks)',
      knownIssues: ['No retry logic on payment-service calls', 'Overly broad IAM (s3:*)'],
    },
    'payment-service': {
      name: 'payment-service',
      runtime: 'Python 3.12 / Flask',
      deployment: 'ECS Fargate (1 task, 512 CPU, 1024 MB)',
      endpoints: ['POST /pay', 'GET /health'],
      dependencies: ['External payment gateway (httpbin.org mock)'],
      configuration: { GATEWAY_TIMEOUT_MS: '5000 (default)', GATEWAY_URL: 'https://httpbin.org/delay/1' },
      dataStore: 'None (proxies to external gateway)',
      knownIssues: ['No circuit breaker', 'Single timeout parameter controls failure behavior'],
    },

    'inventory-service': {
      name: 'inventory-service',
      runtime: 'Python 3.12 / Flask',
      deployment: 'ECS Fargate (1 task, 512 CPU, 1024 MB)',
      endpoints: ['GET /stock/:itemId', 'GET /stock/status/:status', 'POST /reserve', 'GET /health'],
      dependencies: ['DynamoDB (summit-store-inventory)', 'SQS (consumer)'],
      dataStore: 'DynamoDB table with GSI (status-index)',
      knownIssues: ['GSI under-provisioned at 5 WCU', 'No auto-scaling configured'],
    },
    'data-flow': {
      orderFlow: [
        '1. Client POST /orders → ALB → order-service',
        '2. order-service POST /pay → payment-service (synchronous, no retry)',
        '3. payment-service → external gateway (timeout: GATEWAY_TIMEOUT_MS)',
        '4. On payment success: order-service → SQS SendMessage (async)',
        '5. inventory-service polls SQS → reserves stock in DynamoDB',
        '6. On SQS failure: message goes to DLQ (NO alarm configured)',
      ],
      criticalPath: 'Steps 1-3 are synchronous — gateway timeout directly impacts customer response time',
      failureModes: [
        'Gateway timeout → payment fails → order fails → customer sees 500',
        'DynamoDB throttling → stock query slow → status endpoint degraded',
        'SQS DLQ accumulation → orders placed but stock not reserved (silent failure)',
      ],
    },
    'infrastructure': {
      compute: 'ECS Fargate cluster (summit-store) in us-east-1',
      networking: 'VPC with public subnets only (no NAT), internet-facing ALB',
      cdn: 'CloudFront distribution with WAF',
      database: 'DynamoDB (summit-store-inventory) — provisioned mode, GSI: status-index (5 WCU/RCU)',
      messaging: 'SQS queue (order-events) + DLQ (order-events-dlq)',
      monitoring: 'CloudWatch alarms → SNS → Lambda → DevOps Agent webhook + EventBridge rule',
      secrets: 'Secrets Manager (summit-store-devops-agent-webhook)',
      iac: 'AWS CDK (TypeScript) — 6 stacks: Network, Database, Services, Monitoring, CDN, DevOpsAgentTrigger',
    },
  };
  return architectures[scope] || { error: `Unknown scope: ${scope}`, available: Object.keys(architectures) };
}


export function getSlaDefinitions(serviceName) {
  const slas = {
    'order-service': {
      service: 'order-service',
      availability: { target: '99.9%', current: '98.2%', status: 'BREACHED', errorBudgetRemaining: '-1.7%' },
      latency: { p99Target: '500ms', currentP99: '520ms', status: 'BREACHED' },
      errorRate: { target: '<1%', current: '12.3%', status: 'BREACHED' },
      throughput: { target: '100 req/min capacity', current: '45 req/min', status: 'OK' },
      measurement: 'Rolling 5-minute window, evaluated every minute',
    },
    'payment-service': {
      service: 'payment-service',
      availability: { target: '99.5%', current: '12.7%', status: 'CRITICAL BREACH', errorBudgetRemaining: '-86.8%' },
      latency: { p99Target: '3000ms', currentP99: '102ms', status: 'OK (misleading — fast timeout, not fast success)' },
      errorRate: { target: '<2%', current: '87.3%', status: 'CRITICAL BREACH' },
      throughput: { target: '50 req/min capacity', current: '45 req/min', status: 'OK' },
      measurement: 'Rolling 5-minute window, evaluated every minute',
      externalDependencySla: { gateway: '99.5% availability, 2s p99 latency' },
    },
    'inventory-service': {
      service: 'inventory-service',
      availability: { target: '99.9%', current: '99.9%', status: 'OK' },
      latency: { p99Target: '100ms', currentP99: '45ms', status: 'OK' },
      errorRate: { target: '<0.5%', current: '0.1%', status: 'OK' },
      throughput: { target: '200 req/min capacity', current: '20 req/min', status: 'OK' },
      measurement: 'Rolling 5-minute window, evaluated every minute',
      caveat: 'GSI queries may degrade under load due to provisioned capacity limits',
    },
    'all': {
      systemWide: {
        compositeAvailability: '98.2% (limited by weakest link: payment-service)',
        orderSuccessRate: { target: '99%', current: '12.7%', status: 'CRITICAL BREACH' },
        endToEndLatency: { target: '2000ms p99', current: '520ms p99', status: 'OK' },
      },
      services: ['order-service', 'payment-service', 'inventory-service'],
      overallStatus: 'CRITICAL — payment-service SLA breach cascading to order-service',
    },
  };
  return slas[serviceName] || { error: `Unknown service: ${serviceName}`, available: Object.keys(slas) };
}


export function getKnownIssues() {
  return [
    {
      id: 'KI-001',
      title: 'No circuit breaker on payment-service external gateway calls',
      category: 'resilience',
      severity: 'high',
      affectedServices: ['payment-service', 'order-service'],
      description: 'payment-service calls external gateway without a circuit breaker. When gateway is slow or down, all requests wait until timeout, consuming connection pool and causing cascade failure to order-service.',
      riskRating: 'HIGH — single gateway failure cascades to entire order pipeline',
      remediation: 'Implement circuit breaker pattern (e.g., opossum for Node.js or pybreaker for Python)',
      plannedFix: 'Q3 2026 — tracked in JIRA-4518',
      workaround: 'Manually reduce GATEWAY_TIMEOUT_MS or restart payment-service tasks',
    },
    {
      id: 'KI-002',
      title: 'No retry logic in order-service for payment-service calls',
      category: 'resilience',
      affectedServices: ['order-service'],
      severity: 'medium',
      description: 'order-service makes a single call to payment-service. If it fails for any transient reason (network blip, task restart), the entire order fails with no retry.',
      riskRating: 'MEDIUM — transient failures cause unnecessary order failures',
      remediation: 'Add exponential backoff retry (1-2 attempts) with idempotency key',
      plannedFix: 'Q3 2026 — tracked in JIRA-4519',
    },
    {
      id: 'KI-003',
      title: 'DynamoDB GSI under-provisioned capacity',
      category: 'performance',
      affectedServices: ['inventory-service'],
      severity: 'medium',
      description: 'status-index GSI provisioned at 5 WCU/RCU. Under load test (200 req/s), throttling occurs within seconds.',
      riskRating: 'MEDIUM — only affects /stock/status endpoint under high load',
      remediation: 'Enable auto-scaling on GSI or increase provisioned capacity to 500 WCU',
      plannedFix: 'Q3 2026 — tracked in JIRA-4521',
    },
    {
      id: 'KI-004',
      title: 'No canary deployment stage in CI/CD pipeline',
      category: 'deployment',
      affectedServices: ['order-service', 'payment-service', 'inventory-service'],
      severity: 'high',
      description: 'All services deploy directly to 100% traffic with no canary validation. Bad deploys (like the GATEWAY_TIMEOUT_MS change) go live immediately without gradual rollout.',
      riskRating: 'HIGH — bad deployments affect all traffic instantly',
      remediation: 'Add CodeDeploy blue/green or canary deployment with automated rollback on alarm',
      plannedFix: 'Q3 2026 — tracked in JIRA-4520',
    },
    {
      id: 'KI-005',
      title: 'Missing alarm on SQS dead-letter queue depth',
      category: 'observability',
      affectedServices: ['inventory-service'],
      severity: 'medium',
      description: 'When messages fail processing and go to the DLQ, there is no alarm to notify the team. Failed inventory reservations go unnoticed.',
      riskRating: 'MEDIUM — orders appear successful but stock is not actually reserved',
      remediation: 'Add CloudWatch alarm on ApproximateNumberOfMessagesVisible > 0 for the DLQ',
      plannedFix: 'Next sprint — tracked in JIRA-4522',
    },
    {
      id: 'KI-006',
      title: 'Overly broad IAM role on order-service',
      category: 'security',
      affectedServices: ['order-service'],
      severity: 'high',
      description: 'order-service task role has s3:* on * — should be scoped to specific bucket and actions needed.',
      riskRating: 'HIGH — compromised service could access any S3 bucket in the account',
      remediation: 'Scope to specific bucket ARN and only required actions (s3:PutObject on order-receipts bucket)',
      plannedFix: 'Q3 2026 security sprint — tracked in JIRA-4525',
    },
  ];
}


export function getTeamRunbooks() {
  return getRunbooks;
}

// ─── Deployment Fixtures ─────────────────────────────────────────────────────

export function getDeployments() {
  return [
    {
      deploymentId: 'deploy-2026-0628-001',
      service: 'payment-service',
      status: 'succeeded',
      commitSha: 'e7b4d09',
      commitMessage: 'chore: reduce gateway timeout for testing',
      author: 'vtjean',
      deployedAt: '2026-06-28T14:30:00Z',
      duration: '4m15s',
      environment: 'production',
      triggeredBy: 'GitHub Actions (push to main)',
      details: {
        taskDefinitionRevision: 'payment-service:14',
        previousRevision: 'payment-service:13',
        imageTag: 'e7b4d09-20260628',
        configChanges: [{ key: 'GATEWAY_TIMEOUT_MS', from: '5000', to: '100' }],
      },
      logs: [
        '14:25:00 Build started (commit e7b4d09)',
        '14:26:10 Docker image built successfully',
        '14:27:30 Image pushed to ECR',
        '14:28:00 Task definition updated (rev 14)',
        '14:28:15 ECS service update initiated',
        '14:30:00 New tasks healthy — deployment complete',
      ],
      postDeployAlarms: ['order-service-error-rate (triggered +12min)', 'order-service-p99-latency (triggered +12min)'],
    },
    {
      deploymentId: 'deploy-2026-0627-003',
      service: 'order-service',
      status: 'succeeded',
      commitSha: 'a3f8c21',
      commitMessage: 'feat: add discount code support',
      author: 'vtjean',
      deployedAt: '2026-06-27T10:15:00Z',
      duration: '4m30s',
      environment: 'production',
      triggeredBy: 'GitHub Actions (push to main)',
      details: {
        taskDefinitionRevision: 'order-service:22',
        previousRevision: 'order-service:21',
        imageTag: 'a3f8c21-20260627',
        configChanges: [],
      },
      logs: [
        '10:10:00 Build started',
        '10:11:30 Tests passed (12/12)',
        '10:12:45 Image pushed to ECR',
        '10:13:00 Task definition updated',
        '10:15:00 Deployment complete — no alarms triggered',
      ],
      postDeployAlarms: [],
    },
    {
      deploymentId: 'deploy-2026-0627-002',
      service: 'inventory-service',
      status: 'succeeded',
      commitSha: 'b2c1a45',
      commitMessage: 'fix: add pagination to status query',
      author: 'ppatel',
      deployedAt: '2026-06-27T09:54:00Z',
      duration: '4m00s',
      environment: 'production',
      triggeredBy: 'GitHub Actions (push to main)',
      details: {
        taskDefinitionRevision: 'inventory-service:9',
        previousRevision: 'inventory-service:8',
        imageTag: 'b2c1a45-20260627',
        configChanges: [],
      },
      logs: [
        '09:50:00 Build started',
        '09:51:20 Tests passed (8/8)',
        '09:52:30 Image pushed to ECR',
        '09:52:45 Task definition updated',
        '09:54:00 Deployment complete',
      ],
      postDeployAlarms: [],
    },
    {
      deploymentId: 'deploy-2026-0625-001',
      service: 'infrastructure',
      status: 'succeeded',
      commitSha: 'c4d2e67',
      commitMessage: 'feat: add DevOps Agent trigger stack (SNS + EventBridge)',
      author: 'vtjean',
      deployedAt: '2026-06-25T16:00:00Z',
      duration: '8m30s',
      environment: 'production',
      triggeredBy: 'Manual (cdk deploy)',
      details: {
        stacksDeployed: ['SummitStoreDevOpsAgentTrigger'],
        resourcesCreated: ['Lambda function', 'SNS subscription', 'EventBridge rule', 'Secrets Manager secret'],
      },
      logs: [
        '16:00:00 CDK deploy started',
        '16:04:00 CloudFormation stack creation in progress',
        '16:08:30 Stack creation complete — all resources active',
      ],
      postDeployAlarms: [],
    },
  ];
}
