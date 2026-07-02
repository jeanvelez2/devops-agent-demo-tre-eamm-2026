import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export class McpServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── Lambda: MCP Server function ─────────────────────────────────────────────
    const mcpLogGroup = new logs.LogGroup(this, 'McpServerLogGroup', {
      logGroupName: '/aws/lambda/summit-store-mcp-server',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const mcpFn = new lambda.Function(this, 'McpServerFn', {
      functionName: 'summit-store-mcp-server',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'src/lambda.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'mcp-server'), {
        exclude: ['node_modules/.cache', 'cdk.out', '.git'],
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup: mcpLogGroup,
      description: 'Summit Store MCP server — Streamable HTTP transport for DevOps Agent',
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // ─── IAM: Grant CloudWatch and Cost Explorer read access ─────────────────────
    mcpFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:GetMetricData',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics',
        'cloudwatch:DescribeAlarms',
      ],
      resources: ['*'],
    }));

    mcpFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ce:GetCostAndUsage',
        'ce:GetCostForecast',
      ],
      resources: ['*'],
    }));

    mcpFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'elasticloadbalancing:DescribeLoadBalancers',
      ],
      resources: ['*'],
    }));

    // ─── API Gateway HTTP API ────────────────────────────────────────────────────
    const httpApi = new apigateway.HttpApi(this, 'McpHttpApi', {
      apiName: 'summit-store-mcp',
      description: 'MCP server endpoint for AWS DevOps Agent (Streamable HTTP)',
    });

    // POST /mcp — JSON-RPC requests (initialize, tools/list, tools/call)
    httpApi.addRoutes({
      path: '/mcp',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('McpPost', mcpFn),
    });

    // GET /mcp — SSE stream (required by protocol, returns 405 in stateless mode)
    httpApi.addRoutes({
      path: '/mcp',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('McpGet', mcpFn),
    });

    // DELETE /mcp — session termination (no-op in stateless mode)
    httpApi.addRoutes({
      path: '/mcp',
      methods: [apigateway.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration('McpDelete', mcpFn),
    });

    // ─── Outputs ─────────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'McpEndpointUrl', {
      value: `${httpApi.apiEndpoint}/mcp`,
      description: 'MCP server endpoint URL — use this when registering in DevOps Agent console',
    });

    new cdk.CfnOutput(this, 'McpFunctionArn', {
      value: mcpFn.functionArn,
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      value: httpApi.httpApiId,
    });
  }
}
