/**
 * Monitoring & Cost tools — LIVE CloudWatch metrics, cost analysis, resource utilization
 * Calls real AWS CloudWatch APIs to get actual metric data.
 */

import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';

const cw = new CloudWatchClient({ region: 'us-east-1' });
const ce = new CostExplorerClient({ region: 'us-east-1' });

export const monitoringTools = [
  {
    name: 'get_cloudwatch_metrics',
    description: 'Query LIVE CloudWatch metrics for summit-store resources. Returns real metric data points for a specified period. Supports DynamoDB, ALB, ECS, NAT Gateway, Lambda, and SQS metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'CloudWatch namespace',
          enum: ['AWS/DynamoDB', 'AWS/ApplicationELB', 'AWS/ECS', 'AWS/NATGateway', 'AWS/Lambda', 'AWS/SQS'],
        },
        metric_name: {
          type: 'string',
          description: 'Metric name (e.g., ConsumedReadCapacityUnits, RequestCount, CPUUtilization, BytesProcessed)',
        },
        dimensions: {
          type: 'object',
          description: 'Metric dimensions as key-value pairs (e.g., {"TableName": "summit-store-inventory"})',
        },
        period_hours: {
          type: 'number',
          description: 'Number of hours of data to return (default: 24, max: 168)',
          default: 24,
        },
        statistic: {
          type: 'string',
          description: 'Statistic to compute',
          enum: ['Average', 'Sum', 'Maximum', 'Minimum', 'SampleCount'],
          default: 'Average',
        },
      },
      required: ['namespace', 'metric_name'],
    },
  },
  {
    name: 'get_cost_summary',
    description: 'Get real AWS cost breakdown for summit-store resources from Cost Explorer. Returns per-service costs and trends.',
    inputSchema: {
      type: 'object',
      properties: {
        period_days: {
          type: 'number',
          description: 'Number of days to analyze (default: 7, max: 30)',
          default: 7,
        },
        group_by: {
          type: 'string',
          description: 'Group costs by dimension',
          enum: ['SERVICE', 'USAGE_TYPE', 'LINKED_ACCOUNT'],
          default: 'SERVICE',
        },
      },
    },
  },
  {
    name: 'get_resource_utilization',
    description: 'Get real resource utilization for summit-store infrastructure by querying CloudWatch metrics for ECS CPU/Memory, DynamoDB capacity, ALB request counts, and SQS queue depth.',
    inputSchema: {
      type: 'object',
      properties: {
        resource_type: {
          type: 'string',
          description: 'Filter by resource type',
          enum: ['ecs', 'dynamodb', 'nat-gateway', 'alb', 'sqs', 'all'],
          default: 'all',
        },
      },
    },
  },
  {
    name: 'detect_cost_anomalies',
    description: 'Detect cost anomalies by comparing last 24h CloudWatch metrics against 7-day baseline. Flags metrics exceeding the threshold percentage of baseline average.',
    inputSchema: {
      type: 'object',
      properties: {
        threshold_percent: {
          type: 'number',
          description: 'Percentage above baseline to flag as anomaly (default: 150)',
          default: 150,
        },
      },
    },
  },
];

export async function handleMonitoringTool(name, args) {
  switch (name) {
    case 'get_cloudwatch_metrics':
      return await getCloudWatchMetrics(args);
    case 'get_cost_summary':
      return await getCostSummary(args);
    case 'get_resource_utilization':
      return await getResourceUtilization(args);
    case 'detect_cost_anomalies':
      return await detectCostAnomalies(args);
    default:
      return { error: `Unknown monitoring tool: ${name}` };
  }
}


async function getCloudWatchMetrics({ namespace, metric_name, dimensions = {}, period_hours = 24, statistic = 'Average' }) {
  const now = new Date();
  const startTime = new Date(now.getTime() - period_hours * 3600000);

  const metricDimensions = Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }));

  // Query current period
  const metricId = 'current';
  const params = {
    StartTime: startTime,
    EndTime: now,
    MetricDataQueries: [
      {
        Id: metricId,
        MetricStat: {
          Metric: {
            Namespace: namespace,
            MetricName: metric_name,
            Dimensions: metricDimensions,
          },
          Period: Math.max(300, Math.floor((period_hours * 3600) / 60)), // At least 5 min periods
          Stat: statistic,
        },
        ReturnData: true,
      },
    ],
  };

  try {
    const response = await cw.send(new GetMetricDataCommand(params));
    const results = response.MetricDataResults?.[0] || {};
    const values = results.Values || [];
    const timestamps = results.Timestamps || [];

    const dataPoints = timestamps.map((ts, i) => ({
      timestamp: new Date(ts).toISOString(),
      value: Math.round(values[i] * 1000) / 1000,
    })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;

    return {
      namespace,
      metricName: metric_name,
      dimensions,
      statistic,
      periodHours: period_hours,
      summary: {
        average: Math.round(avg * 1000) / 1000,
        maximum: Math.round(max * 1000) / 1000,
        minimum: Math.round(min * 1000) / 1000,
        dataPointCount: values.length,
      },
      dataPoints: dataPoints.slice(-20), // Last 20 data points
      status: results.StatusCode || 'Unknown',
    };
  } catch (error) {
    return { error: error.message, namespace, metricName: metric_name, dimensions };
  }
}


