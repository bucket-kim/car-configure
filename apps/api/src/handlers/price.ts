import { computePrice, validateBuild, type BuildSelection } from "@car-config/core";
import type { APIGatewayProxyHandler } from "aws-lambda";
import { loadCatalog } from "../db";

export const handler: APIGatewayProxyHandler = async (event) => {
  // 1. parse event.body (a string, or null) — 400 on bad JSON

  if (!event.body)
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Body required",
      }),
    };

  let build: BuildSelection;
  try {
    build = JSON.parse(event.body) as BuildSelection;
    if (
      typeof build.modelId !== "string" ||
      typeof build.options !== "object" ||
      build.options === null
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Body must be a BuildSelection: { modelId, options }",
        }),
      };
    }
    // 2. shape-check: modelId is a string, options is a non-null object — 400 if not
  } catch (err) {
    console.error(err);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Body must be valid JSON",
      }),
    };
  }
  // 3. loadCatalog() — 404 if undefined
  const catalog = await loadCatalog();
  if (!catalog) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: "Catalog not seeded",
      }),
    };
  }
  // 4. validateBuild + computePrice, return { validation, price } with authoritative: true

  const validation = validateBuild(catalog, build);
  const price = computePrice(catalog, build);

  return {
    statusCode: 200,
    body: JSON.stringify({
      validation,
      price: { ...price, authoritative: true },
    }),
  };
};
