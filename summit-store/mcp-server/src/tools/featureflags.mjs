/**
 * Feature Flag tools — flag state queries and containment actions
 * DevOps Agent uses these during incident response to recommend feature flag
 * toggles as immediate containment (kill switch) before a full rollback,
 * and during release readiness reviews to recommend flag coverage.
 */

// In-memory feature flag state (simulates a LaunchDarkly/CloudWatch Evidently backend)
const featureFlags = {
  'payment-gateway-v2': {
    key: 'payment-gateway-v2',
    name: 'Payment Gateway V2',
    description: 'Routes payment processing through the new gateway integration with retry logic',
    service: 'payment-service',
    state: 'enabled',
    rolloutPercentage: 100,
    createdAt: '2026-06-15T09:00:00Z',
    lastModified: '2026-06-25T14:30:00Z',
    lastModifiedBy: 'marcus.rivera',
    tags: ['payment', 'gateway', 'critical-path'],
    killSwitch: true,
    dependencies: ['external-payment-gateway'],
    impactWhenDisabled: 'Falls back to legacy gateway (slower but more stable, no retry logic)',
  },
  'async-inventory-batching': {
    key: 'async-inventory-batching',
    name: 'Async Inventory Batching',
    description: 'Batches SQS messages to inventory-service in groups of 10 for improved throughput',
    service: 'order-service',
    state: 'enabled',
    rolloutPercentage: 50,
    createdAt: '2026-06-20T11:00:00Z',
    lastModified: '2026-06-27T16:00:00Z',
    lastModifiedBy: 'priya.patel',
    tags: ['inventory', 'performance', 'sqs'],
    killSwitch: false,
    dependencies: ['summit-store-orders-queue'],
    impactWhenDisabled: 'Returns to single-message processing (lower throughput, higher per-message latency)',
  },
  'order-discount-codes': {
    key: 'order-discount-codes',
    name: 'Order Discount Codes',
    description: 'Enables promotional discount codes (SUMMIT20, HALF) on order creation',
    service: 'order-service',
    state: 'enabled',
    rolloutPercentage: 100,
    createdAt: '2026-06-27T10:00:00Z',
    lastModified: '2026-06-27T10:15:00Z',
    lastModifiedBy: 'sarah.chen',
    tags: ['orders', 'promotion', 'revenue'],
    killSwitch: false,
    dependencies: [],
    impactWhenDisabled: 'Discount codes silently ignored — orders process at full price',
  },
  'enhanced-logging': {
    key: 'enhanced-logging',
    name: 'Enhanced Debug Logging',
    description: 'Adds verbose trace-level logging for payment and inventory flows',
    service: 'all',
    state: 'disabled',
    rolloutPercentage: 0,
    createdAt: '2026-06-22T08:00:00Z',
    lastModified: '2026-06-28T15:00:00Z',
    lastModifiedBy: 'devops-agent',
    tags: ['observability', 'debug', 'temporary'],
    killSwitch: false,
    dependencies: [],
    impactWhenDisabled: 'Standard logging levels only — reduced CloudWatch Logs volume',
  },
  'circuit-breaker-payment': {
    key: 'circuit-breaker-payment',
    name: 'Payment Circuit Breaker',
    description: 'Enables circuit breaker pattern on payment-service gateway calls (pybreaker)',
    service: 'payment-service',
    state: 'disabled',
    rolloutPercentage: 0,
    createdAt: '2026-06-29T09:00:00Z',
    lastModified: '2026-06-29T09:00:00Z',
    lastModifiedBy: 'devops-agent',
    tags: ['resilience', 'circuit-breaker', 'payment', 'recommended'],
    killSwitch: false,
    dependencies: ['external-payment-gateway'],
    impactWhenDisabled: 'No circuit breaker — gateway failures cascade directly to order-service',
    note: 'Created from DevOps Agent prevention recommendation after INC-2026-0042',
  },
};

