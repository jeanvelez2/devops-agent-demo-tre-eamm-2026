#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ServicesStack } from '../lib/services-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { CdnStack } from '../lib/cdn-stack';
import { DevOpsAgentTriggerStack } from '../lib/devops-agent-trigger-stack';
import { McpServerStack } from '../lib/mcp-server-stack';

const app = new cdk.App();

const env = { region: 'us-east-1' };

const network = new NetworkStack(app, 'SummitStoreNetwork', { env });
const database = new DatabaseStack(app, 'SummitStoreDatabase', { env });
const services = new ServicesStack(app, 'SummitStoreServices', {
  env,
  vpc: network.vpc,
  table: database.table,
  queue: database.queue,
  dlq: database.dlq,
});
new MonitoringStack(app, 'SummitStoreMonitoring', {
  env,
  alb: services.alb,
  tableName: database.table.tableName,
});
new CdnStack(app, 'SummitStoreCdn', {
  env,
  alb: services.alb,
});

new DevOpsAgentTriggerStack(app, 'SummitStoreDevOpsAgentTrigger', {
  env,
  alarmTopicArn: 'arn:aws:sns:us-east-1:223057881262:summit-store-alarms',
});

new McpServerStack(app, 'SummitStoreMcpServer', { env });
