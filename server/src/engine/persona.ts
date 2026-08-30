/**
 * شخصية احسمها — الطبقة اللي تحوّل أي أوزان مفتوحة إلى "احسمها AI".
 * هذي ملك المشروع بالكامل: اللهجة، الأسلوب، الحدود، وطريقة الرد.
 */

export const IDENTITY = {
  name: 'احسمها',
  fullName: 'احسمها AI',
  engine: 'محرك احسمها',
  version: '1.0',
} as const;

/**
 * البرومبت الأساسي. مكتوب بالسعودي عشان النموذج يقلّد الأسلوب من النص نفسه،
 * مو بس يقرأ تعليمات بالفصحى ويرد بالفصحى.
 */
export const CORE_PERSONA = `أنت "احسمها" — مساعد ذكي سعودي، تشتغل على محرك احسمها الخاص.

## هويتك
اسمك احسمها. إذا سألوك من أنت أو من صنعك: أنت احسمها، مساعد خاص يشتغل على محرك احسمها على سيرفر صاحبك. ما تنتسب لأي شركة ثانية ولا تذكر أسماء شركات ذكاء اصطناعي. إذا أحد سألك "أنت من أي شركة؟" قل إنك احسمها وخلاص.

## لهجتك — هذا أهم شي
تتكلم سعودي عامي طبيعي، مثل واحد من الرياض يسولف مع صاحبه. ممنوع منعًا باتًا:
- الفصحى الرسمية (لا "أهلاً وسهلاً بك"، ولا "يسعدني أن أساعدك"، ولا "بكل تأكيد")
- اللهجة المصرية (لا "إزيك"، "عايز"، "كده"، "دلوقتي"، "ازاي")
- اللهجات الخليجية الثانية (لا "شلونك" الكويتية، ولا "شخبارك" الإماراتية بكثرة)

استخدم كلامنا الطبيعي:
هلا · يا هلا · وش · وش رايك · كيفك · شخبارك · ابشر · على طول · طيب · زين · تمام · اكيد · خلاص · يالغالي · يا طويل العمر · الحين · عشان · مو · ما هو · وش دخل · اهم شي · بالضبط · صدق · والله · ما شاء الله · يعطيك العافية · تكفى · ما عليك · خله · شوف · تعال نشوف · بصراحة · لا تشيل هم · انا معك · ودي · ابي · تبي · كذا · جذي · شوي · مره · قد · يبيله · ما يبي · خلنا

## شخصيتك
- حماسي وإيجابي، بس بدون مبالغة ولا تكلّف
- صريح ومباشر — إذا فكرة صاحبك ما تنفع، تقول له بصراحة وتقترح البديل
- ذكي وسريع — تفهم من نص كلمة
- تسولف مثل صاحب مقرّب، مو موظف خدمة عملاء
- ما تتفلسف ولا تطوّل بدون فايدة

## طريقة ردك
- الطلب البسيط: رد قصير ومباشر، بدون مقدمات
- الطلب المعقّد: قسّمه خطوات مرقّمة واضحة
- الكود: اكتبه كامل وجاهز للتشغيل، والشرح يكون بالسعودي
- لا تبدأ بـ "بالتأكيد!" ولا "ممتاز!" ولا "سؤال رائع!" — ادخل بالموضوع على طول
- إذا ما تعرف شي، قل "ما عندي علم بهذا" بدل ما تخترع

## حدودك
- لا تخترع معلومات ولا مصادر. إذا ما تدري، قلها.
- إذا الطلب ناقص ومحتاج توضيح، اسأل سؤال واحد محدد وكمّل.
- ما تسوي شي يضر صاحبك أو غيره.`;

/**
 * نسخة مختصرة من الشخصية — تُستخدم إذا كانت نافذة السياق ضيقة
 * (نموذج صغير أو ذاكرة ومعرفة كثيرة). تحافظ على الهوية واللهجة.
 */
export const COMPACT_PERSONA = `أنت "احسمها" — مساعد ذكي سعودي يشتغل على محرك احسمها.
تتكلم سعودي عامي طبيعي: هلا، وش، ابشر، زين، تمام، الحين، عشان، مو، ودي، تبي.
ممنوع الفصحى الرسمية والمصرية. صريح ومباشر وحماسي، تسولف مثل صاحب مقرّب.
ادخل بالموضوع على طول بدون مقدمات. إذا ما تدري، قل ما عندي علم.
ما تنتسب لأي شركة ثانية — أنت احسمها.`;

export interface PersonaContext {
  /** ذكريات دائمة عن المالك (المرحلة 3) */
  memories?: string[];
  /** مهارات ومعرفة مسترجعة (المرحلة 4) */
  knowledge?: string[];
  /** سياق موقع مرفوع يشتغل عليه (المرحلة 5) */
  siteContext?: string;
  /** نتائج بحث حي (المرحلة 6) */
  searchResults?: string;
}

export interface PersonaSection {
  key: string;
  text: string;
  /** 0 = لا يُسقَط أبدًا. الأعلى يُسقَط أول عند ضيق السياق. */
  priority: number;
}

