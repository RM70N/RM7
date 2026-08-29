#!/usr/bin/env bash
#
# احسمها AI — سكربت التثبيت
# التشغيل:  bash install.sh
#
set -euo pipefail

cd "$(dirname "$0")"

GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; RED=$'\033[0;31m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
ok()   { echo "${GREEN}✓${OFF} $1"; }
warn() { echo "${YELLOW}!${OFF} $1"; }
die()  { echo "${RED}✗${OFF} $1"; exit 1; }

echo
echo "${BOLD}تثبيت احسمها AI${OFF}"
echo "────────────────────────────"

# ── 1. المتطلبات ──
command -v node >/dev/null || die "Node.js مو مثبت. ثبّت الإصدار 20 أو أحدث."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $NODE_MAJOR قديم. المطلوب 20 أو أحدث."
ok "Node.js $(node -v)"

command -v npm >/dev/null || die "npm مو مثبت."
ok "npm $(npm -v)"

if command -v ffmpeg >/dev/null; then
  ok "ffmpeg موجود — الفيديو والموشن بيشتغلون"
else
  warn "ffmpeg مو موجود — الصور بتشتغل، لكن الفيديو والموشن لأ"
  warn "  التثبيت:  sudo apt-get install -y ffmpeg"
fi

CHROME=""
for c in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome /usr/bin/google-chrome-stable; do
  [ -x "$c" ] && CHROME="$c" && break
done
if [ -n "$CHROME" ]; then
  ok "متصفح الرسم موجود: $CHROME"
else
  warn "ما لقينا متصفح للرسم — الاستوديو البصري ما بيشتغل"
  warn "  التثبيت:  sudo apt-get install -y chromium-browser"
  warn "  أو حط مساره في CHROMIUM_PATH داخل .env"
fi

# ── 2. الإعدادات ──
if [ ! -f .env ]; then
  cp .env.example .env
  ok "أنشأنا ملف .env"

  echo
  echo "${BOLD}نولّد مفاتيح الحماية…${OFF}"
  SECRETS=$(node -e '
    const { randomBytes } = require("node:crypto");
    console.log(randomBytes(48).toString("base64url"));
    console.log(randomBytes(32).toString("base64"));
    console.log(randomBytes(18).toString("base64url"));
  ')
  SESSION_SECRET=$(echo "$SECRETS" | sed -n 1p)
  ENCRYPTION_KEY=$(echo "$SECRETS" | sed -n 2p)
  OWNER_PASSWORD=$(echo "$SECRETS" | sed -n 3p)

  node -e '
    const fs = require("node:fs");
    const [session, encryption, password, chrome] = process.argv.slice(1);
    let env = fs.readFileSync(".env", "utf8");
    const set = (key, value) =>
      (env = env.replace(new RegExp("^" + key + "=.*$", "m"), key + "=" + value));
    set("SESSION_SECRET", session);
    set("ENCRYPTION_KEY", encryption);
    set("OWNER_PASSWORD", password);
    set("NODE_ENV", "production");
    if (chrome) set("CHROMIUM_PATH", chrome);
    fs.writeFileSync(".env", env);
  ' "$SESSION_SECRET" "$ENCRYPTION_KEY" "$OWNER_PASSWORD" "$CHROME"

  ok "ولّدنا مفاتيح الحماية وحطيناها في .env"

  echo
  echo "${BOLD}${YELLOW}باسورد الدخول:${OFF}  ${BOLD}$OWNER_PASSWORD${OFF}"
  echo "احفظه في مكان آمن. تقدر تغيّره من صفحة الإعدادات بعد الدخول."
  echo
else
  ok "ملف .env موجود — ما لمسناه"
fi

# ── 3. قاعدة البيانات ──
DB_URL=$(node -e '
  require("dotenv").config();
  process.stdout.write(process.env.DATABASE_URL || "");
' 2>/dev/null || true)

if [ -z "$DB_URL" ] || echo "$DB_URL" | grep -q "CHANGE_ME"; then
  echo
  warn "لازم تضبط DATABASE_URL في ملف .env قبل ما نكمل."
  warn "الشكل:  postgresql://user:pass@host:5432/ahsmaha?schema=public"
  echo
  warn "لو ما عندك قاعدة بيانات، شغّلها بدوكر:"
  warn "  docker compose up -d db"
  echo
  die "عدّل .env وأعد تشغيل هذا السكربت."
fi
ok "DATABASE_URL مضبوط"

# ── 4. الاعتماديات ──
echo
echo "${BOLD}نثبّت الاعتماديات… (يأخذ دقيقة أو دقيقتين)${OFF}"
npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -3
ok "الاعتماديات جاهزة"

# ── 5. الجداول ──
echo
echo "${BOLD}نجهّز قاعدة البيانات…${OFF}"
npx prisma generate --schema server/prisma/schema.prisma >/dev/null 2>&1 || true
if npm run db:deploy 2>&1 | tail -3; then
  ok "الجداول جاهزة"
else
  die "فشل تجهيز قاعدة البيانات. تأكد أن DATABASE_URL صحيح وأن pgvector مثبت."
fi

# ── 6. الأوزان ──
echo
MODEL_COUNT=$(ls .models/*.gguf 2>/dev/null | wc -l | tr -d ' ')
if [ "$MODEL_COUNT" -gt 0 ]; then
  ok "أوزان المحرك موجودة"
else
  warn "ما فيه أوزان للمحرك بعد."
  echo
  echo "  نزّلها بالأمر (4.4 غيغا — مرة وحدة بس):"
  echo "    ${BOLD}npm run engine:pull -w server${OFF}"
  echo
  echo "  أو نموذج أخف للأجهزة الضعيفة:"
  echo "    npm run engine:pull -w server -- qwen3-4b"
  echo
  echo "  لعرض كل الخيارات:"
  echo "    npm run engine:pull -w server -- --list"
fi

# ── خلصنا ──
PORT=$(node -e 'require("dotenv").config(); process.stdout.write(String(process.env.PORT||4000))')
echo
echo "────────────────────────────"
echo "${GREEN}${BOLD}التثبيت خلص${OFF}"
echo
echo "شغّله بـ:   ${BOLD}npm start${OFF}"
echo "وافتح:      ${BOLD}http://localhost:$PORT${OFF}"
echo
