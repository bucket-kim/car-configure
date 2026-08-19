import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as path from "node:path";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const repoRoot = path.join(__dirname, "..", "..");

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const catalogTable = new dynamodb.Table(this, "CatalogTable", {
      partitionKey: {
        name: "catalogId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const catalogFn = new NodejsFunction(this, "CatalogFn", {
      entry: path.join(repoRoot, "apps", "api", "src", "handlers", "catalog.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, "yarn.lock"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        CATALOG_TABLE: catalogTable.tableName,
      },
    });

    const priceFn = new NodejsFunction(this, "PriceFn", {
      entry: path.join(repoRoot, "apps", "api", "src", "handlers", "price.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, "yarn.lock"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        CATALOG_TABLE: catalogTable.tableName,
      },
    });

    catalogTable.grantReadData(catalogFn);
    catalogTable.grantReadData(priceFn);

    const api = new HttpApi(this, "ConfiguratorApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ["Content-Type"],
      },
    });

    api.addRoutes({
      path: "/catalog",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("CatalogIntegration", catalogFn),
    });

    api.addRoutes({
      path: "/price",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("PriceIntegration", priceFn),
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url ?? "" });
    new cdk.CfnOutput(this, "CatalogTableName", {
      value: catalogTable.tableName,
    });
  }
}
