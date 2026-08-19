// @car-config/core — the code that belongs to NEITHER the browser nor AWS.
//
// This package is the contract between the two. The React app imports it to
// render instant feedback; the Lambda handlers import it to produce the
// authoritative answer. One definition, two runtimes — which is the whole
// reason lib/ was written as pure functions from day one.
//
// Nothing in this package may import React, Zustand, Three.js, or the AWS SDK.
// If you ever need to, the thing you're writing belongs in apps/web or infra.

export * from "./lib/build";
export * from "./lib/pricing";
export * from "./lib/rules";
export * from "./types/config";

export { default as catalog } from "./data/catalog.json";
