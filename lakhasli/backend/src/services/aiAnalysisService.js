import { generateJson } from './geminiClient.js';

// Gemini responseSchema (OpenAPI subset — type بأحرف كبيرة). خريطة ذهنية محدودة
// بـ3 مستويات (جذر، فروع، فروع فرعية) لتفادي تعقيد schema متداخل بلا حدود.
const MIND_MAP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    children: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          children: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { title: { type: 'STRING' } },
              required: ['title'],
            },
          },
        },
        required: ['title'],
      },
    },
  },
  required: ['title'],
};

const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: {
      type: 'ARRAY',
      description: 'ملخص المحاضرة كقائمة جمل، كل جملة مصنّفة حسب مصدرها.',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          source: {
            type: 'STRING',
            enum: ['quoted', 'inferred'],
            description: 'quoted = مقتبسة حرفيًا من كلام المحاضر. inferred = استنتاج أو ربط من السياق.',
          },
        },
        required: ['text', 'source'],
      },
    },
    gaps: {
      type: 'ARRAY',
      description: 'فجوات أو قفزات مفاجئة في الموضوع أو انقطاعات واضحة بالسياق.',
      items: {
        type: 'OBJECT',
        properties: {
          afterSummaryIndex: { type: 'INTEGER', description: 'رقم الجملة بالملخص (تبدأ من 0) التي تسبق الفجوة' },
          note: { type: 'STRING', description: 'وصف مختصر للفجوة بالعربي' },
        },
        required: ['afterSummaryIndex', 'note'],
      },
    },
    mindMap: MIND_MAP_SCHEMA,
    flashcards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { question: { type: 'STRING' }, answer: { type: 'STRING' } },
        required: ['question', 'answer'],
      },
    },
    quiz: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correctAnswerIndex: { type: 'INTEGER' },
        },
        required: ['question', 'options', 'correctAnswerIndex'],
      },
    },
    emphasisPhrases: {
      type: 'ARRAY',
      description: 'عبارات قالها المحاضر تدل على التشديد أو الأهمية (مثل "هذا مهم جداً"، "بيجي بالاختبار") كما وردت حرفيًا.',
      items: { type: 'STRING' },
    },
  },
  required: ['summary', 'gaps', 'mindMap', 'flashcards', 'quiz', 'emphasisPhrases'],
};

/**
 * يحلل نص المحاضرة (transcript أو نص مستخرج) ويولّد الملخص وخريطة ذهنية وأسئلة وبطاقات.
 * @param {object} params
 * @param {string} params.sourceText - النص الكامل للمحاضرة
 * @param {string} [params.courseName]
 * @param {string[]} [params.knownEmphasisPhrases] - عبارات متكررة سابقًا لنفس الأستاذ (بصمة الأستاذ)
 * @returns {Promise<object>} نتيجة التحليل المطابقة لـANALYSIS_SCHEMA
 */
export async function analyzeLecture({ sourceText, courseName, knownEmphasisPhrases = [] }) {
  const systemInstruction = `أنت مساعد تعليمي متخصص بتحليل المحاضرات الجامعية باللغة العربية لمنصة "لخّصلي".
مهمتك تحليل نص محاضرة (تفريغ صوتي أو محتوى مستخرج) وتوليد ملخص مصنّف، فجوات محتملة، خريطة ذهنية هرمية (لا تتجاوز 3 مستويات)، بطاقات مراجعة، أسئلة اختبار متعدد الخيارات (4 خيارات)، وعبارات تشديد حرفية قالها المحاضر.
كل جملة بالملخص صنّفها: "quoted" إذا كانت اقتباس شبه حرفي مباشر، أو "inferred" إذا كانت استنتاجًا أو ربطًا بين نقاط متفرقة.${
    knownEmphasisPhrases.length
      ? `\n\nهذا الأستاذ يكرر عادةً عبارات مثل: ${knownEmphasisPhrases
          .slice(0, 10)
          .join('، ')}. إذا تكررت في هذا النص، أعطِ النقاط المرتبطة بها وزنًا أعلى بالملخص وضعها كسؤال أو بطاقة مراجعة.`
      : ''
  }`;

  const prompt = `المقرر: ${courseName || 'غير محدد'}

نص المحاضرة:
"""
${sourceText.slice(0, 60000)}
"""

حلّل النص وأعد النتيجة حسب الصيغة المطلوبة فقط.`;

  return generateJson({ systemInstruction, prompt, schema: ANALYSIS_SCHEMA });
}

const EXPAND_SCHEMA = {
  type: 'OBJECT',
  properties: {
    children: {
      type: 'ARRAY',
      description: 'نقاط توضيحية أو أمثلة جديدة تُضاف تحت هذا الفرع',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' } },
        required: ['title'],
      },
    },
  },
  required: ['children'],
};

/**
 * يوسّع فرعًا من الخريطة الذهنية بطلب من الطالب ("وضّح أكثر" أو "أعطني مثال")
 * بالاعتماد على نص المحاضرة الكامل كسياق.
 * @param {object} params
 * @param {string} params.sourceText
 * @param {string} params.nodeTitle - عنوان الفرع المطلوب توسيعه
 * @param {'clarify'|'example'} params.requestType
 * @returns {Promise<Array<{title: string}>>}
 */
export async function expandMindMapNode({ sourceText, nodeTitle, requestType }) {
  const ask = requestType === 'example' ? 'أعطِ مثالًا عمليًا واحدًا أو أكثر يوضّح هذه النقطة' : 'وضّح هذه النقطة أكثر بتفصيل إضافي';

  const prompt = `استنادًا إلى نص المحاضرة التالي، ${ask} عن النقطة: "${nodeTitle}".

نص المحاضرة:
"""
${sourceText.slice(0, 60000)}
"""

أعد 1 إلى 3 نقاط فرعية قصيرة وواضحة فقط.`;

  const result = await generateJson({ prompt, schema: EXPAND_SCHEMA, maxOutputTokens: 1500 });
  return result?.children || [];
}
