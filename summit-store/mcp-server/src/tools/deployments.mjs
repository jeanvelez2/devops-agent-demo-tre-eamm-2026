/**
 * Deployment & Release tools — deployment history, diffs, and rollback
 * DevOps Agent uses these to correlate incidents with recent code changes
 * and provide rollback options during mitigation.
 */

import { getDeployments } from '../data/fixtures.mjs';

export const deploymentTools = [
  {
    name: 'list_deployments',
    description: 'List recent deployments across summit-store services. Returns deploy timestamps, commit SHAs, deployer, status, and duration. Critical for correlating incidents with recent changes.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Filter by service',
          enum: ['order-service', 'payment-service', 'inventory-service', 'infrastructure'],
        },
        status: {
          type: 'string',
          description: 'Filter by deployment status',
          enum: ['succeeded', 'failed', 'in-progress', 'rolled-back'],
        },
        limit: {
          type: 'number',
          description: 'Number of deployments to return (max 50)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'get_deployment_details',
    description: 'Get full details of a specific deployment including commit message, changed files, configuration changes, and deployment logs.',
    inputSchema: {
      type: 'object',
      properties: {
        deployment_id: {
          type: 'string',
          description: 'Deployment identifier (e.g., deploy-2026-0628-001)',
        },
      },
      required: ['deployment_id'],
    },
  },
  {
    name: 'get_deployment_diff',
    description: 'Get the code diff for a deployment — shows exactly what changed between the previous and current version. Includes file changes, config changes, and dependency updates.',
    inputSchema: {
      type: 'object',
      properties: {
        deployment_id: {
          type: 'string',
          description: 'Deployment identifier to get diff for',
        },
      },
      required: ['deployment_id'],
    },
  },
  {
    name: 'get_deployment_metrics',
    description: 'Get performance metrics before and after a deployment. Shows latency, error rate, and throughput changes to detect deployment-induced regressions.',
    inputSchema: {
      type: 'object',
      properties: {
        deployment_id: {
          type: 'string',
          description: 'Deployment identifier',
        },
      },
      required: ['deployment_id'],
    },
  },
  {
    name: 'rollback_deployment',
    description: 'Initiate a rollback to the previous deployment version for a service. Returns rollback plan with ETA and impact assessment.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Service to rollback',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
        target_version: {
          type: 'string',
          description: 'Specific version/commit to rollback to (optional — defaults to previous successful deployment)',
        },
        reason: {
          type: 'string',
          description: 'Reason for rollback',
        },
      },
      required: ['service_name', 'reason'],
    },
  },
  {
    name: 'get_release_pipeline_status',
    description: 'Get the current status of CI/CD pipelines for all services. Shows build status, pending deployments, and pipeline health.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Filter by service',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
      },
    },
  },
];

export function handleDeploymentTool(name, args) {
  switch (name) {
    case 'list_deployments':
      return handleListDeployments(args);

    case 'get_deployment_details':
      return handleGetDeploymentDetails(args.deployment_id);

    case 'get_deployment_diff':
      return handleGetDeploymentDiff(args.deployment_id);

    case 'get_deployment_metrics':
      return handleGetDeploymentMetrics(args.deployment_id);

    case 'rollback_deployment':
      return handleRollback(args);

    case 'get_release_pipeline_status':
      return handlePipelineStatus(args.service_name);

    default:
      return { error: `Unknown deployment tool: ${name}` };
  }
}

function handleListDeployments({ service_name, status, limit = 10 }) {
  let deployments = getDeployments();

  if (service_name) {
    deployments = deployments.filter(d => d.service === service_name);
  }
  if (status) {
    deployments = deployments.filter(d => d.status === status);
  }

  deployments = deployments.slice(0, Math.min(limit, 50));

  return {
    totalDeployments: deployments.length,
    deployments,
    summary: `${deployments.length} deployment(s)` +
      (service_name ? ` for ${service_name}` : '') +
      (status ? ` with status=${status}` : ''),
  };
}

function handleGetDeploymentDetails(deploymentId) {
  const deployments = getDeployments();
  const deployment = deployments.find(d => d.deploymentId === deploymentId);

  if (!deployment) {
    return { error: `Deployment ${deploymentId} not found`, availableDeployments: deployments.map(d => d.deploymentId) };
  }

  return {
    ...deployment,
    details: deployment.details || {},
    logs: deployment.logs || [],
  };
}

