#!/usr/bin/env node
// Builds the static project index into ./dist from projects.json.
// No dependencies: needs Node 20 or later.
//
//   node build.mjs            fetch latest npm versions, then build
//   OFFLINE=1 node build.mjs  build without network access

import { readFile, writeFile, mkdir, rm, access } from "node:fs/promises";

const OUT = new URL("./dist/", import.meta.url);
const data = JSON.parse(await readFile(new URL("./projects.json", import.meta.url), "utf8"));

// ---------------------------------------------------------------- validation

// Category colours. Each is [accent, soft, background] for light and dark themes.
const PALETTES = {
  orange: { light: ["#ea580c", "#fed7aa", "#fff4ec"], dark: ["#fb923c", "#6b3414", "#2b1b11"] },
  teal: { light: ["#0f766e", "#99f6e4", "#ecfdf8"], dark: ["#2dd4bf", "#145249", "#10241f"] },
  indigo: { light: ["#4f46e5", "#c7d2fe", "#f1f2ff"], dark: ["#818cf8", "#30347a", "#181a33"] },
  amber: { light: ["#b45309", "#fde68a", "#fffaeb"], dark: ["#fbbf24", "#634810", "#29210f"] },
  pink: { light: ["#be185d", "#fbcfe8", "#fdf2f8"], dark: ["#f472b6", "#651f43", "#2a1320"] },
  sky: { light: ["#0369a1", "#bae6fd", "#eff8ff"], dark: ["#38bdf8", "#124466", "#0e2131"] },
};

// Interface icons: 24x24, drawn with strokes in currentColor.
const ICONS = {
  apps: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
  pipeline: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.5 6c5 0 7 2 7.5 3.8M8.5 18c5 0 7-2 7.5-3.8"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  hexagon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  book: '<path d="M3 5.5c3-1.3 6-1.3 9 1 3-2.3 6-2.3 9-1v13c-3-1.3-6-1.3-9 1-3-2.3-6-2.3-9-1z"/><path d="M12 6.5v13"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
  package: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  arrow: '<path d="M7 17L17 7M9 7h8v8"/>',
  pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
};

