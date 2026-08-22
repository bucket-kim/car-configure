# Progress Log — Car Configurator

Step-by-step record of what's built, why, and what's next.
Companion to `PROJECT_BRIEF.md` (which holds scope and the five key segments).

---

## Where I am right now

**The full loop is live.** Browser → CloudFront → S3 for the app; the app calls
API Gateway → Lambda → DynamoDB for its data. `POST /price` returns
`totalCents: 13959000` — byte-identical to what `pricing.test.ts` asserts locally.
**One source file, two runtimes, same answer.** The architecture's central claim is
demonstrated, not asserted.

**Next: Phase 6 — CI/CD.** Picking up at the GitHub OIDC provider + deploy role in
`infra-stack.ts`. See the Phase 6 section below for the full plan.

Deferred by choice (a working end-to-end system beat both):

- `POST /builds` + `GET /builds/{code}` — save/share codes
- UI polish — selected/disabled states with rule messages, price receipt, validation display

---

## Phase 0 — Setup ✅

- Vite + React + TypeScript scaffold, Yarn.
- Reverted an accidental Yarn Berry migration (deleted `.yarn`, `.yarnrc.yml`, `.pnp.*`,
  removed `packageManager` from package.json, `corepack disable`).
  **Lesson:** Berry defaults to Plug'n'Play, which abandons `node_modules`; tools that
  expect real files on disk break. Yarn 1 was the right call for this stack.

## Phase 1 — Data model ✅

Designed the schema _before_ any UI. `packages/core/src/types/config.ts` is the spine.

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
  invalid); must detect violations the candidate option _introduces_.
- `applySelection` — single = replace, multiple = toggle, always returns a new object.
- `computePrice` / `formatCents` — integers throughout, `cents / 100` only at the
  display boundary.

