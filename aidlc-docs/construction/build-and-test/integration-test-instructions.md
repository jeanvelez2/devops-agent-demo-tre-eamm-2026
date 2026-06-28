# Integration Test Instructions

## Local Integration (Docker Compose)

Start all services locally with Docker Compose or individually:

```bash
# Start DynamoDB Local
docker run -d -p 8000:8000 amazon/dynamodb-local

# Start inventory-service (pointing to local DynamoDB)
cd summit-store/services/inventory-service
DYNAMODB_TABLE=summit-store-inventory AWS_REGION=us-east-1 \
  AWS_ENDPOINT_URL=http://localhost:8000 python app.py &

# Start payment-service
cd summit-store/services/payment-service
GATEWAY_TIMEOUT_MS=5000 GATEWAY_URL=https://httpbin.org/delay/1 python app.py &

# Start order-service
cd summit-store/services/order-service
PAYMENT_SERVICE_URL=http://localhost:5000 SQS_QUEUE_URL="" node app.js &
```

## Verify Integration

```bash
# Health checks
curl http://localhost:3000/health
curl http://localhost:5000/health
curl http://localhost:5001/health

# Place an order
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"itemId":"item-001","quantity":1,"paymentMethod":"card"}'

# Enable chaos
curl -X POST http://localhost:3000/chaos \
  -H "Content-Type: application/json" \
  -d '{"delayMs":2000}'

# Verify chaos affects latency
time curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"itemId":"item-001","quantity":1,"paymentMethod":"card"}'
```

## Post-Deploy Integration (AWS)

After `cdk deploy`:

```bash
ALB_URL=$(aws cloudformation describe-stacks --stack-name SummitStoreServices \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbUrl`].OutputValue' --output text)

curl http://$ALB_URL/health
curl -X POST http://$ALB_URL/orders \
  -H "Content-Type: application/json" \
  -d '{"itemId":"item-001","quantity":1,"paymentMethod":"card"}'
```