async function getCostSummary({ period_days = 7, group_by = 'SERVICE' }) {
  const now = new Date();
  const startDate = new Date(now.getTime() - period_days * 86400000);
  const endDate = now;

  const formatDate = (d) => d.toISOString().split('T')[0];

  try {
    const response = await ce.send(new GetCostAndUsageCommand({
      TimePeriod: {
        Start: formatDate(startDate),
        End: formatDate(endDate),
      },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost', 'UsageQuantity'],
      GroupBy: [{ Type: 'DIMENSION', Key: group_by }],
    }));

    const results = response.ResultsByTime || [];
    let totalCost = 0;
    const serviceBreakdown = {};

    for (const period of results) {
      for (const group of (period.Groups || [])) {
        const serviceName = group.Keys?.[0] || 'Unknown';
        const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
        totalCost += cost;
        serviceBreakdown[serviceName] = (serviceBreakdown[serviceName] || 0) + cost;
      }
    }

    const breakdown = Object.entries(serviceBreakdown)
      .map(([name, cost]) => ({
        name,
        cost: `$${cost.toFixed(2)}`,
        percentOfTotal: `${((cost / totalCost) * 100).toFixed(1)}%`,
      }))
      .sort((a, b) => parseFloat(b.cost.slice(1)) - parseFloat(a.cost.slice(1)));

    return {
      periodDays: period_days,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      totalCost: `$${totalCost.toFixed(2)}`,
      dailyAverage: `$${(totalCost / period_days).toFixed(2)}`,
      breakdown,
      dataSource: 'AWS Cost Explorer (live)',
    };
  } catch (error) {
    return { error: error.message, note: 'Cost Explorer may require opt-in or specific IAM permissions (ce:GetCostAndUsage)' };
  }
}


