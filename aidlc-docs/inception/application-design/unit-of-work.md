# Units of Work

## Unit 1: order-service
- **Type**: Microservice (Node.js 22 / Express)
- **Location**: summit-store/services/order-service/
- **Scope**: Application code, Dockerfile, package.json, unit tests
- **Stories**: FR-01, FR-09 (demo branches created post-build)

## Unit 2: payment-service
- **Type**: Microservice (Python 3.12 / Flask)
- **Location**: summit-store/services/payment-service/
- **Scope**: Application code, Dockerfile, requirements.txt, unit tests

## Unit 3: inventory-service
- **Type**: Microservice (Python 3.12 / Flask)
- **Location**: summit-store/services/inventory-service/
- **Scope**: Application code, Dockerfile, requirements.txt, unit tests

## Unit 4: infrastructure
- **Type**: CDK Application (TypeScript)
- **Location**: summit-store/infrastructure/
- **Scope**: 4 CDK stacks, package.json, tsconfig, cdk.json

## Unit 5: ci-cd
- **Type**: GitHub Actions workflows
- **Location**: summit-store/.github/workflows/
- **Scope**: 3 workflow YAML files (one per service)

## Unit 6: supporting-files
- **Type**: Scripts, load tests, DevOps Agent config, README
- **Location**: summit-store/ (root-level files and directories)
- **Scope**: loadtest/, scripts/, .devopsagent/, README.md
