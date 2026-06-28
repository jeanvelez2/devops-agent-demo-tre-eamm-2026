# Requirements Clarification Questions

The attached project.md is comprehensive. I have a few clarifying questions to ensure correct implementation.

## Question 1
What AWS region should this infrastructure target?

A) us-east-1 (N. Virginia)

B) us-west-2 (Oregon)

C) eu-west-1 (Ireland)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2
For the Node.js order-service, which Node.js version should be used?

A) Node.js 20 LTS

B) Node.js 22 LTS

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 3
For the Python services (payment-service, inventory-service), which Python version?

A) Python 3.11

B) Python 3.12

C) Python 3.13

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 4
For CDK infrastructure (TypeScript), which CDK version to target?

A) CDK v2 (latest stable)

B) CDK v2 with a pinned version (specify after [Answer]:)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5
Should the project use a monorepo structure (single `summit-store/` directory at workspace root) or be created directly in the workspace root?

A) Create a `summit-store/` subdirectory containing the entire project

B) Create everything directly at workspace root (infrastructure/, services/, etc.)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6: Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7: Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)

B) Partial — enforce PBT rules only for pure functions and serialization round-trips (suitable for projects with limited algorithmic complexity)

C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers with no significant business logic)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 8: Resiliency Extensions
Should the resiliency baseline be applied to this project?

A) Yes — apply the resiliency baseline as directional best practices and design-time guidance (recommended for business-critical workloads)

B) No — skip the resiliency baseline (suitable for PoCs, prototypes, and experimental projects where rapid iteration matters more than reliability)

X) Other (please describe after [Answer]: tag below)

[Answer]: A
