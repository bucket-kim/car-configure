import type { APIGatewayProxyHandler } from "aws-lambda";
import { loadCatalog } from "../db";

export const handler: APIGatewayProxyHandler = async () => {
  const catalog = await loadCatalog();

  if (!catalog) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Catalog not seeded" }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(catalog),
  };
};
