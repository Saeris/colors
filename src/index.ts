import { resolve } from "node:path";
import { access, mkdir, writeFile } from "node:fs/promises";
import { format } from "prettier";
import { generate } from "./generate";

try {
  const dist = resolve(import.meta.dirname, `../dist`);

  try {
    await access(dist);
  } catch {
    await mkdir(dist);
  }

  console.log(`Generating CSS...`);

  for await (const [file, css] of generate(dist)) {
    await writeFile(file, await format(css, { parser: `css` }));
  }

  console.log(`Done!`);

  process.exit(0);
} catch (err) {
  console.error(`Failed to generate CSS!`, err);

  process.exit(1);
}
