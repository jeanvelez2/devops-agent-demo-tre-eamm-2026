/**
 * Lambda function that receives CloudWatch alarm notifications (via SNS or EventBridge)
 * and triggers an AWS DevOps Agent investigation through its webhook.
 *
 * Environment variables:
 *   WEBHOOK_URL    - DevOps Agent webhook endpoint URL
 *   WEBHOOK_SECRET - HMAC signing secret (for HMAC auth) or Bearer token (for API key auth)
 *   AUTH_TYPE      - "HMAC" or "BEARER" (default: HMAC)
 */

import { createHmac } from 'crypto';

// Cache secrets across invocations (Lambda container reuse)
let cachedCredentials = null;

async function loadCredentials() {
  if (cachedCredentials) return cachedCredentials;

  const secretArn = process.env.SECRET_ARN;

  if (secretArn) {
    try {
      // Call Secrets Manager directly using AWS SDK (built into Node.js 20 Lambda runtime)
      const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      const client = new SecretsManagerClient({});
      const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
      const secret = JSON.parse(response.SecretString);
      cachedCredentials = {
        webhookUrl: secret.webhookUrl,
        webhookSecret: secret.webhookSecret,
        authType: secret.authType || 'HMAC',
      };
      console.log(`Loaded webhook credentials from Secrets Manager`);
      return cachedCredentials;
    } catch (e) {
      console.error('Failed to load from Secrets Manager:', e.message);
    }
  }

  // Fallback to environment variables
  cachedCredentials = {
    webhookUrl: process.env.WEBHOOK_URL,
    webhookSecret: process.env.WEBHOOK_SECRET,
    authType: process.env.AUTH_TYPE || 'HMAC',
  };
  return cachedCredentials;
}

export async function handler(event) {
  const { webhookUrl, webhookSecret, authType } = await loadCredentials();

  if (!webhookUrl || !webhookSecret) {
    console.error('Missing WEBHOOK_URL or WEBHOOK_SECRET environment variables');
    return { statusCode: 500, body: 'Missing webhook configuration' };
  }

  if (!webhookUrl.startsWith('https://')) {
    console.error(`Invalid WEBHOOK_URL: "${webhookUrl}" — must be an HTTPS URL. Update the Secrets Manager secret (summit-store-devops-agent-webhook) with the real DevOps Agent webhook URL.`);
    return { statusCode: 500, body: 'Invalid webhook URL — see CloudWatch logs for setup instructions' };
  }

  // Parse the alarm data from either SNS or EventBridge
  const alarmData = parseEvent(event);
  if (!alarmData) {
    console.error('Could not parse alarm data from event:', JSON.stringify(event));
    return { statusCode: 400, body: 'Unrecognized event format' };
  }

  console.log(`Processing alarm: ${alarmData.alarmName}, state: ${alarmData.newState}`);

  // Only trigger investigations when alarm transitions to ALARM state
  if (alarmData.newState !== 'ALARM') {
    console.log(`Skipping non-ALARM state: ${alarmData.newState}`);
    return { statusCode: 200, body: 'Skipped: not an ALARM state transition' };
  }

  // Build the DevOps Agent webhook payload
  const timestamp = new Date().toISOString();
  const payload = {
    eventType: 'incident',
    incidentId: `cw-alarm-${alarmData.alarmName}-${Date.now()}`,
    action: 'created',
    priority: mapPriority(alarmData.alarmName),
    title: `CloudWatch Alarm: ${alarmData.alarmName}`,
    description: buildDescription(alarmData),
    timestamp,
    service: inferService(alarmData.alarmName),
    data: {
      metadata: {
        region: alarmData.region || 'us-east-1',
        environment: 'production',
        alarmArn: alarmData.alarmArn || '',
        stateReason: alarmData.reason || '',
      },
    },
  };

  // Send to DevOps Agent webhook
  const payloadStr = JSON.stringify(payload);
  const headers = buildHeaders(payloadStr, timestamp, webhookSecret, authType);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: payloadStr,
    });

    const responseBody = await response.text();
    console.log(`Webhook response: ${response.status} - ${responseBody}`);

    return {
      statusCode: response.status,
      body: JSON.stringify({
        message: 'DevOps Agent investigation triggered',
        alarmName: alarmData.alarmName,
        webhookStatus: response.status,
      }),
    };
  } catch (error) {
    console.error('Failed to call webhook:', error);
    return { statusCode: 500, body: `Webhook call failed: ${error.message}` };
  }
}

