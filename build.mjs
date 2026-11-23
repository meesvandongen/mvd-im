#!/usr/bin/env node
// Builds the static project index into ./dist from projects.json.
// No dependencies: needs Node 20 or later.
//
//   node build.mjs            fetch latest npm versions, then build
//   OFFLINE=1 node build.mjs  build without network access

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";

const OUT = new URL("./dist/", import.meta.url);
const data = JSON.parse(await readFile(new URL("./projects.json", import.meta.url), "utf8"));

// ---------------------------------------------------------------- validation

const categoryIds = new Set(data.categories.map((c) => c.id));
const seen = new Set();
for (const p of data.projects) {
  if (!categoryIds.has(p.category)) fail(`"${p.name}" has unknown category "${p.category}"`);
  if (seen.has(p.name)) fail(`duplicate project name "${p.name}"`);
  if (!p.links || Object.keys(p.links).length === 0) fail(`"${p.name}" has no links`);
  seen.add(p.name);
}

function fail(msg) {
  console.error(`projects.json: ${msg}`);
  process.exit(1);
}

// -------------------------------------------------------------- npm versions

const versions = new Map();
if (!process.env.OFFLINE) {
  const names = [...new Set(data.projects.map((p) => p.links.npm).filter(Boolean))];
  await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}/latest`, {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) versions.set(name, (await res.json()).version);
      } catch {
        // A missing version is fine: the npm link still renders.
      }
    }),
  );
  console.log(`npm: fetched ${versions.size}/${names.length} versions`);
}

// ----------------------------------------------------------------- rendering

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const host = (url) => new URL(url).host.replace(/^www\./, "");
const npmUrl = (name) => `https://www.npmjs.com/package/${name}`;
const sourceLabel = (url) => (url.includes("gitlab.com") ? "GitLab" : url.includes("github.com") ? "GitHub" : "Source");

function primaryUrl(p) {
  const l = p.links;
  return l.site ?? l.docs ?? l.demo ?? l.source ?? npmUrl(l.npm);
}

