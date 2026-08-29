# احسمها AI

مساعد ذكاء اصطناعي شخصي وخاص — حساب واحد فقط، بدون تسجيل حسابات جديدة، وبدون فهرسة من محركات البحث.

## التقنيات

| الطبقة | التقنية |
|---|---|
| الواجهة | React 18 + Vite + TypeScript + Tailwind CSS (RTL + دارك مود) |
| السيرفر | Node.js + Express + TypeScript |
| قاعدة البيانات | PostgreSQL 16 + pgvector (عبر Prisma) |
| محرك المحادثة | Claude API — مخفي خلف واجهة احسمها AI الخاصة |
| الحماية | Argon2id + جلسات JWT بكوكي HttpOnly + AES-256-GCM |

كل شيء عدا محرك المحادثة يشتغل داخل السيرفر بدون أي مزود خارجي.

## التشغيل السريع

```bash
# 1) قاعدة البيانات
docker compose up -d db

# 2) الإعدادات
cp .env.example .env
npm install
npm run gen:secrets -w server   # الصق الناتج في .env

# 3) الجداول
npm run db:generate
npm run db:deploy

# 4) التشغيل
npm run dev
```

- الواجهة: <http://localhost:5173>
- السيرفر: <http://localhost:4000>

أول تشغيل يأخذ `OWNER_PASSWORD` من `.env`، يحفظه مشفّرًا في قاعدة البيانات، وما يعيد إنشاءه أبدًا. بعد ذلك تقدر تغيّر الباسورد من صفحة الإعدادات.

### تشغيل بدون Docker

لو PostgreSQL مثبّت محليًا:

```bash
sudo -u postgres psql -c "CREATE ROLE ahsmaha LOGIN PASSWORD 'كلمة_سر' CREATEDB;"
sudo -u postgres createdb -O ahsmaha ahsmaha
sudo apt-get install -y postgresql-16-pgvector
```

إذا طلع خطأ `permission denied to create extension "vector"`، أضف `trusted = true` لملف
`/usr/share/postgresql/16/extension/vector.control` (الإصدارات 0.7.0+ من pgvector تجيها جاهزة).

## بنية المشروع

```
├─ server/            السيرفر
│  ├─ prisma/         مخطط قاعدة البيانات والترحيلات
│  └─ src/
│     ├─ routes/      مسارات الـ API
│     ├─ services/    منطق الأعمال
│     ├─ middleware/  الحماية والمصادقة والأخطاء
│     ├─ lib/         الإعدادات، التشفير، التخزين، السجل
│     └─ db/          عميل Prisma
├─ web/               الواجهة
│  └─ src/
│     ├─ pages/       الصفحات
│     ├─ components/  المكوّنات
│     └─ lib/         الاتصال بالـ API والثيم والمصادقة
├─ storage/           الملفات المرفوعة والمخرجات (خارج Git)
└─ docs/              التوثيق
```

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل السيرفر والواجهة معًا |
| `npm run build` | بناء الاثنين للإنتاج |
| `npm run typecheck` | فحص الأنواع |
| `npm run db:migrate` | إنشاء ترحيل جديد |
| `npm run db:deploy` | تطبيق الترحيلات |
| `npm run gen:secrets -w server` | توليد مفاتيح حماية جديدة |

## الخصوصية

- `robots.txt` يمنع الزحف بالكامل، وترويسة `X-Robots-Tag` على كل استجابة.
- كل المحادثات والملفات تُخزَّن مشفّرة بـ AES-256-GCM.
- الباسورد يُخزَّن كهاش Argon2id فقط.
- قفل تلقائي للحساب 15 دقيقة بعد 5 محاولات دخول خاطئة، مع حد للطلبات.

## حالة المراحل

- [x] **1** — الأساس: هيكلة، قاعدة بيانات، تسجيل دخول، منع فهرسة، واجهة (دارك مود + RTL + سايدبار)
- [ ] **2** — الشات ومحرك احسمها AI
- [ ] **3** — الذاكرة الدائمة
- [ ] **4** — المهارات وقاعدة المعرفة + RAG
- [ ] **5** — رفع المواقع الكاملة والعمل عليها
- [ ] **6** — البحث الحي
- [ ] **7** — الاستوديو البصري
- [ ] **8** — التشديد الأمني والتسليم
