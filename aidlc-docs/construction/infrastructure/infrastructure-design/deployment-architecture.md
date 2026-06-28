# Deployment Architecture

## Architecture Diagram

```
                    Internet
                       |
                       v
              +---------------+
              | CloudFront    |
              | + WAF (IP set)|
              +---------------+
                       |
                       v
                 +----------+
                 |   ALB    |
                 | (internal|
                 |  HTTP:80)|
                 +----------+
                       |
                       v
        +-----------------------------+
        |     ECS Cluster (Fargate)   |
        |                             |
        |  +--------+  +---------+   |
        |  | order- |  | payment-|   |
        |  | service|->| service |   |
        |  | :3000  |  | :5000   |   |
        |  +--------+  +---------+   |
        |       |            |        |
        |       |            v        |
        |       |     +-----------+   |
        |       |     | External  |   |
        |       |     | Gateway   |   |
        |       |     | (mock)    |   |
        |       |     +-----------+   |
        |       v                     |
        |  +-----------+              |
        |  | inventory-|              |
        |  | service   |              |
        |  | :5001     |              |
        |  +-----------+              |
        +-----------------------------+
                |           |
                v           v
        +-----------+  +---------+
        | SQS Queue |  | DynamoDB|
        +-----------+  +---------+
                |
                v
        +-----------+
        | Lambda    |
        | (notif)   |
        +-----------+
```

## Service Discovery
- Cloud Map namespace: summit-store.local
- payment-service: payment-service.summit-store.local:5000
- inventory-service: inventory-service.summit-store.local:5001

## Deployment Model
- CDK deploy (cdk deploy --all)
- No canary deployments (intentional gap for Prevention demo)
- Rolling update strategy on ECS services
