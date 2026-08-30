# احسمها AI — التثبيت على الاستضافة

## قبل ما تبدأ

الاستضافة لازم تكون **VPS أو سيرفر تقدر تدخله بـ SSH**.
هذا مو موقع ثابت — فيه سيرفر Node وقاعدة بيانات.

**ما ينفع على:** استضافة مشتركة (cPanel)، Netlify، GitHub Pages، Vercel.
**ينفع على:** Hetzner · DigitalOcean · Contabo · Linode · AWS EC2 · أي VPS.

### المتطلبات

| المتطلب | الحد الأدنى |
|---|---|
| نظام | Ubuntu 22.04 أو أحدث (أو أي لينكس) |
| رام | 8 غيغا (16 أفضل) |
| مساحة | 15 غيغا |
| Node.js | 20 أو أحدث |
| PostgreSQL | 14+ مع pgvector |

بدون كرت شاشة يشتغل على المعالج (أبطأ). مع كرت NVIDIA أسرع بعشر مرات.

---

## التثبيت — 5 خطوات

### 1. ارفع الملفات

```bash
scp ahsmaha-ai.zip root@your-server:/srv/
ssh root@your-server
cd /srv && unzip ahsmaha-ai.zip && cd ahsmaha-ai
```

### 2. ثبّت المتطلبات

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# قاعدة البيانات + أدوات الاستوديو
sudo apt-get install -y postgresql postgresql-16-pgvector \
                        ffmpeg chromium-browser fonts-noto-core unzip
```

### 3. جهّز قاعدة البيانات

```bash
sudo -u postgres psql -c "CREATE ROLE ahsmaha LOGIN PASSWORD 'غيّر_هذا';"
sudo -u postgres createdb -O ahsmaha ahsmaha
```

إذا طلع خطأ `permission denied to create extension "vector"`:

```bash
echo 'trusted = true' | sudo tee -a /usr/share/postgresql/16/extension/vector.control
```

### 4. شغّل المثبّت

```bash
bash install.sh
```

بيسألك تعدّل `DATABASE_URL` في ملف `.env`:

```bash
nano .env
# DATABASE_URL=postgresql://ahsmaha:غيّر_هذا@localhost:5432/ahsmaha?schema=public
```

بعدين شغّله مرة ثانية:

```bash
bash install.sh
```

⚠️ **احفظ الباسورد اللي بيطبعه لك** — هذا باسورد دخولك.

### 5. نزّل أوزان المحرك

```bash
npm run engine:pull
```

4.4 غيغا — مرة وحدة بس. للأجهزة الضعيفة:

```bash
npm run engine:pull -- qwen3-4b     # 2.5 غيغا
npm run engine:pull -- --list       # كل الخيارات
```

---

## التشغيل

### تجربة سريعة

```bash
npm start
```

افتح `http://عنوان-سيرفرك:4000`

### خدمة دائمة

```bash
sudo useradd -r -d /srv/ahsmaha-ai -s /bin/false ahsmaha
sudo chown -R ahsmaha:ahsmaha /srv/ahsmaha-ai

sudo cp ahsmaha.service /etc/systemd/system/
sudo nano /etc/systemd/system/ahsmaha.service   # عدّل المسار لو مختلف
sudo systemctl daemon-reload
sudo systemctl enable --now ahsmaha

sudo systemctl status ahsmaha       # الحالة
sudo journalctl -u ahsmaha -f       # السجل الحي
```

### دومين وشهادة HTTPS

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx

sudo cp nginx.conf /etc/nginx/sites-available/ahsmaha
sudo nano /etc/nginx/sites-available/ahsmaha   # غيّر ahsmaha.example.com
sudo ln -s /etc/nginx/sites-available/ahsmaha /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d your-domain.com
```

وبعدها في `.env`:

```bash
APP_URL=https://your-domain.com
TRUST_PROXY=true
```

وأعد التشغيل: `sudo systemctl restart ahsmaha`

---

## أول ما تدخل

1. سجّل دخول بالباسورد اللي طبعه المثبّت.
2. روح **الإعدادات ← تغيير الباسورد** وغيّره لواحد تحفظه.
3. جرّب الشات.

---

## النسخ الاحتياطي

```bash
# قاعدة البيانات
pg_dump -U ahsmaha ahsmaha | gzip > backup-$(date +%F).sql.gz

# الملفات المرفوعة والمخرجات
tar czf storage-$(date +%F).tar.gz storage/
```

⚠️ **احفظ `ENCRYPTION_KEY` من ملف `.env` مع النسخة.**
بدونه ما تقدر تفك تشفير محادثاتك وملفاتك أبدًا.

---

## حل المشاكل

| المشكلة | الحل |
|---|---|
| `ما فيه أوزان محمّلة` | `npm run engine:pull` |
| `permission denied to create extension` | راجع الخطوة 3 |
| `Can't reach database server` | `sudo systemctl start postgresql` وتأكد من `DATABASE_URL` |
| `ما لقينا متصفح للرسم` | `sudo apt-get install chromium-browser` |
| `ما لقينا ffmpeg` | `sudo apt-get install ffmpeg` |
| الردود بطيئة | نموذج أخف: `npm run engine:pull -- qwen3-4b` |
| الردود تنقطع | زوّد `proxy_read_timeout` في nginx |
| نسيت الباسورد | `sudo -u postgres psql -d ahsmaha -c "DELETE FROM owners;"` ثم حط باسورد جديد في `OWNER_PASSWORD` وأعد التشغيل |

---

## التوثيق الكامل

- `README.md` — نظرة عامة على كل الميزات
- `docs/API.md` — الواجهة البرمجية
- `docs/DEPLOY.md` — تفاصيل النشر