async function getResourceUtilization({ resource_type = 'all' }) {
  const now = new Date();
  const startTime = new Date(now.getTime() - 24 * 3600000); // Last 24h

  const queries = [];

  if (resource_type === 'all' || resource_type === 'ecs') {
    queries.push(
      { id: 'ecs_cpu', ns: 'AWS/ECS', metric: 'CPUUtilization', dims: [{ Name: 'ClusterName', Value: 'summit-store' }], stat: 'Average' },
      { id: 'ecs_mem', ns: 'AWS/ECS', metric: 'MemoryUtilization', dims: [{ Name: 'ClusterName', Value: 'summit-store' }], stat: 'Average' },
    );
  }
  if (resource_type === 'all' || resource_type === 'dynamodb') {
    queries.push(
      { id: 'ddb_read', ns: 'AWS/DynamoDB', metric: 'ConsumedReadCapacityUnits', dims: [{ Name: 'TableName', Value: 'summit-store-inventory' }], stat: 'Average' },
      { id: 'ddb_write', ns: 'AWS/DynamoDB', metric: 'ConsumedWriteCapacityUnits', dims: [{ Name: 'TableName', Value: 'summit-store-inventory' }], stat: 'Average' },
      { id: 'ddb_throttle', ns: 'AWS/DynamoDB', metric: 'ReadThrottleEvents', dims: [{ Name: 'TableName', Value: 'summit-store-inventory' }, { Name: 'GlobalSecondaryIndexName', Value: 'status-index' }], stat: 'Sum' },
    );
  }
  if (resource_type === 'all' || resource_type === 'alb') {
    queries.push(
      { id: 'alb_requests', ns: 'AWS/ApplicationELB', metric: 'RequestCount', dims: [{ Name: 'LoadBalancer', Value: 'app/Summit-ALBAE-riHCsL2wW7au/992e68178971b6c1' }], stat: 'Sum' },
      { id: 'alb_latency', ns: 'AWS/ApplicationELB', metric: 'TargetResponseTime', dims: [{ Name: 'LoadBalancer', Value: 'app/Summit-ALBAE-riHCsL2wW7au/992e68178971b6c1' }], stat: 'Average' },
      { id: 'alb_5xx', ns: 'AWS/ApplicationELB', metric: 'HTTPCode_Target_5XX_Count', dims: [{ Name: 'LoadBalancer', Value: 'app/Summit-ALBAE-riHCsL2wW7au/992e68178971b6c1' }], stat: 'Sum' },
    );
  }
  if (resource_type === 'all' || resource_type === 'sqs') {
    queries.push(
      { id: 'sqs_sent', ns: 'AWS/SQS', metric: 'NumberOfMessagesSent', dims: [{ Name: 'QueueName', Value: 'summit-store-orders' }], stat: 'Sum' },
      { id: 'sqs_dlq', ns: 'AWS/SQS', metric: 'ApproximateNumberOfMessagesVisible', dims: [{ Name: 'QueueName', Value: 'summit-store-orders-dlq' }], stat: 'Maximum' },
    );
  }

  const metricDataQueries = queries.map(q => ({
    Id: q.id,
    MetricStat: {
      Metric: { Namespace: q.ns, MetricName: q.metric, Dimensions: q.dims },
      Period: 3600,
      Stat: q.stat,
    },
    ReturnData: true,
  }));

  if (metricDataQueries.length === 0) {
    return { error: `Unknown resource_type: ${resource_type}` };
  }

  try {
    const response = await cw.send(new GetMetricDataCommand({
      StartTime: startTime,
      EndTime: now,
      MetricDataQueries: metricDataQueries,
    }));

    const results = {};
    for (const metric of (response.MetricDataResults || [])) {
      const values = metric.Values || [];
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const max = values.length > 0 ? Math.max(...values) : 0;
      results[metric.Id] = {
        average: Math.round(avg * 1000) / 1000,
        maximum: Math.round(max * 1000) / 1000,
        dataPoints: values.length,
        status: metric.StatusCode,
      };
    }

    const utilization = {};

    if (results.ecs_cpu || results.ecs_mem) {
      utilization.ecs = {
        cpuUtilization: results.ecs_cpu ? `${results.ecs_cpu.average.toFixed(1)}%` : 'N/A',
        memoryUtilization: results.ecs_mem ? `${results.ecs_mem.average.toFixed(1)}%` : 'N/A',
        assessment: (results.ecs_cpu?.average || 0) < 30 ? 'OVER_PROVISIONED — consider downsizing' : 'APPROPRIATE',
      };
    }
    if (results.ddb_read || results.ddb_write) {
      utilization.dynamodb = {
        readCapacityUsed: results.ddb_read ? `${results.ddb_read.average.toFixed(1)} RCU (of 25 provisioned)` : 'N/A',
        writeCapacityUsed: results.ddb_write ? `${results.ddb_write.average.toFixed(1)} WCU (of 25 provisioned)` : 'N/A',
        gsiThrottleEvents: results.ddb_throttle ? `${results.ddb_throttle.average.toFixed(0)} total in 24h` : '0',
        assessment: (results.ddb_read?.average || 0) < 5 ? 'UNDER_UTILIZED — consider on-demand billing' : 'APPROPRIATE',
      };
    }
    if (results.alb_requests || results.alb_latency) {
      utilization.alb = {
        requestsPerHour: results.alb_requests ? `${results.alb_requests.average.toFixed(0)}` : 'N/A',
        avgLatency: results.alb_latency ? `${(results.alb_latency.average * 1000).toFixed(0)}ms` : 'N/A',
        errors5xx: results.alb_5xx ? `${results.alb_5xx.average.toFixed(1)}/hr` : '0',
      };
    }
    if (results.sqs_sent || results.sqs_dlq) {
      utilization.sqs = {
        messagesSentPerHour: results.sqs_sent ? `${results.sqs_sent.average.toFixed(0)}` : 'N/A',
        dlqDepth: results.sqs_dlq ? `${results.sqs_dlq.maximum}` : '0',
        dlqAlert: (results.sqs_dlq?.maximum || 0) > 0 ? 'WARNING — DLQ has messages (no alarm configured!)' : 'OK',
      };
    }

    return { periodHours: 24, resourceType: resource_type, utilization, dataSource: 'AWS CloudWatch (live)' };
  } catch (error) {
    return { error: error.message };
  }
}


