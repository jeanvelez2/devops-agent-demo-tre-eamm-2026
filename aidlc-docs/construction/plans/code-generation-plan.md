# Code Generation Plan — summit-store

## Build Order (per dependency analysis)

### Phase A: Services (parallel, no inter-dependencies)
- [x] Step 1: order-service — package.json, Dockerfile, app.js
- [x] Step 2: payment-service — requirements.txt, Dockerfile, app.py
- [x] Step 3: inventory-service — requirements.txt, Dockerfile, app.py

### Phase B: Infrastructure
- [x] Step 4: CDK project setup — package.json, tsconfig, cdk.json
- [x] Step 5: NetworkStack
- [x] Step 6: DatabaseStack
- [x] Step 7: ServicesStack
- [x] Step 8: MonitoringStack
- [x] Step 9: CDK app entry point (bin/app.ts)

### Phase C: CI/CD
- [x] Step 10: GitHub Actions workflows (3 files)

### Phase D: Supporting Files
- [x] Step 11: k6 load test script
- [x] Step 12: Utility scripts (deploy.sh, trigger-incident.sh, generate-load.sh)
- [x] Step 13: .devopsagent/ files (skills, knowledge, standards, agents)
- [x] Step 14: README.md (with Demo Preparation section)
