# Progress Log — Car Configurator

Step-by-step record of what's built, why, and what's next.
Companion to `PROJECT_BRIEF.md` (which holds scope and the five key segments).

---

## Where I am right now

**Phase 4b complete.** `GET /catalog` and `POST /price` are live. `POST /price` returns
`totalCents: 13959000` — byte-identical to what `pricing.test.ts` asserts locally.
**One source file, two runtimes, same answer.** The architecture's central claim is now
demonstrated, not asserted.

Next: `POST /builds` + `GET /builds/{code}` (save/share).

### Phase 4c — IN PROGRESS (mid-refactor, don't start elsewhere)

Done:
- `@tanstack/react-query` installed, `QueryProvider` wrapping `<App />` in `main.tsx`
- `src/api/client.ts` — `fetchJson<T>(path, init?)`, base URL from `VITE_API_URL`,
  throws on `!res.ok` (fetch does NOT throw on 4xx/5xx)
- `src/api/queries.ts` — `useCatalogQuery()`, verified returning the live catalog

In flight — the catalog moves from a JSON import to a network fetch:
1. **Move `initialBuildFor(catalog, modelId)` into `packages/core`** — it's pure, and the
   server will want it too. `DataModule` then imports no catalog at all.
2. **`DataModule` actions take `catalog` as a parameter** (`selectOption(catalog, optionId)`,
   etc.) rather than importing it. Rationale: server state lives in TanStack Query;
   copying it into Zustand would create two sources that can drift.
3. **`useConfiguration` wraps those actions** with `useCallback`, closing over the fetched
   catalog, so components keep calling `selectOption(optionId)` unchanged.
4. **`App` gates on query state** — loading / error / configurator. Everything below the
   gate may assume a catalog exists.
5. **Default build** — decide: initialize the store via effect once the catalog lands, OR
   derive it in `useConfiguration` when `build` is null (preferred: no lifecycle step to
   forget, no flash of empty state).

Note: changing `DataModuleTypes` requires updating `DataModule` in the same pass — the
interface and implementation move together.

---

## Phase 0 — Setup ✅

- Vite + React + TypeScript scaffold, Yarn.
- Reverted an accidental Yarn Berry migration (deleted `.yarn`, `.yarnrc.yml`, `.pnp.*`,
  removed `packageManager` from package.json, `corepack disable`).
  **Lesson:** Berry defaults to Plug'n'Play, which abandons `node_modules`; tools that
  expect real files on disk break. Yarn 1 was the right call for this stack.

## Phase 1 — Data model ✅

Designed the schema *before* any UI. `packages/core/src/types/config.ts` is the spine.

- Money as **integer cents** — floats produce visible rounding errors on a $150k build.
- Options carry their own `visual` instruction, so the 3D viewer never branches on an
  option id. Adding a paint colour = adding a data row.
- **Rules are declarative data**, not if-statements: `{ when: [...], then: [...], type }`.
  Same definitions run client-side (instant feedback) and server-side (authority).
- Pricing is a **rule pipeline** (base → options → bundle discounts → fees), not a sum.
- `BuildSelection` stores **option IDs only** — no prices, no objects. One source of truth.

`catalog.json`: 1 model, 4 groups, ~19 options, 5 rules, bundle discount + destination fee.

## Phase 2 — Rules & pricing engines ✅

Pure functions in `packages/core/src/lib/`, no framework imports, fully unit tested.

- `selectedOptionIds` — flatten to a `Set` for O(1) lookups.
- `validateBuild` — group constraints + declarative rules → `ValidationResult`.
- `computeDisabledOptions` — hypothetically applies each option and compares violation
  sets. **Key insight:** can't test `valid === false` (a half-built car is always
  invalid); must detect violations the candidate option *introduces*.
- `applySelection` — single = replace, multiple = toggle, always returns a new object.
- `computePrice` / `formatCents` — integers throughout, `cents / 100` only at the
  display boundary.

All tests green. This layer is why Phase 4 is a *move*, not a rewrite.

## Phase 3 — 3D viewer + UI ✅

- `react-three-fiber` loads the Blender-exported GLB.
- Paint applied by **material name** (`coat`), not mesh name — the model has 55+ meshes
  sharing a few materials.
