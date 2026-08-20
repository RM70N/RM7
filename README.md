# ادمن احسمها (Admin Ehsmaha)

لوحة تحكم إدارية مستقلة للمالك، منفصلة في الاستضافة والدومين عن ehsmaha.com،
لكنها مرتبطة **بنفس قاعدة بيانات Firebase** (`streamgame-180b8`). أي تغيير من اللوحة
ينعكس فوراً على الموقع الأساسي والعكس (بيانات حية Real-time).

الموقع بالكامل عربي/RTL، بهوية بنفسجية-ذهبية مطابقة لـ ehsmaha، وبدون إيموجيز
(أيقونات SVG فقط).

---

## التشغيل محلياً

الموقع static (HTML/CSS/JS + Firebase عبر CDN modules) — لا حاجة لبناء:

```bash
python3 -m http.server 8080     # ثم افتح http://localhost:8080
```

> يجب تقديمه عبر `http://` أو `https://` (وليس فتح الملف مباشرة) لأن ES Modules
> تحتاج origin. لأول دخول، أضف الدومين/localhost في
> Firebase Console → Authentication → Settings → Authorized domains.

## النشر

أي استضافة static (Firebase Hosting، Netlify، Vercel، Cloudflare Pages...).
مثال Firebase Hosting:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules   # مهم — انظر الأمان أدناه
```

---

## الحساب والدخول

- **حساب واحد فقط** (المالك) — لا تسجيل حسابات جديدة ولا "نسيت كلمة المرور".
- الهوية مثبّتة في `js/firebase.js`: البريد `malshaifan1@gmail.com` / اليوزر `MZX`
  (مطابقة لـ ehsmaha). أي حساب آخر يُرفض ويُسجَّل خروجه.
- **مصادقة ثنائية 2FA (TOTP)** إجبارية: أول دخول يعرض QR + مفتاحاً لتطبيق
  Authenticator، ثم يُطلب الرمز في كل دخول. المفتاح يُحفظ في `adminPanel/security`.
- قفل مؤقت بعد 5 محاولات فاشلة (على مستوى الجهاز) + سجل أمني.
- انتهاء الجلسة بالخمول (20 دقيقة) + صفحة "الأجهزة المسجّلة" مع إنهاء عن بُعد.

---

## الأمان — اقرأ هذا

اخترتَ نمط **العميل المباشر** (المتصفح يخاطب Firestore مباشرة). في هذا النمط:

- شاشة الدخول و2FA تحميان **الواجهة فقط**.
- الحماية الفعلية للبيانات تأتي **حصراً من `firestore.rules`**.
- **يجب نشر `firestore.rules`** وإلا تبقى صلاحيات الحذف/الحظر/التعديل مكشوفة لأي
  شخص يملك إعداد الويب العام.
- الملف `firestore.rules` **يُدمج** مع قواعدك الحالية في ehsmaha ولا يستبدلها —
  راجِع كل مجموعة قبل النشر حتى لا يتعطّل الموقع الأساسي.
- لأمان أقوى مستقبلاً يُنصح بنقل عمليات الحذف/الحظر إلى Cloud Functions (Admin SDK)
  مع تحقق صلاحية على السيرفر.

---

## ما الذي يكتب فعلياً على قاعدة بيانات ehsmaha

| الإجراء | المجموعة/الحقل الحقيقي |
|---|---|
| رسالة للاعب / رد على دعم | `personalMessages/{usernameLower}` (يعرضها ehsmaha) |
| طرد من الجلسة | حذف `rooms/{id}/members/{uid}` + `users/{uid}.currentRoomId` + `kickCount` |
| حظر / فك حظر | `users/{uid}` → `{banned, banUntil, banReason}` |
| حذف حساب | حذف `users/{uid}` + `usernames/{lower}` + `presence/{uid}` |
| تعديل/تجميد نقاط | `users/{uid}` → `{onlinePoints, pointsFrozen}` |
| تعطيل ستريمر | `streamerDisabled/{lower}` |
| أوفرلاي ستريمر | `moderatorSettings/{lower}` |
| صيانة لعبة | `gameMaintenance/{tag}` |
| نقاط لعبة | `gameSettings/{tag}` |
| رد دعم | `feedback/{id}` → `{reply, status}` |

### حقول جديدة يحتاج ehsmaha قراءتها لفرض القرار

بعض القرارات لا يُفعّلها ehsmaha تلقائياً لأنها حقول جديدة أضافتها اللوحة. لتفعيلها
على الموقع الأساسي، اجعل ehsmaha يتحقق منها:

- **الحظر**: تحقّق من `users/{uid}.banned` / `banUntil` عند الدخول/اللعب (أو امنعه بقواعد Firestore).
- **تعطيل ستريمر**: تحقّق من `streamerDisabled/{lower}` قبل السماح ببثّه.
- **صيانة لعبة**: تحقّق من `gameMaintenance/{tag}.disabled` قبل فتح اللعبة.
- **نقاط لعبة**: اقرأ `gameSettings/{tag}` بدل القيم الثابتة في الكود.

### تتبّع نقرات "احسمها" (ميزة جديدة)

غير موجود في ehsmaha بعد. أضف `tracking-snippet.html` في الموقع الأساسي عند رابط
"احسمها" (السمة `data-ahsemha-link`). يسجّل كل نقرة في `ahsemhaLinkClicks` مع اسم
صاحب الحساب، وتعرضها صفحة "نقرات احسمها" لحظياً.

---

## البنية

```
index.html            # نقطة الدخول (noindex)
robots.txt            # منع الفهرسة
firestore.rules       # قواعد الأمان (انشرها!)
tracking-snippet.html # قصاصة تتبّع النقرات لموقع ehsmaha
css/app.css           # نظام التصميم (بنفسجي/ذهبي، RTL)
js/
  firebase.js         # تهيئة Firebase + هوية المالك
  auth.js             # الدخول + 2FA + الجلسات + السجلات
  main.js             # الهيكل + الراوتر + القائمة الجانبية
  lib/
    ui.js             # مكوّنات: أيقونات SVG، Toast، Modal، تنسيق
    totp.js           # TOTP (RFC 6238) عبر Web Crypto
    data.js           # الاستماع اللحظي (presence/streamers/rooms)
    model.js          # أسماء الألعاب + وصول دفاعي لحقول المستخدم
  pages/
    dashboard.js players.js streamers.js games.js
    messages.js clicks.js leaderboard.js logs.js security.js
```

كل صفحة تُصدّر `{ id, title, icon, render(view) }`، وقد تُرجع دالة تنظيف للمستمعات.

---

## اختبار الأزرار على بيانات حقيقية

نظراً لأن اللوحة تلمس قاعدة إنتاج حيّة، اختبر الإجراءات الحسّاسة (الحذف/الحظر) على
حساب تجريبي أولاً. كل إجراء يظهر رسالة نجاح/فشل واضحة ويُسجَّل في "السجلات الأمنية".
