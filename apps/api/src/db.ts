import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Catalog } from "@car-config/core";

const TABLE = process.env.CATALOG_TABLE;
if (!TABLE) throw new Error("CATALOG_TABLE env var is not set");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

let cached: Catalog | undefined;

export const loadCatalog = async (): Promise<Catalog | undefined> => {
  if (cached) return cached;

  const res = await docClient.send(
    new GetCommand({
      TableName: TABLE,
      Key: {
        catalogId: "current",
      },
    }),
  );

  if (!res.Item) return undefined;
  cached = res.Item.catalog as Catalog;

  return cached;
};
