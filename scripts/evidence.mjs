import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}
const paths = [
  ...files("src"),
  ...files("tests"),
  ...files("dist"),
  ...files("docs/screenshots"),
  "package.json",
  "package-lock.json",
];
const manifest = {
  recordedAt: new Date().toISOString(),
  engine: "1.0.0",
  description:
    "SHA-256 of actual source, tests, built assets and captured screenshots at release preparation.",
  sha256: Object.fromEntries(
    paths.map((p) => [
      p,
      createHash("sha256").update(readFileSync(p)).digest("hex"),
    ]),
  ),
};
writeFileSync("docs/evidence.json", JSON.stringify(manifest, null, 2));
console.log(`Recorded hashes for ${paths.length} files.`);
