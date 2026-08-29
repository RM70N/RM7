# النشر والتشغيل

## المتطلبات

| المتطلب | الحد الأدنى | الموصى به |
|---|---|---|
| Node.js | 20.11 | 22 |
| PostgreSQL | 14 + pgvector | 16 + pgvector |
| رام | 8 غيغا | 16 غيغا |
| مساحة | 15 غيغا | 40 غيغا |
| كرت شاشة | غير مطلوب | NVIDIA أو Apple Silicon |

بدون كرت شاشة المحرك يشتغل على المعالج بسرعة 3-8 رمز/ثانية. مع كرت شاشة
تصير 30-80 رمز/ثانية.

## التشغيل خطوة بخطوة

```bash
# 1) قاعدة البيانات
docker compose up -d db

# 2) الاعتماديات
npm install

# 3) الإعدادات
cp .env.example .env
npm run gen:secrets -w server      # الصق الناتج في .env

# 4) الجداول
npm run db:generate
npm run db:deploy

# 5) أوزان المحرك (مرة وحدة)
npm run engine:pull -w server

# 6) أدوات الاستوديو البصري (اختياري)
sudo apt-get install -y ffmpeg chromium-browser fonts-noto-core

# 7) شغّل
npm run dev
```

- الواجهة: <http://localhost:5173>
- السيرفر: <http://localhost:4000>

## الإنتاج

```bash
npm run build
NODE_ENV=production npm start
```

قدّم مجلد `web/dist` من nginx أو أي خادم ثابت، ومرّر `/api` للسيرفر:

```nginx
server {
  listen 443 ssl http2;
  server_name ahsmaha.example.com;

  # ملفات الواجهة
  root /srv/ahsmaha/web/dist;
  index index.html;
  location / { try_files $uri /index.html; }

  # السيرفر
  location /api {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # الستريمنق لازم بدون تخزين مؤقت
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 600s;
  }
}
```

مع nginx، حط في `.env`:

```bash
NODE_ENV=production
TRUST_PROXY=true
APP_URL=https://ahsmaha.example.com
```

## النسخ الاحتياطي

كل شي مهم في مكانين:

```bash
# قاعدة البيانات
pg_dump -U ahsmaha ahsmaha | gzip > ahsmaha-$(date +%F).sql.gz

# الملفات المرفوعة والمخرجات
tar czf storage-$(date +%F).tar.gz storage/
```

⚠️ **مهم:** احفظ `ENCRYPTION_KEY` مع النسخة الاحتياطية. بدونه ما تقدر تفك
تشفير المحادثات والملفات أبدًا.

## خدمة systemd

```ini
[Unit]
Description=Ahsmaha AI
After=network.target postgresql.service

[Service]
Type=simple
User=ahsmaha
WorkingDirectory=/srv/ahsmaha
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## حل المشاكل

| المشكلة | الحل |
|---|---|
| `permission denied to create extension "vector"` | أضف `trusted = true` لـ `/usr/share/postgresql/16/extension/vector.control` |
| `ما فيه أوزان محمّلة` | `npm run engine:pull -w server` |
| `ما لقينا متصفح للرسم` | ثبّت كروميوم أو حط `CHROMIUM_PATH` |
| `ما لقينا ffmpeg` | `sudo apt-get install ffmpeg` |
| المحرك بطيء | نزّل نموذجًا أخف: `npm run engine:pull -w server -- qwen3-4b` |
| الردود تنقطع | زوّد `proxy_read_timeout` في nginx |
| البحث ما يشتغل | تأكد أن السيرفر يوصل للإنترنت، أو اضبط `SEARXNG_URL` |

## الأمان

- غيّر الباسورد من صفحة الإعدادات أول ما تدخل.
- شغّل خلف HTTPS دائمًا في الإنتاج.
- `ENCRYPTION_KEY` و`SESSION_SECRET` ما ينشاركون أبدًا ولا يدخلون Git.
- المفاتيح الملغية تتوقف فورًا، بدون إعادة تشغيل.