function handleGetDeploymentDiff(deploymentId) {
  const diffs = {
    'deploy-2026-0628-001': {
      deploymentId: 'deploy-2026-0628-001',
      service: 'payment-service',
      fromCommit: 'a3f8c21',
      toCommit: 'e7b4d09',
      filesChanged: 3,
      insertions: 12,
      deletions: 4,
      changes: [
        {
          file: 'services/payment-service/app.py',
          type: 'modified',
          diff: `@@ -15,7 +15,7 @@
 GATEWAY_URL = os.environ.get('GATEWAY_URL', 'https://httpbin.org/delay/1')
-GATEWAY_TIMEOUT_MS = int(os.environ.get('GATEWAY_TIMEOUT_MS', '5000'))
+GATEWAY_TIMEOUT_MS = int(os.environ.get('GATEWAY_TIMEOUT_MS', '100'))
 
 @app.route('/pay', methods=['POST'])`,
          impact: 'CRITICAL — Reduced payment gateway timeout from 5000ms to 100ms. Will cause timeouts under normal gateway latency.',
        },
        {
          file: 'services/payment-service/requirements.txt',
          type: 'modified',
          diff: `@@ -3,3 +3,4 @@
 flask==3.0.0
 requests==2.31.0
+prometheus-client==0.20.0`,
          impact: 'LOW — Added metrics library dependency',
        },
        {
          file: '.github/workflows/payment-service.yml',
          type: 'modified',
          diff: `@@ -22,6 +22,8 @@
     steps:
       - uses: actions/checkout@v4
+      - name: Run unit tests
+        run: cd services/payment-service && pytest`,
          impact: 'LOW — Added test step to CI pipeline',
        },
      ],
      configurationChanges: [
        {
          parameter: 'GATEWAY_TIMEOUT_MS',
          previousValue: '5000',
          newValue: '100',
          source: 'ECS Task Definition environment variable',
          riskLevel: 'CRITICAL',
          note: 'This change reduces the timeout below the expected gateway response time (avg 1-2s). Will cause systematic payment failures.',
        },
      ],
      riskAssessment: 'HIGH — Contains a configuration change that will cause payment gateway timeouts under normal operating conditions.',
    },
    'deploy-2026-0627-003': {
      deploymentId: 'deploy-2026-0627-003',
      service: 'order-service',
      fromCommit: 'b2c1a45',
      toCommit: 'a3f8c21',
      filesChanged: 2,
      insertions: 25,
      deletions: 3,
      changes: [
        {
          file: 'services/order-service/index.js',
          type: 'modified',
          diff: `@@ -45,6 +45,15 @@
 app.post('/orders', async (req, res) => {
+  // Apply discount if code provided
+  let finalAmount = req.body.quantity * 10; // $10 per unit
+  if (req.body.discountCode === 'SUMMIT20') {
+    finalAmount = finalAmount * 0.8;
+  } else if (req.body.discountCode === 'HALF') {
+    finalAmount = finalAmount * 0.5;
+  }
+
   const paymentResponse = await fetch(PAYMENT_SERVICE_URL + '/pay', {`,
          impact: 'LOW — Added discount code feature, no changes to critical path',
        },
        {
          file: 'services/order-service/package.json',
          type: 'modified',
          diff: `@@ -1,6 +1,6 @@
 {
   "name": "order-service",
-  "version": "1.2.0",
+  "version": "1.3.0",`,
          impact: 'NONE — Version bump only',
        },
      ],
      configurationChanges: [],
      riskAssessment: 'LOW — Feature addition with no impact on existing critical paths.',
    },
    'deploy-2026-0627-002': {
      deploymentId: 'deploy-2026-0627-002',
      service: 'inventory-service',
      fromCommit: '9d3e5f1',
      toCommit: 'b2c1a45',
      filesChanged: 1,
      insertions: 8,
      deletions: 2,
      changes: [
        {
          file: 'services/inventory-service/app.py',
          type: 'modified',
          diff: `@@ -62,5 +62,11 @@
 @app.route('/stock/status/<status>', methods=['GET'])
 def get_stock_by_status(status):
-    response = table.query(IndexName='status-index', ...)
+    # Added pagination support for status queries
+    response = table.query(
+        IndexName='status-index',
+        KeyConditionExpression=Key('status').eq(status),
+        Limit=100,
+    )
+    items = response.get('Items', [])`,
          impact: 'MEDIUM — Added Limit to GSI query. Reduces read capacity consumption but may miss items if > 100 exist per status.',
        },
      ],
      configurationChanges: [],
      riskAssessment: 'MEDIUM — Functional change to inventory queries. Could affect consumers expecting full result sets.',
    },
  };

  const diff = diffs[deploymentId];
  if (!diff) {
    return { error: `Diff not available for deployment ${deploymentId}`, availableDeployments: Object.keys(diffs) };
  }
  return diff;
}