- Clone scene + materials before mutating (`useGLTF` caches by URL; mutating leaks
  across mounts). Snapshot a `baseline` so deselecting restores the original finish.
- Zustand store in slices: `DataModule` (the build) + `UIModule`. IDs only, no derived
  state. `selectOption` delegates to `applySelection` — store holds state, `lib/` holds logic.
- `useConfiguration()` hook is the single place price/validity/disabled are derived.
- **Lesson:** `useMemo` is for expensive computation, not JSX — stale deps froze the panel.
- **Lesson:** React identity, not value, drives re-renders (bit me twice: `DEMO_BUILD`
  recreated each render, and mutating a `Set` in state).

## Phase 4a — Monorepo ✅

```
packages/core   @car-config/core — types, rules, pricing, catalog   (no runtime deps)
apps/web        React frontend
apps/api        Lambda handlers
infra           CDK (standalone npm/yarn project, outside the workspaces)
```

Both `web` and `api` depend on `core`; neither depends on the other. **One file, two
runtimes** — that's the whole point.

---

## Phase 4b — AWS, step by step

### Step 1 — CDK project ✅
`cdk init app --language typescript` in `infra/`.

**Mental model:** CDK code is a **generator that runs once and exits**, not a server.
`cdk synth` executes your TypeScript, builds an object tree, writes a CloudFormation
template to `cdk.out`, done. Your stack code never runs in AWS.
Then `cdk deploy` hands that template to CloudFormation, which diffs it against reality.

An empty stack still emits ~100 lines: a `CDKMetadata` resource, region conditions, and
a `BootstrapVersion` parameter — which is the preflight check `cdk bootstrap` satisfies.

### Step 2 — DynamoDB table ✅
```ts
new dynamodb.Table(this, "CatalogTable", {
  partitionKey: { name: "catalogId", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
})
```
- Partition key = the one thing you look up by. Access patterns first, then key design.
- `PAY_PER_REQUEST` — spiky, low volume, nothing when idle. Same logic that chose Lambda.
- `DESTROY` is safe *because the data is reproducible* from `catalog.json`.
- One CDK prop → two template attributes (`DeletionPolicy` + `UpdateReplacePolicy`).
- **No `TableName` in the template** — CloudFormation generates it, so the Lambda must
  receive it at runtime via an env var.
- **Logical IDs are identity.** Renaming one = delete + recreate, not a rename.

### Step 3 — First Lambda ✅
`NodejsFunction` (esbuild bundles TS) pointing at `apps/api/src/handlers/catalog.ts`.

- Handler must be an **async function** taking an event — not an object.
- Because `infra` sits outside the workspaces, needed explicit
  `projectRoot` + `depsLockFilePath` pointing at the repo root (`PathNotUnderRoot` error).
- Bundling runs from the repo root, so `esbuild` had to be installed there too.
- An empty `apps/api/tsconfig.json` broke esbuild — invalid JSON.
- One Lambda → **three** CloudFormation resources: Function, IAM Role, Policy.
  `Code` points at an S3 object, not your source: that's what bootstrap's bucket is for.

### Step 4 — Lambda ↔ DynamoDB ✅
```ts
environment: { CATALOG_TABLE: catalogTable.tableName }
catalogTable.grantReadData(catalogFn)
```
- Two separate things: **permission** (IAM) and **knowledge** (env var).
- `tableName` is a **token** at synth time — a placeholder that becomes a `Ref` in the
  template. Can't be inspected in stack code, and it creates the dependency edge that
  makes CloudFormation build the table first.
- **Lambda env vars come from the stack, not from a `.env` file.** A `.env` isn't
  bundled and nothing would read it. In serverless, configuration lives in infrastructure.
- Guard at module scope: `if (!TABLE) throw` — fail at init with a clear message rather
  than passing `undefined` into the SDK on every request.
- Drop hardcoded `region` — Lambda sets `AWS_REGION` automatically.

### Step 5 — API Gateway ✅
`HttpApi` + `HttpLambdaIntegration`, route `GET /catalog`, permissive CORS, `CfnOutput`
for the URL.

- Chose **HTTP API** over REST API: cheaper, lower latency, and this API needs none of
  REST's extras (API keys, usage plans, request validation).
