# API احسمها

واجهة برمجية خاصة بمشروعك، تقدر تستخدمها من أي تطبيق خارجي.

## المصادقة

كل مفتاح تصدره من صفحة **الإعدادات ← مفاتيح API احسمها**، ويظهر مرة وحدة فقط.

```bash
curl https://your-server/api/v1/status \
  -H "x-ahsmaha-key: ahsm_xxxxxxxx.yyyyyyyy"
```

أو:

```bash
-H "Authorization: Bearer ahsm_xxxxxxxx.yyyyyyyy"
```

المفتاح يُخزَّن كهاش Argon2id — حتى لو تسربت قاعدة البيانات ما أحد يقدر يستخرجه.

## الصلاحيات

كل مفتاح تحدد له صلاحياته وقت الإصدار:

| الصلاحية | تعطي وصولًا لـ |
|---|---|
| `chat` | المحادثة وحالة المحرك |
| `knowledge` | البحث في ملفاتك ومهاراتك |
| `search` | البحث الحي على الإنترنت |
| `studio` | توليد الصور |
| `memory` | الذاكرة الدائمة |

المفتاح خارج صلاحيته يرجع `403`.

## المسارات

### `GET /api/v1` — معلومات الخدمة
بدون مفتاح.

### `GET /api/v1/docs` — التوثيق الكامل
بدون مفتاح. يرجع كل المسارات وأشكال الطلبات.

### `GET /api/v1/status` — حالة المحرك
**الصلاحية:** `chat`

```json
{
  "service": "احسمها AI",
  "engine": "محرك احسمها",
  "ready": true,
  "contextSize": 8192,
  "accelerator": "cuda"
}
```

### `POST /api/v1/chat` — رد على رسالة
**الصلاحية:** `chat`

```json
{
  "message": "اشرح لي وش الفرق بين HTTP وHTTPS",
  "useMemory": true,
  "useKnowledge": true,
  "temperature": 0.7,
  "maxTokens": 1000
}
```

الرد:

```json
{
  "reply": "…",
  "engine": "محرك احسمها",
  "usage": { "inputTokens": 530, "outputTokens": 240, "durationMs": 3200 }
}
```

`useMemory` و`useKnowledge` اختياريان (الافتراضي مفعّل). حطهم `false` لو تبي
رد نظيف بدون سياقك الشخصي.

### `POST /api/v1/knowledge/search` — بحث في معرفتك
**الصلاحية:** `knowledge`

```json
{ "query": "سياسة الإرجاع", "limit": 6 }
```

يرجع مقاطع من ملفاتك ومهاراتك مرتبة بالصلة.

### `POST /api/v1/search` — بحث حي
**الصلاحية:** `search`

```json
{ "query": "آخر إصدار من نود", "limit": 6 }
```

### `POST /api/v1/image` — توليد صورة
**الصلاحية:** `studio`

```json
{
  "template": "cover",
  "palette": "palm",
  "title": "عنوان الصورة",
  "subtitle": "سطر ثاني",
  "badge": "جديد"
}
```

يرجع معرّف الصورة ورابطها.

## الحدود

- 60 طلب في الدقيقة لكل مفتاح.
- تجاوز الحد يرجع `429`.

## الأخطاء

كل الأخطاء بنفس الشكل، والرسائل بالعربي:

```json
{ "error": { "code": "FORBIDDEN", "message": "هذا المفتاح ما عنده صلاحية \"search\"" } }
```

| الرمز | المعنى |
|---|---|
| `UNAUTHORIZED` | مفتاح ناقص أو غير صالح أو ملغي |
| `FORBIDDEN` | المفتاح ما عنده الصلاحية المطلوبة |
| `VALIDATION_ERROR` | البيانات المرسلة ناقصة أو غلط |
| `NO_MODEL` | ما فيه أوزان محمّلة في المحرك |
| `TOO_MANY_REQUESTS` | تجاوزت الحد |
