// Prints a Markdown coverage summary from Vitest's `coverage/coverage-summary.json` (json-summary reporter).
// Usage (from an app directory):  node ../.github/scripts/coverage-summary.mjs "Backend" >> "$GITHUB_STEP_SUMMARY"
// It only reports: it never fails the build on a low number (no threshold is enforced).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const title = process.argv[2] ?? "Coverage";
const file = path.resolve(process.cwd(), process.argv[3] ?? "coverage/coverage-summary.json");

if (!existsSync(file)) {
  console.log(`### ${title} coverage\n\n_No coverage summary found at \`${file}\`._`);
  process.exit(0);
}

const summary = JSON.parse(readFileSync(file, "utf8"));
const { total, ...files } = summary;
const pct = (m) => (m.total === 0 ? "n/a" : `${m.pct.toFixed(1)}%`);

const lines = [
  `### ${title} coverage`,
  "",
  "| Metric | Covered | Total | % |",
  "|---|---:|---:|---:|",
  ...[
    ["Statements", total.statements],
    ["Branches", total.branches],
    ["Functions", total.functions],
    ["Lines", total.lines],
  ].map(([name, m]) => `| ${name} | ${m.covered} | ${m.total} | **${pct(m)}** |`),
];

// The files with the lowest line coverage are where to add tests next.
const weakest = Object.entries(files)
  .filter(([, m]) => m.lines.total > 0 && m.lines.pct < 90)
  .sort((a, b) => a[1].lines.pct - b[1].lines.pct)
  .slice(0, 8);

if (weakest.length > 0) {
  const root = process.cwd() + path.sep;
  lines.push("", "<details><summary>Files below 90% line coverage</summary>", "", "| File | Lines | Statements |", "|---|---:|---:|");
  for (const [f, m] of weakest) {
    lines.push(`| \`${f.replace(root, "").replaceAll("\\", "/")}\` | ${pct(m.lines)} | ${pct(m.statements)} |`);
  }
  lines.push("", "</details>");
}

console.log(lines.join("\n"));
