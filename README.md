# mvd.im

A static index of all my projects: live apps, npm packages (`@mvd/*` and others) and tools, including ones that aren't published under `@mvd`.

## Adding or editing a project

Everything comes from [`projects.json`](./projects.json). Your editor checks it against [`projects.schema.json`](./projects.schema.json).

```jsonc
{
  "name": "@mvd/example",
  "category": "libraries",            // an id from "categories"
  "art": "example",                   // art/example.svg
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

## Illustrations

Each project can have a 64×64 duotone illustration in [`art/`](./art). They're inlined into the page and coloured by their section, so draw with these classes instead of colours:

| Class | Meaning |
| --- | --- |
| `i` | ink stroke (text colour) |
| `ia` | accent stroke |
| `ip` | paper stroke (card background) |
| `a` | accent fill |
| `b` | soft accent fill |
| `p` | paper fill |
| `k` | ink fill |
| `t` / `tp` | ink / paper text |

The `<style>` block at the top of each file is only for previewing it on its own; the build strips it. A project without `art` falls back to its section icon.

Sections (`categories`) take an `icon` (one of the names in `ICONS` in `build.mjs`), a `color` (`orange`, `teal`, `indigo`, `amber`, `pink` or `sky`) and `featured: true` to show illustrations as large banners.

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