function card(p) {
  const l = p.links;
  const live = Boolean(l.site);
  const version = l.npm ? versions.get(l.npm) : undefined;
  const url = primaryUrl(p);
  const haystack = [p.name, p.description, ...(p.tags ?? []), l.npm ?? "", host(url)].join(" ").toLowerCase();

  const links = [];
  if (l.site) links.push(`<a class="link link--site" href="${esc(l.site)}">${esc(host(l.site))}</a>`);
  if (l.docs) links.push(`<a class="link" href="${esc(l.docs)}">Docs</a>`);
  if (l.demo) links.push(`<a class="link" href="${esc(l.demo)}">Demo</a>`);
  if (l.npm)
    links.push(
      `<a class="link" href="${esc(npmUrl(l.npm))}">npm${version ? ` <span class="ver">${esc(version)}</span>` : ""}</a>`,
    );
  if (l.source) links.push(`<a class="link" href="${esc(l.source)}">${sourceLabel(l.source)}</a>`);

  const flags = [
    live ? `<span class="badge badge--live" title="Live site">live</span>` : "",
    p.archived ? `<span class="badge badge--archived" title="No longer maintained">archived</span>` : "",
  ].join("");

  return `
      <li class="card${p.archived ? " card--archived" : ""}" data-search="${esc(haystack)}"${live ? " data-live" : ""}${l.npm ? " data-npm" : ""}${p.archived ? " data-archived" : ""}>
        <div class="card__head">
          <h3 class="card__title"><a href="${esc(url)}">${esc(p.name)}</a></h3>
          ${flags}
        </div>
        <p class="card__desc">${esc(p.description)}</p>
        ${p.tags?.length ? `<ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        <nav class="links" aria-label="${esc(p.name)} links">${links.join("")}</nav>
      </li>`;
}

function section(cat) {
  const projects = data.projects
    .filter((p) => p.category === cat.id)
    .sort((a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived)));
  if (projects.length === 0) return "";
  return `
    <section class="section" id="${esc(cat.id)}" data-section>
      <header class="section__head">
        <h2>${esc(cat.title)} <span class="count" data-count>${projects.length}</span></h2>
        ${cat.blurb ? `<p>${esc(cat.blurb)}</p>` : ""}
      </header>
      <ul class="grid">${projects.map(card).join("")}
      </ul>
    </section>`;
}

const total = data.projects.length;
const liveCount = data.projects.filter((p) => p.links.site).length;
const npmCount = data.projects.filter((p) => p.links.npm).length;
const archivedCount = data.projects.filter((p) => p.archived).length;
const built = new Date().toISOString().slice(0, 10);

const css = /* css */ `
:root {
  --bg: #fbfaf7; --surface: #ffffff; --text: #1c1b19; --muted: #6b675f; --faint: #a19c92;
  --border: #e7e3da; --border-strong: #d3cdc1; --accent: #c2410c; --accent-soft: #fff1e8;
  --live: #15803d; --live-soft: #e8f6ec; --chip: #f2efe8;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141412; --surface: #1c1c19; --text: #ecebe6; --muted: #a29f96; --faint: #6f6c64;
    --border: #2c2b27; --border-strong: #3d3b36; --accent: #fb923c; --accent-soft: #2c1d12;
    --live: #4ade80; --live-soft: #14281a; --chip: #262622;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.55 var(--sans); -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }

.hero { padding-top: 72px; padding-bottom: 32px; }
.wordmark { font: 700 clamp(44px, 9vw, 84px)/0.95 var(--mono); letter-spacing: -0.04em; margin: 0; }
.wordmark span { color: var(--accent); }
.lede { font-size: 19px; color: var(--muted); margin: 18px 0 0; max-width: 40em; }
.lede a { color: var(--text); text-decoration-color: var(--border-strong); text-underline-offset: 3px; }
.lede a:hover { text-decoration-color: var(--accent); }
.stats { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 24px 0 0; padding: 0; list-style: none;
  font: 13px/1.4 var(--mono); color: var(--muted); }
.stats b { color: var(--text); font-weight: 600; }

.toolbar { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
.toolbar .wrap { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding-top: 12px; padding-bottom: 12px; }
.search { flex: 1 1 240px; min-width: 0; font: inherit; font-size: 15px; padding: 9px 12px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border-strong); border-radius: 8px; }
.search:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: transparent; }
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.filter { font: 500 13px/1 var(--mono); padding: 9px 12px; border-radius: 999px; cursor: pointer;
  background: transparent; color: var(--muted); border: 1px solid var(--border-strong); }
.filter:hover { color: var(--text); }
.filter[aria-pressed="true"] { background: var(--text); color: var(--bg); border-color: var(--text); }
.toolbar[hidden] { display: none; }

.jump { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 28px 0 0; padding: 0; list-style: none; font: 13px var(--mono); }
.jump a { color: var(--muted); text-decoration: none; }
.jump a:hover { color: var(--accent); }

.section { padding: 40px 0 8px; scroll-margin-top: 72px; }
.section__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; margin-bottom: 16px; }
.section__head h2 { margin: 0; font-size: 22px; letter-spacing: -0.01em; }
.section__head p { margin: 0; color: var(--muted); font-size: 15px; }
.count { font: 500 13px var(--mono); color: var(--faint); margin-left: 4px; }

.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.card { display: flex; flex-direction: column; gap: 10px; padding: 18px 18px 16px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  transition: border-color .15s, transform .15s; }
.card:hover { border-color: var(--border-strong); }
.card--archived { opacity: .62; }
.card--archived:hover { opacity: 1; }
.card__head { display: flex; align-items: flex-start; gap: 8px; }
.card__title { margin: 0; font-size: 17px; line-height: 1.3; letter-spacing: -0.01em; flex: 1; overflow-wrap: anywhere; }
.card__title a { text-decoration: none; }
.card__title a:hover { color: var(--accent); }
.card__desc { margin: 0; color: var(--muted); font-size: 14.5px; flex: 1; }
.badge { font: 600 11px/1 var(--mono); padding: 4px 7px; border-radius: 999px; white-space: nowrap; margin-top: 2px; }
.badge--live { color: var(--live); background: var(--live-soft); }
.badge--live::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: currentColor; margin-right: 5px; vertical-align: 1px; }
.badge--archived { color: var(--muted); background: var(--chip); }
.tags { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 0; padding: 0; }
.tags li { font: 12px/1 var(--mono); color: var(--muted); background: var(--chip); padding: 4px 7px; border-radius: 5px; }
.links { display: flex; flex-wrap: wrap; gap: 6px 14px; padding-top: 10px; border-top: 1px solid var(--border);
  font: 13px/1.4 var(--mono); }
.link { color: var(--muted); text-decoration: none; }
.link:hover { color: var(--accent); }
.link--site { color: var(--accent); }
.link--site::after { content: " ↗"; }
.ver { color: var(--faint); }

.empty { padding: 48px 0; color: var(--muted); text-align: center; }
.footer { margin-top: 56px; padding-top: 28px; padding-bottom: 48px; border-top: 1px solid var(--border); color: var(--faint);
  font: 13px/1.6 var(--mono); }
