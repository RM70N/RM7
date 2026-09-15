# لخّصلي (Lakhasli)

منصة ويب تعليمية: الطالب يرفع محاضرة (صوت / فيديو / PDF / صورة سبورة) وتتحوّل تلقائيًا
إلى ملخص مصنّف بـ"نقطة الثقة"، خريطة ذهنية تفاعلية، أسئلة اختبار سريعة، وبطاقات مراجعة.

هذا مشروع **مستقل تمامًا** داخل هذا المستودع (لا علاقة له بمشروع "احسمها AI" بمجلد
`server/` و`web/` بجذر المستودع) — كل شيء خاص بلخّصلي داخل مجلد `lakhasli/` فقط.

## قرار تقني مهم: بدون Firebase Storage

بناءً على طلب صريح، **لا يُستخدم Firebase Storage نهائيًا**. الملفات المرفوعة
(صوت/فيديو/PDF/صورة) **لا تُخزَّن بشكل دائم على الإطلاق**:

1. الطالب يرفع الملف مباشرة لسيرفر الباك إند (Express على Railway) عبر `multipart/form-data`.
2. يُحفظ مؤقتًا على قرص السيرفر (`/tmp`) أثناء المعالجة فقط.
3. يُعالَج فورًا: تفريغ صوتي (Whisper) أو استخراج نص (PDF/صورة عبر Claude Vision).
4. يُحذف الملف المؤقت فورًا بعد انتهاء المعالجة (نجحت أو فشلت — `finally` block).
5. **فقط النتائج النصية** (Transcript، الملخص، الخريطة الذهنية، الأسئلة، البطاقات) تُخزَّن
   بشكل دائم في **Firestore**. غرف السباق الحية تستخدم **Realtime Database**.

هذا يعني حد حجم ملف الصوت الفعلي محكوم بحد Whisper API نفسه (25 م.ب) — الفيديو يُستخرج
صوته محليًا عبر ffmpeg قبل الحذف فلا مشكلة بحجمه (حتى 200 م.ب).

## البنية

```
lakhasli/
├─ backend/                  سيرفر Node.js + Express (Railway)
│  └─ src/
│     ├─ config/             Firebase Admin + متغيرات البيئة
│     ├─ middleware/         مصادقة، رفع ملفات، معالجة أخطاء
│     ├─ routes/             /api/lectures, /courses, /users, /race-rooms, /study-sessions
│     ├─ services/           Whisper، Claude (تحليل + رؤية)، خط الأنابيب، السلسلة، المقارنة
│     └─ index.js
├─ frontend/                 HTML/CSS/JS عادي (Netlify)
│  ├─ css/style.css          تصميم RTL + خط Tajawal + دارك مود
│  ├─ js/                    firebase-config, auth, api, nav, gamification, ui
│  └─ *.html                 كل صفحات المنصة (11 صفحة)
├─ firestore.rules
└─ database.rules.json       (Realtime Database — غرف السباق)
```

## الإعداد

### 0. مشروع Firebase المستخدم حاليًا

