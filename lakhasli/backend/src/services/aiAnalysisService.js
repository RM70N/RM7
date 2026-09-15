import Anthropic from '@anthropic-ai/sdk';
import { env, isClaudeConfigured } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const MIND_MAP_NODE = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    children: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          children: {
            type: 'array',
            items: {
              type: 'object',
              properties: { title: { type: 'string' } },
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

const ANALYSIS_TOOL = {
  name: 'submit_lecture_analysis',
  description: 'تسليم التحليل الكامل للمحاضرة بصيغة منظّمة.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'array',
        description: 'ملخص المحاضرة كقائمة جمل، كل جملة مصنّفة حسب مصدرها.',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            source: {
              type: 'string',
              enum: ['quoted', 'inferred'],
              description: 'quoted = مقتبسة حرفيًا من كلام المحاضر. inferred = استنتاج أو ربط من السياق.',
            },
          },
          required: ['text', 'source'],
        },
      },
      gaps: {
        type: 'array',
        description: 'فجوات أو قفزات مفاجئة في الموضوع أو انقطاعات واضحة بالسياق.',
        items: {
          type: 'object',
          properties: {
            afterSummaryIndex: { type: 'integer', description: 'رقم الجملة بالملخص (تبدأ من 0) التي تسبق الفجوة' },
            note: { type: 'string', description: 'وصف مختصر للفجوة بالعربي' },
          },
          required: ['afterSummaryIndex', 'note'],
        },
      },
      mindMap: MIND_MAP_NODE,
      flashcards: {
        type: 'array',
        items: {
          type: 'object',
          properties: { question: { type: 'string' }, answer: { type: 'string' } },
          required: ['question', 'answer'],
        },
      },
      quiz: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
            correctAnswerIndex: { type: 'integer', minimum: 0, maximum: 3 },
          },
          required: ['question', 'options', 'correctAnswerIndex'],
        },
      },
      emphasisPhrases: {
        type: 'array',
        description: 'عبارات قالها المحاضر تدل على التشديد أو الأهمية (مثل "هذا مهم جداً"، "بيجي بالاختبار") كما وردت حرفيًا.',
        items: { type: 'string' },
      },
    },
    required: ['summary', 'gaps', 'mindMap', 'flashcards', 'quiz', 'emphasisPhrases'],
  },
};

/**
 * يحلل نص المحاضرة (transcript أو نص مستخرج) ويولّد الملخص وخريطة ذهنية وأسئلة وبطاقات.
 * @param {object} params
 * @param {string} params.sourceText - النص الكامل للمحاضرة
 * @param {string} [params.courseName]
 * @param {string[]} [params.knownEmphasisPhrases] - عبارات متكررة سابقًا لنفس الأستاذ (بصمة الأستاذ)
 * @returns {Promise<object>} نتيجة التحليل المطابقة لمخطط ANALYSIS_TOOL
 */
export async function analyzeLecture({ sourceText, courseName, knownEmphasisPhrases = [] }) {
  if (!isClaudeConfigured()) {
    throw new AppError(500, 'خدمة التحليل الذكي غير مفعّلة على السيرفر حاليًا.');
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const fingerprintNote = knownEmphasisPhrases.length
    ? `\n\nملاحظة: هذا الأستاذ يكرر عادةً عبارات مثل: ${knownEmphasisPhrases
        .slice(0, 10)
        .join('، ')}. إذا تكررت في هذا النص، أعطِ النقاط المرتبطة بها وزنًا أعلى بالملخص وضعها كسؤال أو بطاقة مراجعة.`
    : '';

  const prompt = `أنت مساعد تعليمي متخصص بتحليل المحاضرات الجامعية باللغة العربية لمنصة "لخّصلي".

المقرر: ${courseName || 'غير محدد'}${fingerprintNote}

مهمتك تحليل النص التالي (تفريغ محاضرة أو محتوى مستخرج) وتوليد:
1. ملخص كجمل واضحة ومرتبة منطقيًا. كل جملة صنّفها:
   - "quoted": إذا كانت اقتباس شبه حرفي مباشر مما قاله المحاضر.
   - "inferred": إذا كانت استنتاجًا أو ربطًا بين نقاط متفرقة أو معرفة عامة لسد الفجوة.
2. أي فجوات أو قفزات مفاجئة بالموضوع (مثل انقطاع صوت أو جملة ناقصة السياق).
3. خريطة ذهنية هرمية (عنوان رئيسي، محاور فرعية، وتحتها تفاصيل إن وجدت) لا تتجاوز 3 مستويات.
4. بطاقات مراجعة (سؤال وجواب قصير) لأهم النقاط.
5. أسئلة اختبار متعدد الخيارات (4 خيارات لكل سؤال) لأهم النقاط.
6. أي عبارات تشديد قالها المحاضر حرفيًا (مثل "مهم جداً" أو "بيجي بالاختبار").

النص:
"""
${sourceText.slice(0, 60000)}
"""

استخدم أداة submit_lecture_analysis لتسليم النتيجة. لا تكتب أي نص خارج الأداة.`;

  let response;
  try {
    response = await client.messages.create({
      model: env.claudeModel,
      max_tokens: 8000,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: 'tool', name: 'submit_lecture_analysis' },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    logger.error('فشل استدعاء Claude API:', err);
    throw new AppError(502, 'فشل تحليل المحاضرة بالذكاء الاصطناعي. حاول مرة ثانية بعد شوي.');
  }

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    logger.error('Claude لم يرجع نتيجة منظمة:', response);
    throw new AppError(502, 'ما قدرنا نفهم رد التحليل الذكي. حاول مرة ثانية.');
  }

  return toolUse.input;
}

const EXPAND_TOOL = {
  name: 'submit_expansion',
  description: 'تسليم توضيح أو مثال إضافي لفرع معين بالخريطة الذهنية.',
  input_schema: {
    type: 'object',
    properties: {
      children: {
        type: 'array',
        description: 'نقاط توضيحية أو أمثلة جديدة تُضاف تحت هذا الفرع',
        items: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
    },
    required: ['children'],
  },
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
  if (!isClaudeConfigured()) {
    throw new AppError(500, 'خدمة التحليل الذكي غير مفعّلة على السيرفر حاليًا.');
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const ask = requestType === 'example' ? 'أعطِ مثالًا عمليًا واحدًا أو أكثر يوضّح هذه النقطة' : 'وضّح هذه النقطة أكثر بتفصيل إضافي';

  const prompt = `استنادًا إلى نص المحاضرة التالي، ${ask} عن النقطة: "${nodeTitle}".

نص المحاضرة:
"""
${sourceText.slice(0, 60000)}
"""

استخدم أداة submit_expansion فقط، وأعد 1 إلى 3 نقاط فرعية قصيرة وواضحة.`;

  let response;
  try {
    response = await client.messages.create({
      model: env.claudeModel,
      max_tokens: 1500,
      tools: [EXPAND_TOOL],
      tool_choice: { type: 'tool', name: 'submit_expansion' },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    logger.error('فشل توسيع الخريطة الذهنية:', err);
    throw new AppError(502, 'فشل توليد التوضيح. حاول مرة ثانية.');
  }

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  return toolUse?.input?.children || [];
}