- **Routing is infrastructure**, not code. Unlike Express, the handler has no idea what
  URL reached it. A route can be repointed without touching handler code.
- CORS is configured on the API. curl ignores CORS; browsers don't.

`curl <ApiUrl>catalog` → `{"error":"Not found"}` — which means the whole chain works
(Gateway → Lambda → DynamoDB) and the table is simply empty.

### Step 6 — Seed the catalog ✅
`infra/scripts/seed-catalog.ts` reads the catalog, resolves the table name from the
stack's CloudFormation outputs, and writes one item.

Bugs worth remembering from this step:
- **empty script file** — `tsx` ran it, did nothing, exited 0
- **missing `await`** on `docClient.send` — no confirmation, errors swallowed as
  unhandled rejections
- **no success log** — a silent no-op is indistinguishable from a silent success
- **`import.meta` in a CommonJS package** — `infra` has no `"type": "module"`, so
  `__dirname` was available all along
- **console-created test item keyed `"current"` with literal quotes** — DynamoDB keys are
  exact byte strings; no trimming, no coercion

What it does:
1. read `packages/core/src/data/catalog.json` (relative path — `infra` is outside the
   workspaces, so `@car-config/core/catalog` won't resolve)
2. resolve the table name (CLI arg, or `DescribeStacks` on the stack outputs —
   requires adding a `CfnOutput` for the table name)
3. `PutCommand` `{ catalogId: "current", catalog, updatedAt }`
4. `console.log` what it wrote — silence is indistinguishable from doing nothing

**Why a script** (not the console, not CDK): infrastructure and content have different
lifecycles. A price change shouldn't require a CloudFormation deploy.
`PutCommand` overwrites, so re-running is safe.

### Step 7 — Remaining endpoints ⬜
- `POST /price` — same `core` functions, returns `authoritative: true`
- `POST /builds` — save, return a share code (revalidate server-side; never trust the client)
- `GET /builds/{code}` — load, and **recompute** price rather than storing it

---

## Next phases

- **4c** — frontend calls the API (TanStack Query for server state; Zustand keeps client state)
- **5** — S3 + CloudFront hosting for the web app
- **6** — GitHub Actions: lint, test, build, deploy on merge
- **7** — README, architecture diagram, decision log

---

## Decisions log

| Decision | Chose | Why | Rejected |
|---|---|---|---|
| Compute | Lambda | Bursty, stateless, ~zero idle traffic | EC2 (24/7 cost + ops), Fargate (overkill) |
| Pricing location | Server authoritative, client estimates | Client price is editable in DevTools | Client-only |
| Rules storage | Declarative rows in DynamoDB | Change rules without redeploying | Hardcoded in Lambda |
| IaC | CDK TypeScript | Same language as the app; generates the IAM nobody writes by hand | Raw CFN YAML, SAM |
| API flavour | HTTP API | Cheaper, lower latency, no need for REST's extras | REST API |
| Table design | One item holds whole catalog | One read serves everything; 400KB limit is far off | One item per option |
| `infra` placement | Outside yarn workspaces | Simpler to learn in isolation | In workspaces — would have avoided `projectRoot`/esbuild wiring |
| IAM for deploys | AdministratorAccess on a personal user | Avoids permission whack-a-mole while learning | Least-privilege deploy role (correct for real work) |
| Accordion UI | One group open at a time | Matches how real OEM configurators scale to 300 options | Flat list (fine at this size), multi-open |
| Invalid clicks | Accept + report violations | Auto-deselecting things the user didn't touch is more confusing | Refuse click; auto-deselect |
| React vs Three.js mutation | Documented `eslint-disable` | Three.js materials are mutable by design; clones never leave the component | Refactor to refs |

---

## Interview talking points

- Why Lambda over EC2 *for this traffic shape* — not "serverless is modern"
- Why price is computed server-side — the DevTools argument, not dogma
- One `lib/` running in browser and Lambda: what made it possible (purity from day one)
- Constraint modelling: five rule shapes, and why `computeDisabledOptions` can't just
  check `valid === false`
- What CDK generates that you'd otherwise hand-write: IAM roles and least-privilege policies
- Known tradeoffs: single-item catalog, wildcard CORS, admin deploy user — and what
  each would become in production
