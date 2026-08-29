#!/usr/bin/env bash
#
# ══════════════════════════════════════════════════════════════
#  احسمها AI — تثبيت تلقائي كامل
#
#  الصق هذا النص في خانة "Initialization script" (أو "User data"
#  أو "Cloud-init") وقت إنشاء السيرفر، وبس. ما يحتاج أي أمر منك.
#
#  السيرفر بيسوي كل شي بنفسه: يثبت المتطلبات، يبني المشروع،
#  ينزّل أوزان المحرك، ويشغّل الموقع على المنفذ 80.
#
#  بعد 20-30 دقيقة افتح عنوان السيرفر في المتصفح، وحدد باسوردك.
# ══════════════════════════════════════════════════════════════

set -uo pipefail
exec > >(tee -a /var/log/ahsmaha-install.log) 2>&1

echo "═══ بدأ تثبيت احسمها AI — $(date) ═══"

APP_DIR=/srv/ahsmaha
APP_USER=ahsmaha
REPO=https://github.com/RM70N/RM7.git
BRANCH=claude/ahsmaha-ai-system-klji7f

# النموذج: allam-7b (سعودي، 4.4 غيغا) — أو qwen3-4b للأجهزة الأضعف
MODEL=allam-7b

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# ── 1. المتطلبات ──
echo "── نثبّت المتطلبات ──"
apt-get update -y
apt-get install -y curl ca-certificates gnupg git unzip build-essential \
                   postgresql postgresql-contrib \
                   ffmpeg chromium-browser fonts-noto-core fonts-kacst \
  || apt-get install -y curl ca-certificates gnupg git unzip build-essential \
                        postgresql postgresql-contrib ffmpeg chromium fonts-noto-core

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
echo "Node $(node -v)"

# pgvector — نجرب الحزمة، وإلا نبنيها من المصدر
PG_VERSION=$(ls /usr/lib/postgresql/ | sort -V | tail -1)
if ! apt-get install -y "postgresql-${PG_VERSION}-pgvector"; then
  echo "── نبني pgvector من المصدر ──"
  apt-get install -y "postgresql-server-dev-${PG_VERSION}"
  git clone --branch v0.8.0 --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector
  make -C /tmp/pgvector
  make -C /tmp/pgvector install
  rm -rf /tmp/pgvector
fi

# pgvector لازم يكون trusted عشان مستخدم عادي يقدر يفعّله
VECTOR_CONTROL="/usr/share/postgresql/${PG_VERSION}/extension/vector.control"
if [ -f "$VECTOR_CONTROL" ] && ! grep -q '^trusted' "$VECTOR_CONTROL"; then
  echo 'trusted = true' >> "$VECTOR_CONTROL"
fi

systemctl enable --now postgresql
sleep 5

# ── 2. قاعدة البيانات ──
echo "── نجهّز قاعدة البيانات ──"
DB_PASS=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)

sudo -u postgres psql <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='ahsmaha') THEN
    CREATE ROLE ahsmaha LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ahsmaha PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ahsmaha'" | grep -q 1 \
  || sudo -u postgres createdb -O ahsmaha ahsmaha

# ── 3. المشروع ──
echo "── ننزّل المشروع ──"
id -u "$APP_USER" >/dev/null 2>&1 || useradd -r -m -d "$APP_DIR" -s /bin/bash "$APP_USER"
rm -rf "$APP_DIR"/{server,web,docs,package.json,package-lock.json}
git clone --branch "$BRANCH" --depth 1 "$REPO" /tmp/ahsmaha-src
mkdir -p "$APP_DIR"
cp -r /tmp/ahsmaha-src/. "$APP_DIR"/
rm -rf /tmp/ahsmaha-src "$APP_DIR/.git"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 4. الإعدادات ──
echo "── نولّد مفاتيح الحماية ──"
SESSION_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | head -c 64)
ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '\n')
CHROME_BIN=$(command -v chromium-browser || command -v chromium || echo "")

cat > "$APP_DIR/.env" <<ENVFILE
NODE_ENV=production
PORT=4000
APP_URL=http://localhost
TRUST_PROXY=true

DATABASE_URL=postgresql://ahsmaha:${DB_PASS}@localhost:5432/ahsmaha?schema=public

# فاضي عمدًا — تحدد باسوردك من المتصفح أول مرة تفتح الموقع
OWNER_PASSWORD=

SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

ENGINE_MODELS_DIR=./.models
ENGINE_MODEL_PATH=
ENGINE_CONTEXT_SIZE=8192
ENGINE_MAX_TOKENS=2048
ENGINE_TEMPERATURE=0.7
ENGINE_THREADS=0

CHROMIUM_PATH=${CHROME_BIN}
FFMPEG_PATH=ffmpeg

SEARXNG_URL=
AUTO_SEARCH=true
AUTO_MEMORY=true
AUTO_MEMORY_MIN_CHARS=15

STORAGE_DIR=./storage
MAX_UPLOAD_MB=100
EMBEDDING_MODEL=Xenova/multilingual-e5-small
EMBEDDING_DIM=384
ENVFILE

chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"

# ── 5. البناء ──
echo "── نبني المشروع (يأخذ شوي) ──"
cd "$APP_DIR"
sudo -u "$APP_USER" npm install --no-audit --no-fund
sudo -u "$APP_USER" npx prisma generate --schema server/prisma/schema.prisma
sudo -u "$APP_USER" npx tsc -p server/tsconfig.json
sudo -u "$APP_USER" bash -c "cd web && npx vite build"
sudo -u "$APP_USER" npx prisma migrate deploy --schema server/prisma/schema.prisma

# ── 6. الخدمة ──
echo "── نركّب الخدمة ──"
cat > /etc/systemd/system/ahsmaha.service <<SERVICE
[Unit]
Description=Ahsmaha AI
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
TimeoutStopSec=60

NoNewPrivileges=true
PrivateTmp=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=ahsmaha

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now ahsmaha

# ── 7. المنفذ 80 ──
echo "── نفتح المنفذ 80 ──"
apt-get install -y nginx
cat > /etc/nginx/sites-available/default <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    client_max_body_size 120M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
}
NGINX
nginx -t && systemctl restart nginx

# جدار الحماية — بعض المزودين يقفل كل شي افتراضيًا
if command -v iptables >/dev/null; then
  iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  command -v netfilter-persistent >/dev/null && netfilter-persistent save 2>/dev/null || true
fi
command -v ufw >/dev/null && { ufw allow 80/tcp; ufw allow 443/tcp; } 2>/dev/null || true

# ── 8. أوزان المحرك ──
echo "── ننزّل أوزان المحرك (${MODEL}) — هذي أطول خطوة ──"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && node server/dist/scripts/pull-model.js ${MODEL}" \
  || echo "!! فشل تنزيل الأوزان — نزّلها لاحقًا بـ: npm run engine:pull"

systemctl restart ahsmaha

# ── خلصنا ──
IP=$(curl -s --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
cat > /root/AHSMAHA-READY.txt <<DONE
احسمها AI جاهز

افتح في المتصفح:  http://${IP}

أول ما تفتحه بيطلب منك تحدد باسورد الدخول.

أوامر مفيدة:
  systemctl status ahsmaha      حالة الخدمة
  journalctl -u ahsmaha -f      السجل الحي
  systemctl restart ahsmaha     إعادة تشغيل

سجل التثبيت:  /var/log/ahsmaha-install.log
DONE

echo
echo "═══════════════════════════════════════"
echo "  احسمها AI جاهز"
echo "  افتح:  http://${IP}"
echo "═══════════════════════════════════════"
echo "انتهى — $(date)"