.footer a { color: var(--muted); }
[hidden] { display: none !important; }

@media (max-width: 520px) {
  .wrap { padding: 0 16px; }
  .hero { padding-top: 48px; }
  .grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

// Progressive enhancement: without JavaScript every project is listed.
const js = /* js */ `
(() => {
  const toolbar = document.querySelector(".toolbar");
  const input = document.querySelector(".search");
  const buttons = [...document.querySelectorAll(".filter")];
  const cards = [...document.querySelectorAll(".card")];
  const sections = [...document.querySelectorAll("[data-section]")];
  const empty = document.querySelector(".empty");
  toolbar.hidden = false;

  const params = new URLSearchParams(location.search);
  let filter = params.get("filter") || "all";
  input.value = params.get("q") || "";

  function apply() {
    const terms = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
    let shown = 0;
    for (const card of cards) {
      const ok =
        terms.every((t) => card.dataset.search.includes(t)) &&
        (filter === "all" || filter in card.dataset);
      card.hidden = !ok;
      if (ok) shown++;
    }
    for (const s of sections) {
      const n = s.querySelectorAll(".card:not([hidden])").length;
      s.hidden = n === 0;
      s.querySelector("[data-count]").textContent = n;
    }
    empty.hidden = shown > 0;
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
    const q = new URLSearchParams();
    if (input.value) q.set("q", input.value);
    if (filter !== "all") q.set("filter", filter);
    history.replaceState(null, "", q.size ? "?" + q : location.pathname);
  }

  input.addEventListener("input", apply);
  for (const b of buttons) b.addEventListener("click", () => { filter = b.dataset.filter; apply(); });
  addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    if (e.key === "Escape" && document.activeElement === input) { input.value = ""; apply(); input.blur(); }
  });
  apply();
})();
`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1c1b19"/><text x="32" y="43" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="700" font-size="28" fill="#fbfaf7">m<tspan fill="#fb923c">.</tspan></text></svg>`;

const description = `An index of ${total} projects by Mees van Dongen: apps, games, npm packages and tools.`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mvd.im: projects by Mees van Dongen</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="mvd.im">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#141412" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>${css}</style>
</head>
<body>
  <header class="hero wrap">
    <h1 class="wordmark">mvd<span>.</span>im</h1>
    <p class="lede">Projects by <a href="https://meesvandongen.nl">Mees van Dongen</a>: apps and games,
      <a href="https://www.npmjs.com/~meesvandongen">npm packages</a> and the tools in between.
      Source on <a href="https://github.com/meesvandongen">GitHub</a> and <a href="https://gitlab.com/meesvandongen">GitLab</a>.</p>
    <ul class="stats">
      <li><b>${total}</b> projects</li>
      <li><b>${liveCount}</b> live</li>
      <li><b>${npmCount}</b> on npm</li>
      <li><b>${archivedCount}</b> archived</li>
    </ul>
    <ul class="jump">${data.categories
      .filter((c) => data.projects.some((p) => p.category === c.id))
      .map((c) => `<li><a href="#${esc(c.id)}">${esc(c.title)}</a></li>`)
      .join("")}</ul>
  </header>

  <div class="toolbar" hidden>
    <div class="wrap">
      <input class="search" type="search" placeholder="Search projects  ( / )" aria-label="Search projects" autocomplete="off">
      <div class="filters" role="group" aria-label="Filter">
        <button class="filter" type="button" data-filter="all" aria-pressed="true">All</button>
        <button class="filter" type="button" data-filter="live" aria-pressed="false">Live</button>
        <button class="filter" type="button" data-filter="npm" aria-pressed="false">npm</button>
        <button class="filter" type="button" data-filter="archived" aria-pressed="false">Archived</button>
      </div>
    </div>
  </div>

  <main class="wrap">${data.categories.map(section).join("")}
    <p class="empty" hidden>No projects match.</p>
  </main>

  <footer class="footer wrap">
    Updated ${built} · <a href="/projects.json">projects.json</a> ·
    <a href="https://github.com/meesvandongen/mvd-im">source</a>
  </footer>
  <script>${js}</script>
</body>
</html>
`;

// ------------------------------------------------------------------- output

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const { $schema, ...publicData } = data;
await Promise.all([
  writeFile(new URL("index.html", OUT), html),
  writeFile(new URL("favicon.svg", OUT), favicon),
  writeFile(new URL("projects.json", OUT), JSON.stringify(publicData, null, 2) + "\n"),
]);
console.log(`built dist/index.html: ${total} projects (${liveCount} live, ${npmCount} on npm)`);
