# Component Methods

## order-service

| Method | Input | Output | Notes |
|---|---|---|---|
| POST /orders | { itemId, quantity, paymentMethod } | { orderId, status } | Calls payment + SQS |
| GET /health | — | { status: "ok", service: "order-service" } | Health check |
| POST /chaos | { delayMs } | { status: "chaos enabled" } | Injects latency into /orders |

## payment-service

| Method | Input | Output | Notes |
|---|---|---|---|
| POST /pay | { orderId, amount, method } | { success, transactionId } | Calls external gateway |
| GET /health | — | { status: "ok", service: "payment-service" } | Health check |

## inventory-service

| Method | Input | Output | Notes |
|---|---|---|---|
| POST /reserve | { itemId, quantity } | { reserved, remaining } | Updates DynamoDB |
| GET /stock/{item_id} | — | { itemId, quantity } | Reads from DynamoDB |
| GET /stock/status/{status} | — | [ { itemId, quantity, status } ] | Queries GSI (throttling target) |
| GET /health | — | { status: "ok", service: "inventory-service" } | Health check |
| SQS handler | { orderId, itemId, quantity } | — | Async stock update |
