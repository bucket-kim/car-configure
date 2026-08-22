# Car Configurator

A new-car configurator for the Porsche 911 Carrera 4S — 3D viewer, constraint rules
engine, and server-authoritative pricing — running on AWS serverless infrastructure
defined in CDK and deployed by CI.

**[Live demo →](https://d1ekd7k5ozbyxe.cloudfront.net/)**

> Most configurator demos are frontends. This one is a system.

---

## Why this exists

Configurators are a common portfolio project, and they almost always stop at the same
place: a 3D model, some colour swatches, and a price added up in the browser. Production
configurators — Porsche's, BMW's, Tesla's — differ in four specific ways. This project
implements three of them:

| Production behaviour      | Here                                                       |
| ------------------------- | ---------------------------------------------------------- |
| A constraint/rules engine | ✅ Declarative rules, evaluated in both runtimes           |
| Server-computed pricing   | ✅ `POST /price` — the client's number is only an estimate |
| Save & share build codes  | ⬜ Designed, not yet built                                 |
| Dealer inventory matching | ⬜ Out of scope — low signal for the engineering questions |

---

## The central idea

The rules and pricing engines live in `packages/core` as pure functions with no React,
no Three.js, and no AWS SDK. The browser imports them for instant feedback. The Lambda
imports **the same files** for the authoritative answer.

```
                    ┌─────────────────────────────────┐
   browser  ───────▶│        packages/core            │◀─────── Lambda
   instant          │  rules · pricing · types        │      authoritative
   feedback         │  pure functions, no framework   │
                    └─────────────────────────────────┘
```

They cannot drift, because there is only one of them. That claim is verified rather than
asserted: a build priced locally by `pricing.test.ts` and by the deployed `POST /price`
returns `totalCents: 13959000` from both — byte-identical.

The UI shows both. Clicking an option updates the price instantly from the browser
("Estimate"), then the label flips to "Confirmed" when Lambda answers — and the app
compares the two and would warn on screen if they ever disagreed. In a correct system
that warning never fires, which is exactly what makes it worth rendering.

CI is what keeps it true. Both artifacts are built from the same commit by the same job,
so "one file, two runtimes" is enforced by the pipeline rather than remembered by me.

---

## Architecture

```
┌─────────────────── Browser ────────────────┐   ┌─────── AWS ────────┐
│                                            │   │                    │
│   ┌───────────┐        ┌──────────────┐    │   │  ┌──────────────┐  │
│   │ UI panel  │        │  CarViewer   │    │   │  │ API Gateway  │  │
│   │ options,  │        │  3D scene,   │    │   │  │   /catalog   │  │
│   │ price     │        │  materials   │    │   │  │   /price     │  │
│   └─────▲─────┘        └──────▲───────┘    │   │  └──────┬───────┘  │
│         │                     │            │   │         │          │
│   ┌─────┴─────────────────────┴────────┐   │   │  ┌──────▼───────┐  │
│   │         useConfiguration           │   │   │  │    Lambda    │  │
│   │  derives price, validity, disabled │   │   │  │   handlers   │  │
│   └─────▲─────────────────────▲────────┘   │   │  └──────┬───────┘  │
│         │                     │            │   │         │          │
│   ┌─────┴──────┐      ┌───────┴────────┐   │   │  ┌──────▼───────┐  │
│   │  Zustand   │      │ TanStack Query │───┼───┼─▶│   DynamoDB   │  │
│   │   build    │      │    catalog     │   │   │  │   catalog    │  │
│   │ client st. │      │  server state  │   │   │  └──────────────┘  │
│   └────────────┘      └────────────────┘   │   │                    │
└────────────────────────────────────────────┘   └────────────────────┘

  Static assets: S3 (private) → CloudFront (OAC) → browser
```

Full reasoning in **[ARCHITECTURE.md](./ARCHITECTURE.md)**; the build log, every bug hit
and why each decision was made is in **[PROGRESS.md](./PROGRESS.md)**.

---

## What it does

- **3D viewer** — a Blender-exported GLB, with paint applied by _material_ name rather
  than mesh name (the model has 55+ meshes sharing a few materials)
- **Catalog** — 1 model, 4 option groups, 20 options, 5 constraint rules, 3 price rules,
  stored as data in DynamoDB so changing a price doesn't require a deploy
- **Rules engine** — `requires` / `excludes` relationships evaluated to produce validity
  and a disabled set, with reasons
- **Pricing** — a pipeline (base → options → bundle discounts → fees), integer cents
  throughout, formatted only at the display boundary

## Stack

| Layer    | Choice                         | Why                                                      |
| -------- | ------------------------------ | -------------------------------------------------------- |
| Frontend | React, TypeScript, Vite        |                                                          |
| 3D       | react-three-fiber / Three.js   |                                                          |
| State    | TanStack Query + Zustand       | Server state and client state have different needs       |
| Shared   | `@car-config/core`             | Pure functions importable by browser and Lambda alike    |
| API      | API Gateway HTTP API + Lambda  | Bursty, stateless, ~zero idle traffic                    |
| Data     | DynamoDB (on-demand)           | Single-digit-ms reads, nothing to pay for when idle      |
| Hosting  | S3 + CloudFront (private, OAC) | A built SPA is static files; the CDN edge-caches the GLB |
| Infra    | AWS CDK (TypeScript)           | Same language as the app; writes the IAM nobody wants to |
| CI/CD    | GitHub Actions + OIDC          | No long-lived AWS credentials stored anywhere            |

## Layout

```
apps/web        React frontend
apps/api        Lambda handlers (HTTP only — no business logic)
packages/core   types, rules, pricing, catalog   (no runtime dependencies)
infra           CDK stack (own lockfile, outside the workspaces)
```

---

## Running locally

```bash
yarn install
echo "VITE_API_URL=https://<your-api>.execute-api.<region>.amazonaws.com" > apps/web/.env
yarn dev
```

```bash
yarn test          # rules + pricing unit tests
yarn lint
yarn format:check
```

## Deploying

Push to `main`. The pipeline runs `format:check` → `lint` → `test` → `build` → `cdk deploy`,
and only reaches AWS if everything before it passed — credentials are configured in the
second-to-last step, so a red test cannot touch the account.

Authentication is GitHub OIDC: Actions mints a short-lived signed token asserting which
repo and branch it is, and an IAM role trusts that claim. **No access keys exist**, in
GitHub or anywhere else.

For a first-time deploy from scratch:

```bash
cd infra && npx cdk bootstrap && npx cdk deploy   # creates the API
yarn seed                                          # loads catalog.json into DynamoDB
# copy the ApiUrl output into apps/web/.env, then deploy again for the site
```

---

## Known gaps

Listed because knowing what isn't done is part of the work:

- **Save & share build codes** — `POST /builds` and `GET /builds/{code}` are designed
  (recompute price on load rather than storing it) but not implemented.
- **UI polish** — disabled options don't yet surface their rule reasons, and there's no
  itemised price receipt.
- **Wildcard CORS** — fine for a public read-only demo, would be an origin allowlist for
  anything real.
- **Single-item catalog** — the whole catalog is one DynamoDB item. One read serves
  everything and the 400KB limit is far off, but it wouldn't scale to a real option tree.
- **No custom domain** — stops at the CloudFront default. Adding one means a Route 53
  hosted zone and an ACM certificate, which must live in `us-east-1` regardless of the
  stack's region.

---

## Three questions this project prepares me to answer

1. Why is the catalog in TanStack Query and the build in Zustand?
2. Why does the server recompute price instead of trusting the client's number?
3. Why is "one file, two runtimes" a claim about CI as much as about file layout?