// Audit log for flag changes
const flagAuditLog = [
  {
    timestamp: '2026-06-28T15:02:00Z',
    flag: 'enhanced-logging',
    action: 'enabled',
    actor: 'devops-agent',
    reason: 'Automatically enabled during investigation of INC-2026-0042 for additional diagnostic data',
  },
  {
    timestamp: '2026-06-28T16:45:00Z',
    flag: 'enhanced-logging',
    action: 'disabled',
    actor: 'devops-agent',
    reason: 'Investigation complete — returning to standard logging to reduce costs',
  },
  {
    timestamp: '2026-06-25T14:30:00Z',
    flag: 'payment-gateway-v2',
    action: 'rollout-100',
    actor: 'marcus.rivera',
    reason: 'V2 gateway stable in canary for 72h — promoting to full traffic',
  },
];

export const featureFlagTools = [
  {
    name: 'get_feature_flags',
    description: 'List all feature flags for summit-store services. Returns flag state, rollout percentage, dependencies, and kill-switch designation. Use during investigations to check if a flag change correlates with an incident, or during release reviews to assess flag coverage.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Filter flags by service',
          enum: ['order-service', 'payment-service', 'inventory-service', 'all'],
        },
        state: {
          type: 'string',
          description: 'Filter by flag state',
          enum: ['enabled', 'disabled'],
        },
        kill_switch_only: {
          type: 'boolean',
          description: 'Only return flags marked as kill switches (for incident containment)',
          default: false,
        },
      },
    },
  },
  {
    name: 'get_feature_flag_details',
    description: 'Get detailed information about a specific feature flag including its current state, rollout history, dependencies, and impact assessment for toggling.',
    inputSchema: {
      type: 'object',
      properties: {
        flag_key: {
          type: 'string',
          description: 'Feature flag key identifier',
          enum: ['payment-gateway-v2', 'async-inventory-batching', 'order-discount-codes', 'enhanced-logging', 'circuit-breaker-payment'],
        },
      },
      required: ['flag_key'],
    },
  },
  {
    name: 'toggle_feature_flag',
    description: 'Toggle a feature flag on or off. Use as immediate incident containment (kill switch) or to enable a remediation flag. Returns impact assessment and confirmation. Requires reason for audit trail.',
    inputSchema: {
      type: 'object',
      properties: {
        flag_key: {
          type: 'string',
          description: 'Feature flag key to toggle',
          enum: ['payment-gateway-v2', 'async-inventory-batching', 'order-discount-codes', 'enhanced-logging', 'circuit-breaker-payment'],
        },
        action: {
          type: 'string',
          description: 'Action to perform',
          enum: ['enable', 'disable'],
        },
        reason: {
          type: 'string',
          description: 'Reason for the toggle (recorded in audit log)',
        },
        rollout_percentage: {
          type: 'number',
          description: 'Rollout percentage (0-100). Only applies when action is "enable".',
          default: 100,
        },
      },
      required: ['flag_key', 'action', 'reason'],
    },
  },
  {
    name: 'get_flag_audit_log',
    description: 'Get the audit log of feature flag changes. Shows who changed what flag, when, and why. Critical for correlating flag changes with incidents.',
    inputSchema: {
      type: 'object',
      properties: {
        flag_key: {
          type: 'string',
          description: 'Filter audit log by specific flag (optional — returns all if omitted)',
          enum: ['payment-gateway-v2', 'async-inventory-batching', 'order-discount-codes', 'enhanced-logging', 'circuit-breaker-payment'],
        },
        hours_back: {
          type: 'number',
          description: 'Hours of audit history to retrieve (default: 72)',
          default: 72,
        },
      },
    },
  },
  {
    name: 'assess_flag_coverage',
    description: 'Assess feature flag coverage for a service or code change. Identifies critical paths without flag protection and recommends where kill switches should be added for safer deployments.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Service to assess flag coverage for',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
      },
      required: ['service_name'],
    },
  },
];

