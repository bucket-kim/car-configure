import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
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

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    const distPath = path.join(repoRoot, "apps", "web", "dist");

    const assetDeploy = new s3deploy.BucketDeployment(this, "SiteAssetsDeploy", {
      sources: [s3deploy.Source.asset(distPath)],
      destinationBucket: siteBucket,
      exclude: ["index.html"],
      prune: false,
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.days(365)),
        s3deploy.CacheControl.immutable(),
      ],
    });

    const htmlDeploy = new s3deploy.BucketDeployment(this, "SiteHtmlDeploy", {
      sources: [s3deploy.Source.asset(distPath)],
      destinationBucket: siteBucket,
      exclude: ["*"],
      include: ["index.html"],
      prune: false,
      cacheControl: [
        s3deploy.CacheControl.noCache(),
        s3deploy.CacheControl.mustRevalidate(),
      ],
      distribution,
      distributionPaths: ["/index.html"],
    });

    htmlDeploy.node.addDependency(assetDeploy);

    new cdk.CfnOutput(this, "SiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });

    const githubProvider = new iam.OpenIdConnectProvider(this, "GitHubProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const userRole = new iam.Role(this, "UserRole", {
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub":
            "repo:bucket-kim/car-configure:ref:refs/heads/main",
        },
      }),
    });

    userRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    new cdk.CfnOutput(this, "GitHubDeployRoleArn", { value: userRole.roleArn });
  }
}
