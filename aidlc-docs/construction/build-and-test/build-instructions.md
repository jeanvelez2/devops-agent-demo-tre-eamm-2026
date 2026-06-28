# Build Instructions

## Prerequisites
- Node.js 22 LTS
- Python 3.12
- Docker (for container images)
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS CLI configured with appropriate credentials
- k6 (for load testing)

## Build Steps

### 1. Install Dependencies

```bash
# order-service
cd summit-store/services/order-service && npm install

# payment-service
cd summit-store/services/payment-service && pip install -r requirements.txt

# inventory-service
cd summit-store/services/inventory-service && pip install -r requirements.txt

# infrastructure
cd summit-store/infrastructure && npm install
```

### 2. Build CDK

```bash
cd summit-store/infrastructure
npx tsc
```

### 3. Build Docker Images (local verification)

```bash
docker build -t order-service summit-store/services/order-service
docker build -t payment-service summit-store/services/payment-service
docker build -t inventory-service summit-store/services/inventory-service
```

### 4. Deploy Infrastructure

```bash
cd summit-store/infrastructure
npx cdk bootstrap  # first time only
npx cdk deploy --all --require-approval never
```

## Troubleshooting

### CDK synth fails
- Ensure `tsconfig.json` is valid: `npx tsc --noEmit`
- Check all stack dependencies are wired in `bin/app.ts`

### Docker build fails
- Ensure Dockerfiles reference correct base images
- Check that `requirements.txt` / `package.json` are in the correct directories
