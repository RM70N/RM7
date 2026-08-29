#!/usr/bin/env bash
#
# يبني حزمة نشر جاهزة للرفع على الاستضافة.
# التشغيل من جذر المشروع:  bash deploy/build-package.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-dist-package}"
PKG="$OUT/ahsmaha-ai"

echo "نبني السيرفر والواجهة…"
npx tsc -p server/tsconfig.json
(cd web && npx vite build)

echo "نجمّع الحزمة…"
rm -rf "$OUT" && mkdir -p "$PKG/server" "$PKG/web"

cp -r server/dist "$PKG/server/dist"
cp -r server/prisma "$PKG/server/prisma"
cp server/package.json server/prisma.config.ts "$PKG/server/"
cp -r web/dist "$PKG/web/dist"
cp web/package.json "$PKG/web/"

cp package.json package-lock.json .env.example docker-compose.yml README.md .nvmrc "$PKG/"
cp -r docs "$PKG/docs"
cp deploy/install.sh deploy/ahsmaha.service deploy/nginx.conf "$PKG/"
cp deploy/INSTALL.md "$PKG/ابدأ-من-هنا.md"

mkdir -p "$PKG/storage"/{uploads,sites,generated,tmp} "$PKG/.models"
touch "$PKG/storage/.gitkeep" "$PKG/.models/.gitkeep"

# سكربتات الإنتاج فقط
node -e '
const fs = require("node:fs");
const pkg = process.argv[1];
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");

const root = JSON.parse(fs.readFileSync(pkg + "/package.json", "utf8"));
root.scripts = {
  start: "node server/dist/index.js",
  "db:generate": "prisma generate --schema server/prisma/schema.prisma",
  "db:deploy": "prisma migrate deploy --schema server/prisma/schema.prisma",
  "engine:pull": "npm run engine:pull -w server",
  "gen:secrets": "npm run gen:secrets -w server",
};
delete root.devDependencies;
write(pkg + "/package.json", root);

const srv = JSON.parse(fs.readFileSync(pkg + "/server/package.json", "utf8"));
srv.scripts = {
  start: "node dist/index.js",
  "engine:pull": "node dist/scripts/pull-model.js",
  "gen:secrets": "node dist/scripts/gen-secrets.js",
};
delete srv.devDependencies;
write(pkg + "/server/package.json", srv);

const web = JSON.parse(fs.readFileSync(pkg + "/web/package.json", "utf8"));
web.scripts = {};
delete web.devDependencies;
delete web.dependencies;
write(pkg + "/web/package.json", web);
' "$PKG"

echo "نضغط…"
(cd "$OUT" && zip -qr ahsmaha-ai.zip ahsmaha-ai)

echo
echo "جاهز: $OUT/ahsmaha-ai.zip ($(du -h "$OUT/ahsmaha-ai.zip" | cut -f1))"