const icon = (name, cls = "icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

const categoryIds = new Set(data.categories.map((c) => c.id));
for (const c of data.categories) {
  if (c.icon && !ICONS[c.icon]) fail(`category "${c.id}" has unknown icon "${c.icon}" (one of: ${Object.keys(ICONS).join(", ")})`);
  if (c.color && !PALETTES[c.color]) fail(`category "${c.id}" has unknown color "${c.color}" (one of: ${Object.keys(PALETTES).join(", ")})`);
}
const seen = new Set();
for (const p of data.projects) {
  if (!categoryIds.has(p.category)) fail(`"${p.name}" has unknown category "${p.category}"`);
  if (seen.has(p.name)) fail(`duplicate project name "${p.name}"`);
  if (!p.links || Object.keys(p.links).length === 0) fail(`"${p.name}" has no links`);
  if (p.art) await access(new URL(`./art/${p.art}.svg`, import.meta.url)).catch(() => fail(`"${p.name}": art/${p.art}.svg not found`));
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

// ----------------------------------------------------------------------- art

// Illustrations in art/*.svg are inlined so they follow the page theme. Their
// own <style> block is only there for previewing the file on its own.
const art = new Map();
await Promise.all(
  data.projects
    .filter((p) => p.art)
    .map(async (p) => {
      const svg = (await readFile(new URL(`./art/${p.art}.svg`, import.meta.url), "utf8"))
        .replace(/<\?xml[^>]*>/, "")
        .replace(/<style[\s\S]*?<\/style>/g, "")
        .replace(/\n\s*/g, "")
        .replace("<svg ", '<svg class="art" aria-hidden="true" focusable="false" ');
      art.set(p.name, svg);
    }),
);

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

function card(p, cat) {
  const l = p.links;
  const live = Boolean(l.site);
  const version = l.npm ? versions.get(l.npm) : undefined;
  const url = primaryUrl(p);
  const haystack = [p.name, p.description, ...(p.tags ?? []), l.npm ?? "", host(url)].join(" ").toLowerCase();

  const links = [];
  const link = (href, ico, label, cls = "link") => `<a class="${cls}" href="${esc(href)}">${icon(ico)}<span>${label}</span></a>`;
  if (l.site) links.push(link(l.site, "globe", esc(host(l.site)), "link link--site"));
  if (l.docs) links.push(link(l.docs, "book", "Docs"));
  if (l.demo) links.push(link(l.demo, "play", "Demo"));
  if (l.npm) links.push(link(npmUrl(l.npm), "package", `npm${version ? ` <span class="ver">${esc(version)}</span>` : ""}`));
  if (l.source) links.push(link(l.source, "code", sourceLabel(l.source)));

  const flags = live ? `<span class="badge badge--live" title="Live site">live</span>` : "";
  const svg = art.get(p.name) ?? (cat.icon ? icon(cat.icon, "art art--fallback") : "");
  const banner = cat.featured && svg ? `<a class="card__art" href="${esc(url)}" tabindex="-1" aria-hidden="true">${svg}</a>` : "";
  const tile = !cat.featured && svg ? `<span class="card__tile">${svg}</span>` : "";

  return `
      <li class="card${cat.featured ? " card--featured" : ""}" data-search="${esc(haystack)}"${live ? " data-live" : ""}${l.npm ? " data-npm" : ""}>
        ${banner}
        <div class="card__head">
          ${tile}
          <h3 class="card__title"><a href="${esc(url)}">${esc(p.name)}</a></h3>
          ${flags}
        </div>
        <p class="card__desc">${esc(p.description)}</p>
        ${p.tags?.length ? `<ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        <nav class="links" aria-label="${esc(p.name)} links">${links.join("")}</nav>
      </li>`;
}

function section(cat) {
  const projects = data.projects.filter((p) => p.category === cat.id);
  if (projects.length === 0) return "";
  return `
    <section class="section" id="${esc(cat.id)}" data-section data-color="${esc(cat.color ?? "indigo")}">
      <header class="section__head">
        <h2>${cat.icon ? `<span class="section__icon">${icon(cat.icon)}</span>` : ""}${esc(cat.title)} <span class="count" data-count>${projects.length}</span></h2>
        ${cat.blurb ? `<p>${esc(cat.blurb)}</p>` : ""}
      </header>
      <ul class="grid${cat.featured ? " grid--featured" : ""}">${projects.map((p) => card(p, cat)).join("")}
      </ul>
    </section>`;
}

// Hero collage: the first illustrated project of each section.
const heroTiles = data.categories
  .map((c) => ({ c, p: data.projects.find((p) => p.category === c.id && art.has(p.name)) }))
  .filter(({ p }) => p)
  .map(({ c, p }) => `<span class="hero__tile" data-color="${esc(c.color ?? "indigo")}">${art.get(p.name)}</span>`)
  .join("");

const total = data.projects.length;
const liveCount = data.projects.filter((p) => p.links.site).length;
const npmCount = data.projects.filter((p) => p.links.npm).length;
const built = new Date().toISOString().slice(0, 10);

const paletteCss = (theme) =>
  Object.entries(PALETTES)
    .map(([name, t]) => `[data-color="${name}"] { --c: ${t[theme][0]}; --c-soft: ${t[theme][1]}; --c-bg: ${t[theme][2]}; }`)
    .join("\n");

const css = /* css */ `
:root {
  --bg: #fbfaf7; --surface: #ffffff; --text: #1c1b19; --muted: #6b675f; --faint: #a19c92;
  --border: #e7e3da; --border-strong: #d3cdc1; --accent: #c2410c; --accent-soft: #fff1e8;
  --live: #15803d; --live-soft: #e8f6ec; --chip: #f2efe8;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  color-scheme: light dark;
}
${paletteCss("light")}
@media (prefers-color-scheme: dark) {
${paletteCss("dark")}
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

.hero { padding-top: 72px; padding-bottom: 32px; position: relative; }
.hero__art { display: none; }
@media (min-width: 960px) {
  .hero__art { display: grid; grid-template-columns: repeat(3, 84px); gap: 14px; position: absolute; right: 20px; top: 64px; }
  .hero__tile { display: grid; place-items: center; width: 84px; height: 84px; border-radius: 18px;
    background: var(--c-bg); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--c) 10%, transparent); transition: transform .3s ease; }
  .hero__tile .art { width: 60px; height: 60px; }
  .hero__tile:nth-child(odd) { transform: rotate(-4deg); }
  .hero__tile:nth-child(even) { transform: translateY(18px) rotate(3deg); }
  .hero__tile:hover { transform: translateY(-4px) rotate(0); }
  .lede { max-width: 30em; }
}
.wordmark { font: 700 clamp(44px, 9vw, 84px)/0.95 var(--mono); letter-spacing: -0.04em; margin: 0; }
.wordmark span { color: var(--accent); }
.lede { font-size: 19px; color: var(--muted); margin: 18px 0 0; max-width: 40em; }
.lede a { color: var(--text); text-decoration-color: var(--border-strong); text-underline-offset: 3px; }
.lede a:hover { text-decoration-color: var(--accent); }
.stats { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 24px 0 0; padding: 0; list-style: none;
  font: 13px/1.4 var(--mono); color: var(--muted); }
.stats li { display: inline-flex; align-items: center; gap: 6px; }
.stats .icon { width: 15px; height: 15px; color: var(--faint); }
.stats b { color: var(--text); font-weight: 600; }

.toolbar { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
.toolbar .wrap { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding-top: 12px; padding-bottom: 12px; }
.searchbox { flex: 1 1 240px; min-width: 0; position: relative; display: flex; align-items: center; }
.searchbox .icon { position: absolute; left: 11px; width: 17px; height: 17px; color: var(--faint); pointer-events: none; }
.search { width: 100%; font: inherit; font-size: 15px; padding: 9px 12px 9px 36px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border-strong); border-radius: 8px; }
.search:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: transparent; }
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.filter { font: 500 13px/1 var(--mono); padding: 9px 12px; border-radius: 999px; cursor: pointer;
  background: transparent; color: var(--muted); border: 1px solid var(--border-strong); }
.filter:hover { color: var(--text); }
.filter[aria-pressed="true"] { background: var(--text); color: var(--bg); border-color: var(--text); }
.toolbar[hidden] { display: none; }

.jump { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 28px 0 0; padding: 0; list-style: none; font: 13px var(--mono); }
.jump a { color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.jump .icon { width: 15px; height: 15px; color: var(--c); }
.jump a:hover { color: var(--accent); }

.section { padding: 40px 0 8px; scroll-margin-top: 72px; }
.section__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; margin-bottom: 16px; }
.section__head h2 { margin: 0; font-size: 22px; letter-spacing: -0.01em; display: flex; align-items: center; gap: 10px; }
.section__icon { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 9px;
  background: var(--c-bg); color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent); }