async function detectCostAnomalies({ threshold_percent = 150 }) {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600000);
  const baseline7dStart = new Date(now.getTime() - 7 * 86400000);
  const baseline7dEnd = new Date(now.getTime() - 24 * 3600000);

  // Metrics to check for anomalies
  const metricsToCheck = [
    { id: 'ddb_read', ns: 'AWS/DynamoDB', metric: 'ConsumedReadCapacityUnits', dims: [{ Name: 'TableName', Value: 'summit-store-inventory' }], label: 'DynamoDB Read Capacity' },
    { id: 'ddb_write', ns: 'AWS/DynamoDB', metric: 'ConsumedWriteCapacityUnits', dims: [{ Name: 'TableName', Value: 'summit-store-inventory' }], label: 'DynamoDB Write Capacity' },
    { id: 'alb_requests', ns: 'AWS/ApplicationELB', metric: 'RequestCount', dims: [{ Name: 'LoadBalancer', Value: 'app/Summit-ALBAE-riHCsL2wW7au/992e68178971b6c1' }], label: 'ALB Request Count' },
    { id: 'alb_5xx', ns: 'AWS/ApplicationELB', metric: 'HTTPCode_Target_5XX_Count', dims: [{ Name: 'LoadBalancer', Value: 'app/Summit-ALBAE-riHCsL2wW7au/992e68178971b6c1' }], label: 'ALB 5XX Errors' },
    { id: 'sqs_sent', ns: 'AWS/SQS', metric: 'NumberOfMessagesSent', dims: [{ Name: 'QueueName', Value: 'summit-store-orders' }], label: 'SQS Messages Sent' },
  ];

  try {
    // Get 7-day baseline
    const baselineQueries = metricsToCheck.map(m => ({
      Id: `baseline_${m.id}`,
      MetricStat: {
        Metric: { Namespace: m.ns, MetricName: m.metric, Dimensions: m.dims },
        Period: 86400, // Daily
        Stat: 'Average',
      },
      ReturnData: true,
    }));

    const baselineResp = await cw.send(new GetMetricDataCommand({
      StartTime: baseline7dStart,
      EndTime: baseline7dEnd,
      MetricDataQueries: baselineQueries,
    }));

    // Get last 24h current
    const currentQueries = metricsToCheck.map(m => ({
      Id: `current_${m.id}`,
      MetricStat: {
        Metric: { Namespace: m.ns, MetricName: m.metric, Dimensions: m.dims },
        Period: 86400,
        Stat: 'Average',
      },
      ReturnData: true,
    }));

    const currentResp = await cw.send(new GetMetricDataCommand({
      StartTime: last24h,
      EndTime: now,
      MetricDataQueries: currentQueries,
    }));

    // Compare
    const anomalies = [];
    const healthy = [];

    for (const m of metricsToCheck) {
      const baselineResult = (baselineResp.MetricDataResults || []).find(r => r.Id === `baseline_${m.id}`);
      const currentResult = (currentResp.MetricDataResults || []).find(r => r.Id === `current_${m.id}`);

      const baselineValues = baselineResult?.Values || [];
      const currentValues = currentResult?.Values || [];

      const baselineAvg = baselineValues.length > 0 ? baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length : 0;
      const currentAvg = currentValues.length > 0 ? currentValues.reduce((a, b) => a + b, 0) / currentValues.length : 0;

      const percentOfBaseline = baselineAvg > 0 ? Math.round((currentAvg / baselineAvg) * 100) : (currentAvg > 0 ? 999 : 0);

      const entry = {
        resource: m.label,
        metric: m.metric,
        currentValue: Math.round(currentAvg * 1000) / 1000,
        baselineAvg: Math.round(baselineAvg * 1000) / 1000,
        percentOfBaseline: `${percentOfBaseline}%`,
      };

      if (percentOfBaseline > threshold_percent) {
        anomalies.push({ ...entry, severity: percentOfBaseline > 300 ? 'HIGH' : 'MEDIUM' });
      } else {
        healthy.push({ ...entry, status: 'NORMAL' });
      }
    }

    return {
      thresholdPercent: threshold_percent,
      analysisWindow: 'Last 24 hours vs 7-day baseline',
      anomaliesDetected: anomalies.length,
      anomalies,
      healthyMetrics: healthy,
      dataSource: 'AWS CloudWatch (live)',
      analyzedAt: now.toISOString(),
    };
  } catch (error) {
    return { error: error.message };
  }
}
