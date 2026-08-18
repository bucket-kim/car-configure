import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

// 1. resolve the catalog path (infra/scripts -> ../../packages/core/src/data/catalog.json)

const catalogPath = join(
  __dirname,
  "..",
  "..",
  "packages",
  "core",
  "src",
  "data",
  "catalog.json",
);

// 2. readFileSync + JSON.parse
const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
// 3. Resolve the table name.
//
// CloudFormation generates the physical table name, so it can't be hardcoded.
// Rather than copy-pasting it, ask the deployed stack what it is: `cdk deploy`
// published it as an Output, and DescribeStacks reads Outputs back.
//
// An explicit CLI argument still wins, which is useful for pointing the seeder
// at a different stack or a table you created by hand.
const STACK_NAME = "InfraStack";
const OUTPUT_KEY = "CatalogTableName";

async function resolveTableName(): Promise<string> {
  const fromArg = process.argv[2];
  if (fromArg) return fromArg;

  const cfn = new CloudFormationClient({});
  const res = await cfn.send(new DescribeStacksCommand({ StackName: STACK_NAME }));

  const output = res.Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === OUTPUT_KEY);

  if (!output?.OutputValue) {
    throw new Error(
      `No "${OUTPUT_KEY}" output on stack "${STACK_NAME}".\n` +
        `Add:  new cdk.CfnOutput(this, "${OUTPUT_KEY}", { value: catalogTable.tableName })\n` +
        `then redeploy — or pass the table name directly: yarn seed <table-name>`,
    );
  }

  return output.OutputValue;
}

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// 4. PutCommand { catalogId: "current", catalog, updatedAt: new Date().toISOString() }

const main = async () => {
  const tableName = await resolveTableName();

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        catalogId: "current",
        catalog,
        updatedAt: new Date().toISOString(),
      },
    }),
  );

  console.log(`Seeded catalog into ${tableName}`);
  console.log(
    `  ${catalog.models.length} model(s), ${catalog.options.length} options, ${catalog.rules.length} rules`,
  );
};

// 5. console.log what you wrote, including counts
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