.section__icon .icon { width: 19px; height: 19px; }
.section__head p { margin: 0; color: var(--muted); font-size: 15px; }
.count { font: 500 13px var(--mono); color: var(--faint); margin-left: 4px; }

.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.grid--featured { gap: 16px; }
.card { display: flex; flex-direction: column; gap: 10px; padding: 18px 18px 16px; position: relative; overflow: hidden;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  transition: border-color .15s, transform .15s; }
.card:hover { border-color: color-mix(in srgb, var(--c) 45%, var(--border)); }

/* Illustrations: duotone, coloured by the section. */
.art { display: block; }
.art .i, .art .ia, .art .ip { fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.art .i { stroke: var(--text); }
.art .ia { stroke: var(--c); }
.art .ip { stroke: var(--surface); }
.art .a { fill: var(--c); }
.art .b { fill: var(--c-soft); }
.art .p { fill: var(--surface); }
.art .k { fill: var(--text); }
.art .t, .art .tp { font-family: var(--sans); font-weight: 700; }
.art .t { fill: var(--text); }
.art .tp { fill: var(--surface); }
.art--fallback { color: var(--c); }
.card__art { display: grid; place-items: center; margin: -18px -18px 4px; height: 148px;
  background-color: var(--c-bg);
  background-image: radial-gradient(color-mix(in srgb, var(--c) 22%, transparent) 1px, transparent 1.2px);
  background-size: 14px 14px; border-bottom: 1px solid var(--border); }
.card__art .art { width: 104px; height: 104px; transition: transform .25s ease; }
.card:hover .card__art .art { transform: translateY(-3px) scale(1.04) rotate(-1.5deg); }
.card__tile { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 11px;
  background: var(--c-bg); border: 1px solid color-mix(in srgb, var(--c) 14%, transparent); margin: -2px 2px 0 0; }
.card__tile .art { width: 38px; height: 38px; transition: transform .2s ease; }
.card:hover .card__tile .art { transform: scale(1.08) rotate(-3deg); }
.card__head { display: flex; align-items: center; gap: 8px; }
.card__title { margin: 0; font-size: 17px; line-height: 1.3; letter-spacing: -0.01em; flex: 1; overflow-wrap: anywhere; }
.card__title a { text-decoration: none; }
.card__title a:hover { color: var(--accent); }
.card__desc { margin: 0; color: var(--muted); font-size: 14.5px; flex: 1; }
.badge { font: 600 11px/1 var(--mono); padding: 4px 7px; border-radius: 999px; white-space: nowrap; margin-top: 2px; }
.badge--live { color: var(--live); background: var(--live-soft); align-self: flex-start; margin-top: 4px; }
.badge--live::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: currentColor; margin-right: 5px; vertical-align: 1px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 0; padding: 0; }
.tags li { font: 12px/1 var(--mono); color: var(--muted); background: var(--chip); padding: 4px 7px; border-radius: 5px; }
.links { display: flex; flex-wrap: wrap; gap: 6px 14px; padding-top: 10px; border-top: 1px solid var(--border);
  font: 13px/1.4 var(--mono); }
