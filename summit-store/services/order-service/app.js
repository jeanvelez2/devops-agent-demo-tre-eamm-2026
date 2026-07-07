const AWSXRay = require('aws-xray-sdk');
const express = require('express');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

AWSXRay.captureHTTPsGlobal(require('http'));
AWSXRay.captureHTTPsGlobal(require('https'));
const http = require('http');

const app = express();
app.use(AWSXRay.express.openSegment('order-service'));
app.use(express.json());

const sqs = AWSXRay.captureAWSv3Client(new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' }));
const PAYMENT_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service.summit-store.local:5000';
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';

let chaosDelayMs = 0;

function getXRayTraceId() {
  try {
    const seg = AWSXRay.getSegment();
    return seg ? seg.trace_id : null;
  } catch { return null; }
}

function log(level, message, extra = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'order-service',
    traceId: extra.traceId || 'none',
    xrayTraceId: getXRayTraceId(),
    level,
    message,
    ...extra
  }));
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

app.post('/chaos', (req, res) => {
  chaosDelayMs = req.body.delayMs || 2000;
  log('warn', `Chaos enabled: ${chaosDelayMs}ms delay`);
  res.json({ status: 'chaos enabled', delayMs: chaosDelayMs });
});

app.delete('/chaos', (req, res) => {
  chaosDelayMs = 0;
  log('info', 'Chaos disabled');
  res.json({ status: 'chaos disabled' });
});

app.post('/orders', async (req, res) => {
  const traceId = uuidv4();
  const { itemId, quantity, paymentMethod, discountCode } = req.body;
  log('info', 'Order received', { traceId, itemId, quantity, discountCode });

  if (chaosDelayMs > 0) {
    await new Promise(r => setTimeout(r, chaosDelayMs));
  }

  // Apply discount if valid code provided
  let amount = quantity * 10;
  if (discountCode === 'SUMMIT20') {
    amount = Math.round(amount * 0.8);
    log('info', 'Discount applied: 20% off', { traceId, discountCode, newAmount: amount });
  } else if (discountCode === 'HALF') {
    amount = Math.round(amount * 0.5);
    log('info', 'Discount applied: 50% off', { traceId, discountCode, newAmount: amount });
  }

  // TODO: Add retry logic here — currently single failure = order failure
  // INTENTIONAL WEAKNESS: No retry on payment-service calls
  try {
    const paymentUrl = new URL(`${PAYMENT_URL}/pay`);
    const paymentBody = JSON.stringify({ orderId: traceId, amount, method: paymentMethod });
    const payment = await new Promise((resolve, reject) => {
      const payReq = http.request({
        hostname: paymentUrl.hostname,
        port: paymentUrl.port,
        path: paymentUrl.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(paymentBody) },
      }, (payRes) => {
        let data = '';
        payRes.on('data', chunk => data += chunk);
        payRes.on('end', () => {
          if (payRes.statusCode >= 400) return reject(new Error(`Payment failed: ${payRes.statusCode}`));
          resolve(JSON.parse(data));
        });
      });
      payReq.on('error', reject);
      payReq.write(paymentBody);
      payReq.end();
    });
    log('info', 'Payment processed', { traceId, transactionId: payment.transactionId });
  } catch (err) {
    log('error', 'Payment failed', { traceId, error: err.message });
    return res.status(500).json({ orderId: traceId, status: 'failed', error: err.message });
  }

  // Send async message to inventory-service via SQS
  try {
    await sqs.send(new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ orderId: traceId, itemId, quantity })
    }));
    log('info', 'Inventory update queued', { traceId });
  } catch (err) {
    log('error', 'SQS send failed', { traceId, error: err.message });
  }

  res.json({ orderId: traceId, status: 'completed' });
});

const PORT = process.env.PORT || 3000;
app.use(AWSXRay.express.closeSegment());
app.listen(PORT, () => log('info', `order-service listening on port ${PORT}`));