All tests green. This layer is why Phase 4 is a _move_, not a rewrite.

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
});
```

- Partition key = the one thing you look up by. Access patterns first, then key design.
- `PAY_PER_REQUEST` — spiky, low volume, nothing when idle. Same logic that chose Lambda.
- `DESTROY` is safe _because the data is reproducible_ from `catalog.json`.
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
environment: {
  CATALOG_TABLE: catalogTable.tableName;
}
catalogTable.grantReadData(catalogFn);
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

### Step 7 — Remaining endpoints

- `POST /price` ✅ — same `core` functions, returns `authoritative: true`
- `POST /builds` ⬜ — save, return a share code (revalidate server-side; never trust the client)
- `GET /builds/{code}` ⬜ — load, and **recompute** price rather than storing it

---

## Phase 4c — Frontend calls the API ✅

The catalog moved from a JSON import to a network fetch. What that forced:

- `initialBuildFor(catalog, modelId)` moved into `packages/core` — it's pure, and the
  server will want it too. `DataModule` now imports no catalog at all.
- `DataModule` actions take `catalog` as their first parameter rather than importing it.
  Server state lives in TanStack Query; copying it into Zustand would create two sources
  that can drift.
- `useConfiguration(catalog)` wraps those actions in `useCallback`, so components still
  call `selectOption(optionId)` with one argument. **The hook absorbs the awkwardness.**
- `App` gates on query state — loading / error / configurator. Everything below the gate
  may assume a catalog exists.
- Default build is **derived** in `useConfiguration` when the store's build is `null`,
  not set by an effect. No lifecycle step to forget, no flash of empty state.

Lesson that keeps recurring: **nullability stops at a boundary.** The store holds
`BuildSelection | null`; one layer converts that to a guaranteed `BuildSelection`. Same
shape as `db.ts` returning `Catalog | undefined` while the handler turns it into a 404.

---

## Phase 5 — S3 + CloudFront hosting ✅

`yarn build` in `apps/web` → `dist/` → S3 → CloudFront. **No server serves the frontend.**

Pieces:

- **`s3.Bucket`** — `BLOCK_ALL` public access. The bucket is private; CloudFront reaches
  it through Origin Access Control, which CDK writes into the bucket policy.
- **`cloudfront.Distribution`** — `S3BucketOrigin.withOriginAccessControl`,
  `REDIRECT_TO_HTTPS`, `defaultRootObject: "index.html"`.
- **SPA fallback** — 403 and 404 both map to `/index.html` with `responseHttpStatus: 200`.
  S3 returns 403 (not 404) for a missing key when the bucket is private, so both must be
  handled or deep links break.
- **Two `BucketDeployment`s, deliberately.**

### Why two deployments

| Deployment | Contents            | Cache                          | Invalidation  |
| ---------- | ------------------- | ------------------------------ | ------------- |
| Assets     | everything but HTML | 1 year, `public`, `immutable`  | none needed   |
| HTML       | `index.html` only   | `no-cache` + `must-revalidate` | `/index.html` |

Hashed asset filenames are content-addressed — change the content, the filename changes —
so they can be cached forever and never revalidated. `index.html` names those hashes and
its own URL never changes, so caching it means **a deploy is invisible to returning users
until the cache expires.** That's a bug you'd only meet on your _second_ deploy.

Two props that look decorative but aren't:

- `prune: false` on **both** — pruning deletes bucket objects absent from the source.
  Each deployment's source excludes the other's files, so with pruning on they'd delete
  each other's uploads every deploy. Cost: old bundles accumulate. Fix if it ever matters
  is an S3 lifecycle rule, not pruning.
- `htmlDeploy.node.addDependency(assetsDeploy)` — CDK won't order sibling constructs on
  its own. Without it, `index.html` can be published referencing assets that aren't
  uploaded yet. Small window, real broken page.

Also: `distributionPaths` requires the `distribution` prop — CDK errors at synth without
it. Invalidating one path rather than `/*` is the habit worth keeping (invalidations cost
money past the free tier).

### Bootstrap ordering

`VITE_API_URL` is inlined by Vite at build time, so the API must exist before the web app
is built. The URL is stable, so this is a **one-time** sequence, not a per-deploy problem:
deploy API → copy `ApiUrl` into `apps/web/.env.local` → `yarn build` → deploy again.

Stopped at the CloudFront default domain (`d***.cloudfront.net`). A custom domain would
add a Route 53 hosted zone, an A-record alias, and an ACM certificate — **which must live
in `us-east-1` regardless of the stack's region**, because CloudFront is global and reads
certs only from there.

---

## Phase 6 — CI/CD with GitHub Actions ⬜ IN PROGRESS

Repo: `bucket-kim/car-configure`, branch `main`.

### Why this project specifically needs it

`packages/core` ships into **two** artifacts: the browser bundle (`yarn build`) and both
Lambdas (`cdk deploy` bundles with esbuild). Edit `computePrice` and run `cdk deploy`
without rerunning `yarn build`, and the Lambda has new pricing while the browser has old.
**The client and server disagree — the exact drift the architecture exists to prevent**,
reintroduced by the order commands happened to be typed.

So the real claim isn't "one file." It's **one file, built into both artifacts from the
same commit.** CI is what makes the second half true. Without it the guarantee is
"one file, and I remembered."

Smaller wins: a red test can't reach AWS; `VITE_API_URL` moves out of a gitignored
`.env.local` that exists on exactly one laptop; no long-lived credentials anywhere.

### Steps

**1. GitHub OIDC provider + deploy role in CDK** ⬜

Rather than storing an access key, GitHub mints a short-lived signed token asserting
_"I am a run on repo `bucket-kim/car-configure`, branch `main`."_ AWS verifies the
signature, checks the claim, returns 1-hour credentials. **No secret is stored anywhere.**

- `iam.OpenIdConnectProvider` — url `https://token.actions.githubusercontent.com`,
  `clientIds: ["sts.amazonaws.com"]`. An account holds only **one** provider per URL;
  a second attempt fails with `EntityAlreadyExists`.
- `iam.Role` with `iam.WebIdentityPrincipal`, conditions:
  - `StringEquals` `...:aud` → `sts.amazonaws.com`
  - `StringEquals` `...:sub` → `repo:bucket-kim/car-configure:ref:refs/heads/main`

  **The `sub` condition is the entire security boundary.** Copying `repo:*` from a blog
  post grants any GitHub repository on earth the right to assume the role.

- Permissions: **not** `AdministratorAccess`. `cdk bootstrap` already created
  `cdk-hnb659fds-*` roles holding exactly what a deploy needs, so this role needs one
  grant — `sts:AssumeRole` on `arn:aws:iam::${account}:role/cdk-*`. The chain reads:
  GitHub proves identity → assumes this thin role → which assumes CDK's roles → which
  touch resources. Each link narrow.
- `CfnOutput` the role ARN.

**2. Deploy locally one last time** ⬜ — the role has to exist before GitHub can assume it.

**3. `.github/workflows/deploy.yml`** ⬜ — on push to `main`: checkout → node + yarn
cache → install → `format:check` → `lint` → `test` → `yarn build` (web) → `cdk deploy`.
Fails fast, so a red test never reaches AWS. Needs `permissions: id-token: write` for
OIDC to work at all.

**4. Repo variables** ⬜ — `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `VITE_API_URL`.

**5. Push and debug** ⬜ — the first run essentially always fails on something
(permissions block, yarn cache path, region).

**6. Prove the gate** ⬜ — break a test on purpose, confirm the deploy is blocked, revert.
The claim is that a red test can't reach AWS; verify it rather than assume it.

---

## Next phases

- **7** — README, decision log finalisation
- **Deferred** — `POST /builds` + `GET /builds/{code}`; UI polish
- **Personal** — rebuild a throwaway AWS stack from scratch, for repetition

---

## Decisions log

| Decision                   | Chose                                  | Why                                                                        | Rejected                                                         |
| -------------------------- | -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Compute                    | Lambda                                 | Bursty, stateless, ~zero idle traffic                                      | EC2 (24/7 cost + ops), Fargate (overkill)                        |
| Pricing location           | Server authoritative, client estimates | Client price is editable in DevTools                                       | Client-only                                                      |
| Rules storage              | Declarative rows in DynamoDB           | Change rules without redeploying                                           | Hardcoded in Lambda                                              |
| IaC                        | CDK TypeScript                         | Same language as the app; generates the IAM nobody writes by hand          | Raw CFN YAML, SAM                                                |
| API flavour                | HTTP API                               | Cheaper, lower latency, no need for REST's extras                          | REST API                                                         |
| Table design               | One item holds whole catalog           | One read serves everything; 400KB limit is far off                         | One item per option                                              |
| `infra` placement          | Outside yarn workspaces                | Simpler to learn in isolation                                              | In workspaces — would have avoided `projectRoot`/esbuild wiring  |
| IAM for deploys            | AdministratorAccess on a personal user | Avoids permission whack-a-mole while learning                              | Least-privilege deploy role (correct for real work)              |
| Accordion UI               | One group open at a time               | Matches how real OEM configurators scale to 300 options                    | Flat list (fine at this size), multi-open                        |
| Invalid clicks             | Accept + report violations             | Auto-deselecting things the user didn't touch is more confusing            | Refuse click; auto-deselect                                      |
| React vs Three.js mutation | Documented `eslint-disable`            | Three.js materials are mutable by design; clones never leave the component | Refactor to refs                                                 |
| Frontend hosting           | S3 + CloudFront, private bucket + OAC  | A built SPA is static files; no server needed. CDN edge-caches the `.glb`  | Public bucket website hosting, Amplify, Vercel                   |
| Cache policy               | Split: assets immutable, HTML no-cache | Hashed filenames can't go stale; `index.html`'s URL never changes          | One policy for everything (ships the stale-HTML bug)             |
| Domain                     | CloudFront default `*.cloudfront.net`  | Proves the same architecture; a domain adds cost and no signal             | Route 53 + ACM cert (must be `us-east-1`)                        |
| CI credentials             | GitHub OIDC → thin role → `cdk-*`      | Nothing long-lived is stored; trust is in the `sub` claim, not a string    | Access keys in GitHub Secrets; `AdministratorAccess` on the role |

---

## Interview talking points

- Why Lambda over EC2 _for this traffic shape_ — not "serverless is modern"
- Why price is computed server-side — the DevTools argument, not dogma
- One `lib/` running in browser and Lambda: what made it possible (purity from day one)
- Constraint modelling: five rule shapes, and why `computeDisabledOptions` can't just
  check `valid === false`
- What CDK generates that you'd otherwise hand-write: IAM roles and least-privilege policies
- Why `index.html` and hashed assets get opposite cache policies — the deploy-is-invisible bug
- **"The shared core is only a guarantee if both artifacts come from the same commit —
  CI is what enforces that, not the file layout."**
- Known tradeoffs: single-item catalog, wildcard CORS, admin deploy user — and what
  each would become in production