الواجهة (`frontend/js/firebase-config.js`) معبّأة مسبقًا بإعدادات مشروع Firebase
الحقيقي **lakshle** (apiKey, authDomain, projectId, messagingSenderId, appId).
باقٍ عليك بالكونسول (<https://console.firebase.google.com/project/lakshle>):

1. **Authentication → Sign-in method** → فعّل: البريد/كلمة المرور + Google.
2. **Firestore Database** → أنشئه (وضع الإنتاج) → بعدين بتبويب *Rules* الصق محتوى
   `lakhasli/firestore.rules` وانشره.
3. **Realtime Database** → أنشئه (وضع الإنتاج، اختر أي موقع) → بتبويب *Rules* الصق
   محتوى `lakhasli/database.rules.json` وانشره. **بعد الإنشاء انسخ رابط القاعدة
   الفعلي** (يظهر أعلى صفحة Realtime Database) وحدّثه بـ:
   - `frontend/js/firebase-config.js` → `databaseURL`
   - `backend/.env` → `FIREBASE_DATABASE_URL`
   (القيمة الحالية `https://lakshle-default-rtdb.firebaseio.com` تفترض موقع
   us-central1 — إذا اخترت موقعًا ثانيًا الرابط يكون بصيغة مختلفة تمامًا).
4. **لا تفعّل Storage** — غير مستخدم بهذا المشروع أساسًا (حتى لو ظهر لك رابط
   `lakshle.firebasestorage.app` بإعدادات الويب، تم تجاهله عمدًا بالكود).
5. **Project settings → Service accounts → Generate new private key** → يحمّل
   ملف JSON فيه `client_email` و`private_key`، هذولا يحتاجهم الباك إند فقط
   (الواجهة لا تحتاج ولا تشوف هذا الملف إطلاقًا).

### 1. الباك إند

```bash
cd lakhasli/backend
cp .env.example .env
# .env.example معبّى مسبقًا بـ FIREBASE_PROJECT_ID و FIREBASE_DATABASE_URL
# لمشروع lakshle — لسا لازم تعبّي يدويًا:
#   FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY  (من ملف JSON بالخطوة 0.5)
#   OPENAI_API_KEY, ANTHROPIC_API_KEY
npm install
npm run dev
```

السيرفر يشتغل على `http://localhost:4100` (أو المنفذ اللي بـ`.env`).

### 2. الواجهة

جاهزة بإعدادات Firebase مسبقًا. شغّلها بأي سيرفر ملفات ثابتة:

```bash
cd lakhasli/frontend
npx serve .
# أو: python3 -m http.server 5500
```

إذا كان عنوان الباك إند غير `http://localhost:4100`، حط قبل تحميل أي سكربت بصفحاتك:
```html
<script>window.LAKHASLI_API_URL = 'https://your-backend.up.railway.app';</script>
```
(أو عدّل `API_BASE_URL` مباشرة بـ`js/firebase-config.js`.)

### 3. النشر

- **الواجهة (Netlify):** اسحب مجلد `frontend/` كموقع ثابت، أو اربطه بـGit.
- **الباك إند (Railway):** انشر مجلد `backend/`، وتأكد إن ffmpeg متوفر (حزمة
  `ffmpeg-static` تنزّل ثنائي ffmpeg تلقائيًا أثناء `npm install`، ما يحتاج تثبيت نظام).
- بعد النشر، حدّث `FRONTEND_URL` بإعدادات الباك إند (لـCORS)، وحدّث عنوان الباك إند
  بالواجهة.

## نطاق التنفيذ الحالي

تم تنفيذ الترتيب المقترح بالمواصفات (MVP أولًا):

| الميزة | الحالة |
|---|---|
| رفع (صوت/فيديو/PDF/صورة) → تفريغ → تحليل ذكي | ✅ كامل، غير متزامن (رد فوري 202 + متابعة حالة عبر `onSnapshot`) |
| نقطة الثقة (quoted/inferred) + الفجوة الصوتية | ✅ |
| الخريطة الذهنية + التوسّع الحي ("وضّح أكثر"/"مثال") | ✅ |
| بطاقات المراجعة + أسئلة الاختبار | ✅ |
| معركة الأسئلة 60 ثانية + سلسلة المذاكرة (streak) + نقاط | ✅ |
| بصمة الأستاذ (عبارات متكررة تُعطى وزنًا بالتحليلات القادمة) | ✅ |
| مقارنة محاضرتين لنفس المقرر (تكرار/تناقض) | ✅ من صفحة المقرر مباشرة (بعد رفع محاضرتين منتهيتين على الأقل) |
| غرفة السباق الحية (Realtime Database) | ✅ إنشاء/انضمام برمز/بدء/لوحة نتائج حية |
| متجر التركيز (نقاط ← ثيمات/إطارات) | ✅ |
| لحظة الفخر الأسبوعية | ⚠️ مبسّطة: بطاقة إحصائيات عند فتح الملف الشخصي (بدون مهمة مجدولة أو تصدير صورة/فيديو) |
| الشخصية الذكية (المرشد) | ✅ رسائل ثابتة محليًا (بدون استدعاء AI حي) |
| صوت يناسب مزاجك / التوليد الصوتي للقراءة | ❌ لم يُنفَّذ (يحتاج ملفات صوتية/تكامل TTS إضافي) |
| القصة المصورة (بطاقات SVG) | ❌ لم يُنفَّذ |

## قيود معروفة

- **حد Whisper:** 25 م.ب لملف الصوت النهائي. الفيديو يُضغط لصوت MP3 بمعدل بت منخفض
  تلقائيًا فما يواجه هذا الحد عادة، لكن فيديو طويل جدًا قد يتجاوزه — التوسعة المستقبلية:
  تقطيع الصوت لأجزاء ومعالجتها بالتوازي.
- **PDF ممسوح ضوئيًا (صور بدون نص):** يرجع خطأ عربي واضح يقترح رفعه كصورة بدل ذلك.
- **أسئلة غرفة السباق مقروءة بقاعدة Realtime Database لأي مشارك ينضم لها** (تشمل
  `correctAnswerIndex`) — مقبول لتطبيق مذاكرة ودّي، غير مناسب لاختبار رسمي عالي المخاطر.
- **السلسلة (streak) تُحسب عند كل جلسة مذاكرة جديدة** (بدل مهمة Cloud Function مجدولة
  يوميًا، لأن الباك إند هنا Express عادي وليس Firebase Functions) — تُصفَّر تلقائيًا لو
  فات يوم كامل، لكن فقط عند تسجيل الجلسة التالية.
- استعلام `weekly-summary` (`studySessions` بـ`userId ==` و`date >=`) يحتاج Firestore
  Composite Index — أول مرة تشغّله محليًا، Firestore يعطيك رابط بالخطأ لإنشائه تلقائيًا
  من الكونسول.

## اختبار سريع محليًا بدون مفاتيح API حقيقية

السيرفر يشتغل ويرد على `/health` حتى بدون إعداد `.env` كامل، لكن أي مسار يحتاج
Firebase/Whisper/Claude سيرجع خطأ عربي واضح (500) بدل ما يعلّق أو يتعطل السيرفر —
هذا مقصود حسب متطلب "معالجة الأخطاء" بالمواصفات.
