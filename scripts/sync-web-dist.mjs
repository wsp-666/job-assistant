import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "apps", "web", "dist");

if (!existsSync(join(src, "index.html"))) {
  console.error("apps/web/dist 不存在，跳过同步");
  process.exit(0);
}

// Legacy release/installer paths removed — user installer copies apps/web/dist directly.
console.log("web dist ready:", src);
