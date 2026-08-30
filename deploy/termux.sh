#!/data/data/com.termux/files/usr/bin/bash
#
# احسمها AI — التثبيت على الجوال مباشرة (Termux)
#
# يشتغل داخل تطبيق Termux على أندرويد. ما يحتاج جهاز ثاني ولا
# استضافة ولا بطاقة بنكية — الجوال نفسه هو السيرفر.
#
# التشغيل:
#   git clone --depth 1 https://github.com/RM70N/RM7.git ~/.ahsmaha-boot
#   bash ~/.ahsmaha-boot/deploy/termux.sh
#
set -euo pipefail

GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; RED=$'\033[0;31m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
ok()   { echo "${GREEN}✓${OFF} $1"; }
warn() { echo "${YELLOW}!${OFF} $1"; }
die()  { echo "${RED}✗${OFF} $1"; exit 1; }
step() { echo; echo "${BOLD}$1${OFF}"; }

PREFIX_BIN="${PREFIX:-/data/data/com.termux/files/usr}"
PGDATA="$PREFIX_BIN/var/lib/postgresql"
APP_DIR="$HOME/ahsmaha"

echo
echo "${BOLD}احسمها AI — تثبيت على الجوال${OFF}"
echo "──────────────────────────────────"

# ── 0. نتأكد أننا داخل Termux ──
[ -d "$PREFIX_BIN" ] || die "هذا السكربت يشتغل داخل تطبيق Termux بس."
ok "Termux موجود"

# ── 1. الحزم ──
step "نثبّت الحزم الأساسية… (أطول خطوة، صبرك علينا)"
# ما نخفي مخرجات apt: لو فشلت حزمة لازم يبان السبب.
pkg update -y || warn "تحديث قوائم الحزم ما ضبط — نكمل ونجرّب"

# نثبّت وحدة وحدة عشان فشل حزمة ما يوقف الباقي، ونعرف وش اللي فشل
install_pkg() {
  echo
  echo "  ── $1 ──"
  pkg install -y "$1" && { ok "$1 جاهزة"; return 0; }
  warn "ما قدرنا نثبّت $1"
  return 1
}

# nodejs و nodejs-lts ما يتعايشون في Termux — لو واحد مثبت نخليه
if command -v node >/dev/null 2>&1; then
  ok "Node موجود مسبقًا: $(node -v)"
else
  install_pkg nodejs-lts || install_pkg nodejs || true
fi

for pkgname in postgresql git ffmpeg; do
  command -v "$pkgname" >/dev/null 2>&1 && continue
  install_pkg "$pkgname" || true
done

# ── نتأكد من الأدوات الأساسية بغض النظر عن نتيجة apt ──
echo
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo
  warn "Node أو npm ناقص. جرّب يدويًا وشوف الخطأ:"
  echo "    pkg install nodejs"
  echo
  warn "لو طلع خطأ dpkg، صلّح حالة الحزم أول:"
  echo "    dpkg --configure -a"
  echo "    apt --fix-broken install"
  echo "    pkg update && pkg upgrade -y"
  die "ما نقدر نكمل بدون Node."
fi
ok "Node $(node -v) — npm $(npm -v)"

command -v pg_ctl >/dev/null 2>&1 \
  || die "PostgreSQL ناقص. جرّب: pkg install postgresql"
ok "PostgreSQL $(pg_ctl --version | awk '{print $3}')"

command -v git >/dev/null 2>&1 || die "git ناقص. جرّب: pkg install git"

if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg موجود — الفيديو والموشن بيشتغلون"
else
  warn "ffmpeg ناقص — كل شي بيشتغل عدا تصدير الفيديو"
fi

# الاستوديو يحتاج متصفح لتشكيل النص العربي، وهذا مو متاح على أندرويد.
warn "الاستوديو البصري (صور/فيديو) ما بيشتغل على الجوال —"
warn "  يحتاج متصفح Chromium وهذا ما يتثبّت في Termux."
warn "  كل شي ثاني بيشتغل عادي."

# ── 2. قاعدة البيانات ──
step "نجهّز قاعدة البيانات…"
if [ ! -d "$PGDATA" ]; then
  initdb "$PGDATA" || die "ما قدرنا ننشئ قاعدة البيانات — الخطأ فوق."
  ok "أنشأنا قاعدة البيانات"
else
  ok "قاعدة البيانات موجودة"
fi

pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" start >/dev/null 2>&1 || true
sleep 3
pg_isready >/dev/null 2>&1 || die "ما قدرنا نشغّل PostgreSQL. شوف $PGDATA/server.log"
ok "PostgreSQL شغّال"

# على Termux ما فيه مستخدم postgres منفصل — نشتغل بمستخدم الجهاز
DB_USER="$(whoami)"
createdb ahsmaha 2>/dev/null && ok "أنشأنا قاعدة ahsmaha" || ok "قاعدة ahsmaha موجودة"

# pgvector مو متاح على Termux. احسمها يكتشف غيابه ويشتغل بالبحث
# بالكلمات المفتاحية بدل البحث الدلالي — الملفات والمهارات تظل تشتغل.
warn "pgvector مو متاح على أندرويد — الاسترجاع بيعتمد على الكلمات المفتاحية."

# ── 3. الكود ──
step "نجيب احسمها…"

REPO="${AHSMAHA_REPO:-https://github.com/RM70N/RM7.git}"
# نحدّد الفرع صراحةً عشان الاستنساخ ما يعتمد على الفرع الافتراضي.
BRANCH="${AHSMAHA_BRANCH:-main}"

