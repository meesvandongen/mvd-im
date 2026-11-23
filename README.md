# mvd.im

A static index of all my projects: live apps, npm packages (`@mvd/*` and others) and tools, including ones that aren't published under `@mvd`.

## Adding or editing a project

Everything comes from [`projects.json`](./projects.json). Your editor checks it against [`projects.schema.json`](./projects.schema.json).

```jsonc
{
  "name": "@mvd/example",
  "category": "libraries",            // an id from "categories"
  "description": "One sentence.",
  "links": {
    "site": "https://example.mvd.im", // live app, gets the "live" badge
    "docs": "https://...",
    "demo": "https://...",
    "npm": "@mvd/example",            // package name; latest version is fetched at build time
    "source": "https://github.com/meesvandongen/example"
  },
  "tags": ["TypeScript"]
}
```

The card title links to the first of `site`, `docs`, `demo`, `source` or `npm`.

## Build

Needs Node 20 or later. There are no dependencies.

```bash
pnpm run build            # writes dist/index.html, dist/favicon.svg and dist/projects.json
OFFLINE=1 pnpm run build  # skip fetching npm versions
pnpm run dev              # build and serve dist/ locally
```

## Deploy

`wrangler.jsonc` deploys `dist/` as a Cloudflare Workers static-assets site named `mvd-im`:

```bash
pnpm run deploy
```

Or connect the repository in Workers Builds with build command `pnpm run build`. Attach the custom domain (`mvd.im`) to the Worker in the Cloudflare dashboard. Rebuild now and then to pick up new npm versions.