function handleGetDeploymentMetrics(deploymentId) {
  const metrics = {
    'deploy-2026-0628-001': {
      deploymentId: 'deploy-2026-0628-001',
      service: 'payment-service',
      deployedAt: '2026-06-28T14:30:00Z',
      before: {
        period: '2026-06-28T13:30:00Z to 2026-06-28T14:30:00Z',
        p99Latency: '1.2s',
        errorRate: '0.1%',
        throughput: '45 req/min',
        successRate: '99.9%',
      },
      after: {
        period: '2026-06-28T14:30:00Z to 2026-06-28T15:30:00Z',
        p99Latency: '0.1s (timeout)',
        errorRate: '87.3%',
        throughput: '45 req/min',
        successRate: '12.7%',
        anomalyDetected: true,
      },
      comparison: {
        latencyChange: '-91.7% (misleading — responses are fast because they timeout immediately)',
        errorRateChange: '+87200% (from 0.1% to 87.3%)',
        successRateChange: '-87.2% (from 99.9% to 12.7%)',
      },
      verdict: 'REGRESSION DETECTED — Massive increase in error rate directly correlated with deployment. Immediate rollback recommended.',
      correlatedAlarms: ['order-service-error-rate', 'order-service-p99-latency'],
    },
    'deploy-2026-0627-003': {
      deploymentId: 'deploy-2026-0627-003',
      service: 'order-service',
      deployedAt: '2026-06-27T10:15:00Z',
      before: {
        period: '2026-06-27T09:15:00Z to 2026-06-27T10:15:00Z',
        p99Latency: '350ms',
        errorRate: '0.2%',
        throughput: '50 req/min',
        successRate: '99.8%',
      },
      after: {
        period: '2026-06-27T10:15:00Z to 2026-06-27T11:15:00Z',
        p99Latency: '355ms',
        errorRate: '0.2%',
        throughput: '52 req/min',
        successRate: '99.8%',
        anomalyDetected: false,
      },
      comparison: {
        latencyChange: '+1.4% (within normal variance)',
        errorRateChange: '0% (unchanged)',
        successRateChange: '0% (unchanged)',
      },
      verdict: 'HEALTHY — No regression detected after deployment.',
      correlatedAlarms: [],
    },
  };

  return metrics[deploymentId] || {
    error: `Metrics not available for deployment ${deploymentId}`,
    availableDeployments: Object.keys(metrics),
  };
}

function handleRollback({ service_name, target_version, reason }) {
  const deployments = getDeployments().filter(d => d.service === service_name && d.status === 'succeeded');
  const previousDeploy = deployments[1]; // second most recent successful

  return {
    rollbackId: `rollback-${Date.now().toString(36)}`,
    status: 'INITIATED',
    service: service_name,
    currentVersion: deployments[0]?.commitSha || 'unknown',
    targetVersion: target_version || previousDeploy?.commitSha || 'previous',
    reason,
    initiatedAt: new Date().toISOString(),
    estimatedCompletion: new Date(Date.now() + 180000).toISOString(), // ~3 minutes
    plan: [
      { step: 1, action: 'Update ECS task definition to previous image', status: 'in-progress' },
      { step: 2, action: 'Deploy new task definition with rolling update', status: 'pending' },
      { step: 3, action: 'Wait for healthy targets in ALB', status: 'pending' },
      { step: 4, action: 'Drain old tasks', status: 'pending' },
      { step: 5, action: 'Verify health checks pass', status: 'pending' },
      { step: 6, action: 'Monitor error rate for 5 minutes', status: 'pending' },
    ],
    impactAssessment: {
      expectedDowntime: 'Zero (rolling update)',
      affectedEndpoints: service_name === 'payment-service' ? ['/pay'] : service_name === 'order-service' ? ['/orders', '/chaos'] : ['/stock', '/reserve'],
      userImpact: 'Minimal — rolling deployment ensures availability during rollback',
    },
    notifications: [
      { channel: 'Slack (#summit-store-incidents)', message: `Rollback initiated for ${service_name}: ${reason}` },
      { channel: 'PagerDuty', message: 'Rollback in progress — monitoring' },
    ],
  };
}