export function handleFeatureFlagTool(name, args) {
  switch (name) {
    case 'get_feature_flags':
      return handleGetFeatureFlags(args);
    case 'get_feature_flag_details':
      return handleGetFlagDetails(args.flag_key);
    case 'toggle_feature_flag':
      return handleToggleFlag(args);
    case 'get_flag_audit_log':
      return handleGetAuditLog(args);
    case 'assess_flag_coverage':
      return handleAssessCoverage(args.service_name);
    default:
      return { error: `Unknown feature flag tool: ${name}` };
  }
}

function handleGetFeatureFlags({ service_name, state, kill_switch_only }) {
  let flags = Object.values(featureFlags);

  if (service_name && service_name !== 'all') {
    flags = flags.filter(f => f.service === service_name || f.service === 'all');
  }
  if (state) {
    flags = flags.filter(f => f.state === state);
  }
  if (kill_switch_only) {
    flags = flags.filter(f => f.killSwitch === true);
  }

  return {
    totalFlags: flags.length,
    flags: flags.map(f => ({
      key: f.key,
      name: f.name,
      service: f.service,
      state: f.state,
      rolloutPercentage: f.rolloutPercentage,
      killSwitch: f.killSwitch,
      lastModified: f.lastModified,
      lastModifiedBy: f.lastModifiedBy,
    })),
    summary: `${flags.length} feature flag(s)` +
      (service_name && service_name !== 'all' ? ` for ${service_name}` : '') +
      (state ? ` with state=${state}` : '') +
      (kill_switch_only ? ' (kill switches only)' : ''),
  };
}

function handleGetFlagDetails(flagKey) {
  const flag = featureFlags[flagKey];
  if (!flag) {
    return { error: `Unknown flag: ${flagKey}`, availableFlags: Object.keys(featureFlags) };
  }

  const recentAudit = flagAuditLog.filter(e => e.flag === flagKey).slice(-5);

  return {
    ...flag,
    recentChanges: recentAudit,
    toggleImpact: {
      ifDisabled: flag.impactWhenDisabled,
      affectedEndpoints: getAffectedEndpoints(flag),
      estimatedUserImpact: getEstimatedImpact(flag),
      reversible: true,
      reverseTime: '< 30 seconds (flag toggle is instant)',
    },
  };
}

function handleToggleFlag({ flag_key, action, reason, rollout_percentage = 100 }) {
  const flag = featureFlags[flag_key];
  if (!flag) {
    return { error: `Unknown flag: ${flag_key}` };
  }

  const previousState = flag.state;
  const previousRollout = flag.rolloutPercentage;

  // Apply change
  flag.state = action === 'enable' ? 'enabled' : 'disabled';
  flag.rolloutPercentage = action === 'enable' ? rollout_percentage : 0;
  flag.lastModified = new Date().toISOString();
  flag.lastModifiedBy = 'devops-agent';

  // Record audit
  flagAuditLog.push({
    timestamp: new Date().toISOString(),
    flag: flag_key,
    action: action === 'enable' ? `enabled (${rollout_percentage}%)` : 'disabled',
    actor: 'devops-agent',
    reason,
  });

  return {
    flag: flag_key,
    previousState: `${previousState} (${previousRollout}%)`,
    newState: `${flag.state} (${flag.rolloutPercentage}%)`,
    toggledAt: flag.lastModified,
    reason,
    impact: flag.impactWhenDisabled,
    confirmation: `Feature flag '${flag.name}' ${action}d successfully.`,
    rollbackInstruction: `To revert: toggle_feature_flag(flag_key='${flag_key}', action='${action === 'enable' ? 'disable' : 'enable'}', reason='Reverting change')`,
    notifications: [
      { channel: 'Slack (#summit-store-incidents)', message: `Flag '${flag.name}' ${action}d by DevOps Agent: ${reason}` },
      { channel: 'Audit Log', status: 'recorded' },
    ],
  };
}