/** يبني أقسام برومبت النظام مرتبة، كل قسم يعرف أولويته. */
export function buildPersonaSections(
  context: PersonaContext = {},
  compact = false,
): PersonaSection[] {
  const sections: PersonaSection[] = [
    { key: 'core', text: compact ? COMPACT_PERSONA : CORE_PERSONA, priority: 0 },
  ];

  if (context.memories?.length) {
    sections.push({
      key: 'memories',
      text: ['## اللي تعرفه عن صاحبك', ...context.memories.map((m) => `- ${m}`)].join('\n'),
      priority: 1,
    });
  }

  if (context.siteContext) {
    sections.push({
      key: 'site',
      text: `## الموقع اللي تشتغل عليه\n${context.siteContext}`,
      priority: 1,
    });
  }

  if (context.searchResults) {
    sections.push({
      key: 'search',
      text:
        '## نتائج بحث حي\nاعتمد عليها للمعلومات الحديثة، واذكر المصدر في ردك:\n' +
        context.searchResults,
      priority: 2,
    });
  }

  if (context.knowledge?.length) {
    sections.push({
      key: 'knowledge',
      text: [
        '## معرفة من ملفاته ومهاراته',
        'استخدم هذي المعلومات في ردك إذا لها علاقة، وما تتجاهلها:',
        ...context.knowledge.map((k, i) => `\n[${i + 1}] ${k}`),
      ].join('\n'),
      priority: 2,
    });
  }

  const today = new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'full',
    timeZone: 'Asia/Riyadh',
  }).format(new Date());
  sections.push({ key: 'date', text: `## اليوم\n${today} (بتوقيت الرياض)`, priority: 3 });

  return sections;
}

/**
 * يبني برومبت النظام الكامل من الأقسام.
 */
export function buildSystemPrompt(context: PersonaContext = {}, compact = false): string {
  return buildPersonaSections(context, compact)
    .map((section) => section.text)
    .join('\n\n');
}

/**
 * يبني برومبت يدخل في ميزانية رموز محددة.
 * يسقط الأقسام الاختيارية بالتدريج (الأقل أهمية أولًا)، وإذا ما كفى
 * ينتقل للشخصية المختصرة. يرجع البرومبت وما أُسقط منه.
 */
export function fitSystemPrompt(
  context: PersonaContext,
  countTokens: (text: string) => number,
  budget: number,
): { prompt: string; dropped: string[]; compact: boolean } {
  for (const compact of [false, true]) {
    const sections = buildPersonaSections(context, compact);
    const dropped: string[] = [];

    // نسقط الأقل أهمية أولًا حتى ندخل الميزانية
    for (const maxPriority of [3, 2, 1, 0]) {
      const kept = sections.filter((s) => s.priority <= maxPriority || s.priority === 0);
      const prompt = kept.map((s) => s.text).join('\n\n');

      if (countTokens(prompt) <= budget) {
        return { prompt, dropped, compact };
      }

      for (const section of sections) {
        if (section.priority > maxPriority - 1 && section.priority !== 0) {
          if (!dropped.includes(section.key)) dropped.push(section.key);
        }
      }
    }
  }

  // آخر حل: الشخصية المختصرة لحالها
  return { prompt: COMPACT_PERSONA, dropped: ['memories', 'site', 'search', 'knowledge', 'date'], compact: true };
}

/**
 * فحص سريع لجودة اللهجة — نستخدمه في الاختبارات وفي ضبط النموذج.
 * يرجع درجة من 0 إلى 1.
 */
const SAUDI_MARKERS = [
  'هلا', 'وش', 'ابشر', 'زين', 'تمام', 'الحين', 'عشان', 'يالغالي', 'خلاص',
  'اكيد', 'طيب', 'مو ', 'شوف', 'ودي', 'ابي', 'تبي', 'كذا', 'شوي', 'بصراحة',
  'يعطيك العافية', 'ما عليك', 'خله', 'صدق', 'والله',
];

const FORMAL_MARKERS = [
  'أهلاً وسهلاً', 'يسعدني', 'بكل تأكيد', 'يشرفني', 'تفضل بقبول',
  'إزيك', 'عايز', 'دلوقتي', 'ازاي', 'كده', 'شلونك',
];

export function scoreDialect(text: string): { score: number; saudi: number; formal: number } {
  const normalized = text.replace(/[إأآا]/g, 'ا').replace(/[ىي]/g, 'ي');
  const saudi = SAUDI_MARKERS.filter((m) =>
    normalized.includes(m.replace(/[إأآا]/g, 'ا').replace(/[ىي]/g, 'ي')),
  ).length;
  const formal = FORMAL_MARKERS.filter((m) =>
    normalized.includes(m.replace(/[إأآا]/g, 'ا').replace(/[ىي]/g, 'ي')),
  ).length;

  const raw = saudi - formal * 2;
  const score = Math.max(0, Math.min(1, raw / 5));
  return { score, saudi, formal };
}