function handlePipelineStatus(serviceName) {
  const pipelines = {
    'order-service': {
      service: 'order-service',
      repository: 'summit-store',
      branch: 'main',
      lastBuild: {
        id: 'build-9847',
        status: 'succeeded',
        commit: 'a3f8c21',
        message: 'feat: add discount code support',
        startedAt: '2026-06-27T10:10:00Z',
        completedAt: '2026-06-27T10:14:30Z',
        duration: '4m30s',
      },
      stages: [
        { name: 'Build', status: 'passed', duration: '45s' },
        { name: 'Unit Tests', status: 'passed', duration: '1m20s' },
        { name: 'Security Scan', status: 'passed', duration: '30s' },
        { name: 'Docker Build', status: 'passed', duration: '1m15s' },
        { name: 'Deploy to ECS', status: 'passed', duration: '40s' },
      ],
      missingStages: ['Canary Deployment', 'Integration Tests', 'Load Test'],
      pipelineHealth: 'DEGRADED — Missing canary deployment and integration test stages',
    },
    'payment-service': {
      service: 'payment-service',
      repository: 'summit-store',
      branch: 'main',
      lastBuild: {
        id: 'build-9852',
        status: 'succeeded',
        commit: 'e7b4d09',
        message: 'chore: reduce gateway timeout for testing',
        startedAt: '2026-06-28T14:25:00Z',
        completedAt: '2026-06-28T14:29:15Z',
        duration: '4m15s',
      },
      stages: [
        { name: 'Build', status: 'passed', duration: '40s' },
        { name: 'Unit Tests', status: 'passed', duration: '1m10s' },
        { name: 'Security Scan', status: 'passed', duration: '25s' },
        { name: 'Docker Build', status: 'passed', duration: '1m20s' },
        { name: 'Deploy to ECS', status: 'passed', duration: '40s' },
      ],
      missingStages: ['Canary Deployment', 'Integration Tests', 'Smoke Tests'],
      pipelineHealth: 'DEGRADED — No canary deployment means bad configs go live immediately (see deploy-2026-0628-001)',
    },
    'inventory-service': {
      service: 'inventory-service',
      repository: 'summit-store',
      branch: 'main',
      lastBuild: {
        id: 'build-9845',
        status: 'succeeded',
        commit: 'b2c1a45',
        message: 'fix: add pagination to status query',
        startedAt: '2026-06-27T09:50:00Z',
        completedAt: '2026-06-27T09:54:00Z',
        duration: '4m00s',
      },
      stages: [
        { name: 'Build', status: 'passed', duration: '35s' },
        { name: 'Unit Tests', status: 'passed', duration: '55s' },
        { name: 'Security Scan', status: 'passed', duration: '25s' },
        { name: 'Docker Build', status: 'passed', duration: '1m25s' },
        { name: 'Deploy to ECS', status: 'passed', duration: '40s' },
      ],
      missingStages: ['Canary Deployment', 'DynamoDB Capacity Check'],
      pipelineHealth: 'DEGRADED — No pre-deploy capacity validation for DynamoDB',
    },
  };

  if (serviceName) {
    return pipelines[serviceName] || { error: `Unknown service: ${serviceName}` };
  }

  return {
    pipelines: Object.values(pipelines),
    systemHealth: 'DEGRADED — All pipelines missing canary deployment stage',
    recommendation: 'Add canary deployment with automated rollback to all service pipelines',
  };
}
