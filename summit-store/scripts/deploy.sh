#!/bin/bash
set -e
cd "$(dirname "$0")/../infrastructure"
npm ci
npx cdk deploy --all --require-approval never