.link { color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 5px; }
.link .icon { width: 14px; height: 14px; flex: none; }
.link:hover { color: var(--c); }
.link--site { color: var(--c); font-weight: 600; }
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
    <div class="hero__art" aria-hidden="true">${heroTiles}</div>
    <h1 class="wordmark">mvd<span>.</span>im</h1>
    <p class="lede">Projects by <a href="https://meesvandongen.nl">Mees van Dongen</a>: apps and games,
      <a href="https://www.npmjs.com/~meesvandongen">npm packages</a> and the tools in between.
      Source on <a href="https://github.com/meesvandongen">GitHub</a> and <a href="https://gitlab.com/meesvandongen">GitLab</a>.</p>
    <ul class="stats">
      <li>${icon("apps")}<b>${total}</b> projects</li>
      <li>${icon("pulse")}<b>${liveCount}</b> live</li>
      <li>${icon("package")}<b>${npmCount}</b> on npm</li>
    </ul>
    <ul class="jump">${data.categories
      .filter((c) => data.projects.some((p) => p.category === c.id))
      .map((c) => `<li data-color="${esc(c.color ?? "indigo")}"><a href="#${esc(c.id)}">${c.icon ? icon(c.icon) : ""}${esc(c.title)}</a></li>`)
      .join("")}</ul>
  </header>

  <div class="toolbar" hidden>
    <div class="wrap">
      <label class="searchbox">${icon("search")}<input class="search" type="search" placeholder="Search projects  ( / )" aria-label="Search projects" autocomplete="off"></label>
      <div class="filters" role="group" aria-label="Filter">
        <button class="filter" type="button" data-filter="all" aria-pressed="true">All</button>
        <button class="filter" type="button" data-filter="live" aria-pressed="false">Live</button>
        <button class="filter" type="button" data-filter="npm" aria-pressed="false">npm</button>
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
