# Component Dependencies

## Dependency Matrix

| From | To | Type | Pattern |
|---|---|---|---|
| order-service | payment-service | Synchronous | HTTP POST /pay |
| order-service | inventory-service | Asynchronous | SQS message |
| order-service | ALB | Inbound | HTTP (exposed to clients) |
| payment-service | External Gateway | Synchronous | HTTP POST (mock) |
| inventory-service | DynamoDB | Synchronous | AWS SDK read/write |
| inventory-service | SQS | Inbound | Queue consumer |
| Lambda (notifications) | SES | Synchronous | Email send |
| MonitoringStack | order-service | Observability | CloudWatch alarms on p99 + error rate |
| MonitoringStack | DynamoDB | Observability | Throttling alarm |

## Data Flow

```
Client → ALB → order-service → payment-service → External Gateway (mock)
                    |
                    └──→ SQS Queue → inventory-service → DynamoDB
                    |
                    └──→ Lambda (notification) → SES
```

## Alarm Correlation Design (Triage Demo)

When payment-service degrades (timeout):
1. order-service p99 latency increases (waiting on payment-service response)
2. order-service error rate increases (payment calls fail/timeout)

Both alarms are on order-service metrics → single upstream failure triggers 2 distinct alarms → Triage Agent detects duplicate.