/**
 * Parse alarm data from either SNS (from CloudWatch Alarm action)
 * or EventBridge (from CloudWatch Alarm State Change event).
 */
function parseEvent(event) {
  // Source: SNS notification (CloudWatch Alarm → SNS → Lambda)
  if (event.Records && event.Records[0]?.Sns) {
    try {
      const message = JSON.parse(event.Records[0].Sns.Message);
      return {
        alarmName: message.AlarmName,
        alarmArn: message.AlarmArn,
        newState: message.NewStateValue,
        oldState: message.OldStateValue,
        reason: message.NewStateReason,
        description: message.AlarmDescription,
        region: message.Region,
        trigger: message.Trigger,
      };
    } catch (e) {
      console.error('Failed to parse SNS message:', e);
      return null;
    }
  }

  // Source: EventBridge (CloudWatch Alarm State Change)
  if (event['detail-type'] === 'CloudWatch Alarm State Change') {
    const detail = event.detail;
    return {
      alarmName: detail.alarmName,
      alarmArn: event.resources?.[0] || '',
      newState: detail.state?.value,
      oldState: detail.previousState?.value,
      reason: detail.state?.reason,
      description: detail.configuration?.description || '',
      region: event.region,
      trigger: detail.configuration?.metrics || null,
    };
  }

  return null;
}

/**
 * Build HTTP headers for the webhook request.
 */
function buildHeaders(payloadStr, timestamp, secret, authType) {
  const headers = { 'Content-Type': 'application/json' };

  if (authType === 'BEARER') {
    headers['Authorization'] = `Bearer ${secret}`;
    headers['x-amzn-event-timestamp'] = timestamp;
  } else {
    // HMAC authentication
    const hmac = createHmac('sha256', secret);
    hmac.update(`${timestamp}:${payloadStr}`, 'utf8');
    const signature = hmac.digest('base64');
    headers['x-amzn-event-timestamp'] = timestamp;
    headers['x-amzn-event-signature'] = signature;
  }

  return headers;
}

/**
 * Map alarm names to investigation priority levels.
 */
function mapPriority(alarmName) {
  if (alarmName.includes('error-rate')) return 'HIGH';
  if (alarmName.includes('latency') || alarmName.includes('p99')) return 'HIGH';
  if (alarmName.includes('throttl')) return 'MEDIUM';
  return 'MEDIUM';
}

/**
 * Build a descriptive investigation description from alarm data.
 */
function buildDescription(alarmData) {
  const parts = [
    `CloudWatch alarm "${alarmData.alarmName}" transitioned to ALARM state.`,
  ];
  if (alarmData.reason) {
    parts.push(`Reason: ${alarmData.reason}`);
  }
  if (alarmData.description) {
    parts.push(`Alarm description: ${alarmData.description}`);
  }
  if (alarmData.region) {
    parts.push(`Region: ${alarmData.region}`);
  }
  return parts.join(' ');
}

/**
 * Infer the service name from the alarm name for topology correlation.
 */
function inferService(alarmName) {
  if (alarmName.includes('order-service')) return 'order-service';
  if (alarmName.includes('payment-service')) return 'payment-service';
  if (alarmName.includes('inventory') || alarmName.includes('dynamodb')) return 'inventory-service';
  return 'summit-store';
}