function handleGetAuditLog({ flag_key, hours_back = 72 }) {
  const cutoff = new Date(Date.now() - hours_back * 3600000).toISOString();
  let entries = flagAuditLog.filter(e => e.timestamp >= cutoff);

  if (flag_key) {
    entries = entries.filter(e => e.flag === flag_key);
  }

  return {
    periodHours: hours_back,
    totalEntries: entries.length,
    entries: entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    filter: flag_key || 'all flags',
  };
}

function handleAssessCoverage(serviceName) {
  const assessments = {
    'order-service': {
      service: 'order-service',
      criticalPaths: [
        { path: 'POST /orders → payment-service call', flagProtected: false, recommendation: 'Add kill switch to disable payment calls and queue orders for later processing' },
        { path: 'POST /orders → SQS inventory message', flagProtected: true, flag: 'async-inventory-batching' },
        { path: 'POST /orders → discount code logic', flagProtected: true, flag: 'order-discount-codes' },
      ],
      coverageScore: '67% (2/3 critical paths protected)',
      gaps: [
        'Payment service integration has no flag — if payment-service is down, the only mitigation is a full rollback or timeout waiting',
        'No flag to enable/disable the /chaos endpoint in production',
      ],
      recommendations: [
        'Add a kill switch flag for the payment-service dependency that queues payments when disabled',
        'Add a flag to gate the /chaos endpoint (should be disabled in production by default)',
      ],
    },
    'payment-service': {
      service: 'payment-service',
      criticalPaths: [
        { path: 'POST /pay → external gateway call', flagProtected: true, flag: 'payment-gateway-v2', killSwitch: true },
        { path: 'Circuit breaker logic', flagProtected: true, flag: 'circuit-breaker-payment', note: 'Currently DISABLED — enable to activate protection' },
      ],
      coverageScore: '100% (2/2 critical paths have flags)',
      gaps: [],
      recommendations: [
        'Enable the circuit-breaker-payment flag to activate protection on the gateway dependency',
        'Consider adding a flag for payment retry logic (currently no retries configured)',
      ],
    },
    'inventory-service': {
      service: 'inventory-service',
      criticalPaths: [
        { path: 'SQS consumer → DynamoDB write', flagProtected: false, recommendation: 'Add flag to switch between single-write and batch-write modes' },
        { path: 'GET /stock/status → GSI query', flagProtected: false, recommendation: 'Add flag to enable/disable GSI queries and fall back to scan with limit' },
      ],
      coverageScore: '0% (0/2 critical paths protected)',
      gaps: [
        'No feature flags on any inventory-service path',
        'DynamoDB GSI throttling has no graceful degradation mechanism',
        'SQS consumer has no way to pause processing without stopping the service',
      ],
      recommendations: [
        'Add kill switch to pause SQS consumption (useful during DynamoDB maintenance)',
        'Add flag to toggle between provisioned and on-demand DynamoDB capacity mode',
        'Add flag to enable/disable GSI queries with table scan fallback',
      ],
    },
  };

  return assessments[serviceName] || { error: `Unknown service: ${serviceName}` };
}

function getAffectedEndpoints(flag) {
  const endpointMap = {
    'payment-gateway-v2': ['POST /pay'],
    'async-inventory-batching': ['POST /orders (SQS send path)'],
    'order-discount-codes': ['POST /orders (discount calculation)'],
    'enhanced-logging': ['All endpoints (log verbosity only)'],
    'circuit-breaker-payment': ['POST /pay (gateway call protection)'],
  };
  return endpointMap[flag.key] || ['Unknown'];
}

function getEstimatedImpact(flag) {
  const impactMap = {
    'payment-gateway-v2': 'HIGH — Payment processing will use legacy gateway (slower, no retries, but more stable under load)',
    'async-inventory-batching': 'MEDIUM — Inventory processing slower but still functional (single message mode)',
    'order-discount-codes': 'LOW — Discount codes ignored, orders still process at full price',
    'enhanced-logging': 'NONE — Only affects log verbosity and CloudWatch costs',
    'circuit-breaker-payment': 'POSITIVE — Enabling adds protection; disabling removes safety net',
  };
  return impactMap[flag.key] || 'Unknown';
}