# مجلد موجود من محاولة سابقة فاشلة (مو مستودع git) يخلي الاستنساخ
# يفشل. ننحّيه جنبًا بدل ما نحذفه — لو فيه شي للمستخدم يظل موجودًا.
if [ -d "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ]; then
  BACKUP="$APP_DIR.old.$(date +%s)"
  mv "$APP_DIR" "$BACKUP"
  warn "لقينا مجلدًا قديمًا — نقلناه لـ $BACKUP"
fi

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH" \
    || die "ما قدرنا نحدّث الكود. تأكد من الإنترنت."
  git -C "$APP_DIR" checkout -B "$BRANCH" FETCH_HEAD >/dev/null 2>&1 \
    || die "ما قدرنا نبدّل للفرع $BRANCH"
  ok "حدّثنا النسخة الموجودة"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR" \
    || die "ما قدرنا نجيب الكود. تأكد من الإنترنت ومن اسم الفرع."
  ok "جبنا الكود"
fi
cd "$APP_DIR"

# نتأكد أن الملفات وصلت فعلًا — الفرع الفاضي يعطي مجلدًا بلا شي
[ -f package.json ] || die "الكود ناقص — ما فيه package.json. جرّب: rm -rf $APP_DIR ثم أعد التشغيل."
ok "الملفات كاملة"

# ── 4. الإعدادات ──
step "نضبط الإعدادات…"
if [ ! -f .env ]; then
  cp .env.example .env

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
    const [session, encryption, password, dbUser] = process.argv.slice(1);
    let env = fs.readFileSync(".env", "utf8");
    const set = (key, value) =>
      (env = env.replace(new RegExp("^" + key + "=.*$", "m"), key + "=" + value));
    set("SESSION_SECRET", session);
    set("ENCRYPTION_KEY", encryption);
    set("OWNER_PASSWORD", password);
    set("NODE_ENV", "production");
    set("PORT", "4000");
    set("DATABASE_URL", `postgresql://${dbUser}@localhost:5432/ahsmaha?schema=public`);
    fs.writeFileSync(".env", env);
  ' "$SESSION_SECRET" "$ENCRYPTION_KEY" "$OWNER_PASSWORD" "$DB_USER"

  ok "ولّدنا مفاتيح الحماية"
  echo "$OWNER_PASSWORD" > "$HOME/ahsmaha-password.txt"
  chmod 600 "$HOME/ahsmaha-password.txt"

  echo
  echo "${BOLD}${YELLOW}باسورد الدخول:${OFF}  ${BOLD}$OWNER_PASSWORD${OFF}"
  echo "محفوظ كمان في: ~/ahsmaha-password.txt"
  echo
else
  ok "ملف .env موجود — ما لمسناه"
fi

# ── 5. الاعتماديات ──
step "نثبّت الاعتماديات… (يأخذ من ٥ لـ ١٥ دقيقة على الجوال)"
npm install --no-audit --no-fund 2>&1 | tail -3
ok "الاعتماديات جاهزة"

# ── 6. الجداول ──
step "نجهّز الجداول…"
npx prisma generate --schema server/prisma/schema.prisma >/dev/null 2>&1 || true
npm run db:deploy 2>&1 | tail -3
ok "الجداول جاهزة"

# ── 7. الواجهة ──
step "نبني الواجهة…"
npm run build 2>&1 | tail -3
ok "الواجهة جاهزة"

# ── 8. الأوزان ──
step "أوزان المحرك"
MODEL_COUNT=$(ls .models/*.gguf 2>/dev/null | wc -l | tr -d ' ')
if [ "$MODEL_COUNT" -gt 0 ]; then
  ok "الأوزان موجودة"
else
  RAM_GB=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 4)
  echo "  رام الجهاز: ${RAM_GB} غيغا"
  if [ "$RAM_GB" -ge 8 ]; then
    SUGGEST="allam-7b"; SIZE="٤٫٤ غيغا"
  elif [ "$RAM_GB" -ge 6 ]; then
    SUGGEST="qwen3-4b";  SIZE="٢٫٥ غيغا"
  else
    SUGGEST="qwen3-1.7b"; SIZE="١٫١ غيغا"
  fi
  echo
  echo "  نزّل الأوزان (مرة وحدة بس — $SIZE):"
  echo "    ${BOLD}cd ~/ahsmaha && npm run engine:pull -w server -- $SUGGEST${OFF}"
  echo
  echo "  لعرض كل الخيارات:"
  echo "    npm run engine:pull -w server -- --list"
fi

# ── 9. أوامر التشغيل ──
cat > "$HOME/ahsmaha-start.sh" <<'START'
#!/data/data/com.termux/files/usr/bin/bash
# تشغيل احسمها AI
PGDATA="$PREFIX/var/lib/postgresql"
pg_isready >/dev/null 2>&1 || pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" start
sleep 2
cd "$HOME/ahsmaha" && npm start
START
chmod +x "$HOME/ahsmaha-start.sh"

# مجلد الإقلاع اللي جبنا منه هذا السكربت ما عاد له لزوم
rm -rf "$HOME/.ahsmaha-boot"

step "خلصنا"
echo "  شغّل احسمها:   ${BOLD}bash ~/ahsmaha-start.sh${OFF}"
echo "  افتحه بالمتصفح: ${BOLD}http://localhost:4000${OFF}"
echo "  أو حط نفس العنوان في تطبيق احسمها AI"
echo
echo "  ${YELLOW}مهم:${OFF} خلّ Termux شغّال في الخلفية —"
echo "  اسحب شريط الإشعارات واضغط ${BOLD}Acquire wakelock${OFF}"
echo
