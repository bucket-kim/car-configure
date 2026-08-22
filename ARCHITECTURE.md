# Architecture

How the pieces connect, and why each one is where it is.

Companion to `README.md` (scope and overview) and `PROGRESS.md` (build log).

---

## The system in one diagram

```
┌─────────────────────── Browser ────────────────────┐   ┌────── AWS ───────┐
│                                                    │   │                  │
│   ┌───────────┐        ┌──────────────┐            │   │  ┌────────────┐  │
│   │ UI panel  │        │  CarViewer   │            │   │  │API Gateway │  │
│   │ buttons,  │        │  3D scene,   │            │   │  │  /catalog  │  │
│   │ price     │        │  materials   │            │   │  │  /price    │  │
│   └─────▲─────┘        └──────▲───────┘            │   │  └─────┬──────┘  │
│         │                     │                    │   │        │         │
│   ┌─────┴─────────────────────┴──────────────┐     │   │  ┌─────▼──────┐  │
│   │           useConfiguration               │     │   │  │   Lambda   │  │
│   │  derives price, validity, disabled       │     │   │  │  handlers  │  │
│   └─────▲─────────────────────▲──────────────┘     │   │  └─────┬──────┘  │
│         │                     │                    │   │        │         │
│   ┌─────┴──────┐      ┌───────┴────────┐           │   │  ┌─────▼──────┐  │
│   │  Zustand   │      │ TanStack Query │───────────┼───┼─▶│  DynamoDB  │  │
│   │   build    │      │    catalog     │  GET      │   │  │  catalog,  │  │
│   │ client st. │      │  server state  │  /catalog │   │  │  builds    │  │
│   └────────────┘      └────────────────┘           │   │  └────────────┘  │
└────────────────────────────────────────────────────┘   └──────────────────┘
                    ▲                                            ▲
                    └──────────────┬─────────────────────────────┘
                    ┌──────────────┴──────────────────┐
                    │        packages/core            │
                    │  rules, pricing, types          │
                    │  imported by BOTH sides         │
                    └─────────────────────────────────┘
```

**The dashed connection at the bottom is the point of the whole architecture.**
`applySelection`, `validateBuild` and `computePrice` are one implementation, executed
in the browser for instant feedback and in Lambda for the authoritative answer. They
cannot drift, because there is only one of them.

---

## Two flows to trace

### Startup

1. `App` calls `useCatalogQuery()` → `GET /catalog`
2. API Gateway → Lambda → DynamoDB → catalog JSON returns
3. `App` gates: loading → error → configurator. Below the gate a catalog is guaranteed
4. `useConfiguration(catalog)` derives a default build (`initialBuildFor`) because the
   store's build is still `null`
5. `UI` and `CarViewer` render from the same hook

### A click

1. `UI` calls `selectOption(optionId)` — one argument, no catalog
2. The hook's `useCallback` adds the catalog and calls the store's `selectOption(catalog, optionId)`
3. The store calls `applySelection` from `core` and stores the returned build
4. Zustand notifies subscribers; `useConfiguration` recomputes price, validity and
   disabled options in one memo
5. `UI` re-renders the panel; `CarViewer`'s effect re-applies materials to the scene

Everything else is plumbing around those two paths.

---

## Why each piece is where it is

| Piece                | Holds                 | Why not elsewhere                                                                                                         |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **TanStack Query**   | catalog               | It's _server_ state — a copy of something that lives elsewhere and can be stale. Needs caching, loading and error states. |
| **Zustand**          | build (IDs only)      | It's _client_ state — the user's intent, instantly changeable, never stale.                                               |
| **packages/core**    | rules, pricing, types | Belongs to neither runtime, so it can be imported by both. No React, no AWS SDK.                                          |
| **useConfiguration** | nothing               | Derives everything from `catalog` + `build`. Storing derived values invites a price that disagrees with the car.          |
| **Lambda**           | authority             | The client's price is editable in DevTools. The server's is a fact.                                                       |
| **DynamoDB**         | catalog, builds       | Rules and prices are data, so changing them doesn't require a deploy.                                                     |

---

## The rules that shaped it

**No derived state in the store.** Price, validity and disabled options are pure
functions of the build. Storing them means every action must remember to recompute all
three — and the day one is missed, the UI lies.

**Nullability stops at a boundary.** The store's build is `BuildSelection | null`.
`useConfiguration` absorbs that with a derived default and hands components a
non-optional `BuildSelection`. One layer owns the awkwardness; every layer above gets a
clean contract. Same shape as `db.ts` returning `Catalog | undefined` while the handler
turns it into a 404.

**Each layer speaks its own vocabulary.** `db.ts` knows DynamoDB, not HTTP. Handlers
know HTTP, not business rules. `core` knows rules, not where it runs. Components know
rendering, not fetching.

**Identity, not value, drives React.** Every re-render bug in this project traced back to
a new object reference: a build literal declared inside a component, a mutated `Set`,
a `useMemo` with stale deps. `useMemo`/`useCallback` here are correctness, not
optimisation.

**Configuration lives in infrastructure.** Lambda env vars come from the CDK stack, not
from a `.env` file. The frontend's `VITE_API_URL` is a build-time value inlined by Vite —
public, so never a secret.

---

## Three questions to be able to answer

1. Why is the catalog in TanStack Query and the build in Zustand?
2. Why does `useConfiguration` take `catalog` as a parameter instead of fetching it?
3. Why does the store's `selectOption` call into `core` instead of implementing the
   toggle itself?

Each has a one-sentence answer, and each is a plausible interview question about this
project.
