# Services

## order-service (Orchestrator)
- **Role**: Entry point for all order operations
- **Orchestration**:
  1. Receive order request
  2. Call payment-service synchronously (no retry — intentional)
  3. On payment success, send SQS message to inventory-service
  4. Return order result to client
- **Endpoints**: POST /orders, GET /health, POST /chaos

## payment-service (Payment Processor)
- **Role**: Process payments via external gateway
- **Orchestration**:
  1. Receive payment request from order-service
  2. Call external mock gateway (configurable timeout via GATEWAY_TIMEOUT_MS)
  3. Return success/failure (no circuit breaker — intentional)
- **Endpoints**: POST /pay, GET /health

## inventory-service (Stock Manager)
- **Role**: Manage inventory levels
- **Orchestration**:
  1. Consume SQS messages for stock reservation
  2. Update DynamoDB (GSI under-provisioned — intentional)
  3. Expose REST API for stock queries
- **Endpoints**: POST /reserve, GET /stock/{item_id}, GET /health
