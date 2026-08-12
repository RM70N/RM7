// بنك العبارات للعبة "رسامين غنام" — مصنّف حسب الفئة، قابل للتوسعة من لوحة التحكم
import { get as getStore } from './store.js';

export const PHRASE_BANK = {
  عام: [
    'قطة تشرب قهوة الصباح',
    'رائد فضاء يركب دراجة هوائية',
    'ديناصور يلعب كرة القدم',
    'روبوت يسقي الزهور',
    'فيل يطير بمظلة',
    'سمكة ترتدي نظارة شمسية',
    'شجرة تحمل مظلة تحت المطر',
    'قمر يبتسم للنجوم',
    'سيارة تسبح في البحر',
    'طائر يقرأ كتابًا على غصن',
  ],
  خليجي: [
    'جمل يشرب شاهي بالنعناع',
    'صقر يلبس شماغ',
    'دلة قهوة عربية تمشي',
    'رجل يشوي على الكشتة',
    'طفل يركض خلف الغنم',
    'بحّار يصيد اللؤلؤ',
    'سيارة عالقة في الرمل',
    'صحن كبسة يطير في السماء',
    'نخلة مليانة رطب',
    'قط يجلس على مجلس شعبي',
  ],
  أفلام: [
    'بطل خارق نسي عباءته في البيت',
    'وحش لطيف يخاف من الفأر',
    'قرصان يبحث عن كنز آيس كريم',
    'أميرة تقود سفينة فضاء',
    'مخبر سري يتنكر كطباخ',
    'تنين يعزف على الجيتار',
  ],
  طعام: [
    'برجر عملاق يهرب من الطبق',
    'بيتزا ترقص على الطاولة',
    'كوب عصير يلبس قبعة',
    'كعكة عيد ميلاد تنفجر بالبالونات',
    'موزة تلعب كرة السلة',
    'دجاجة مقلية تركب سكوتر',
  ],
  رياضة: [
    'حارس مرمى نائم أثناء المباراة',
    'لاعب كرة قدم يسجل هدفًا بالمقلوب',
    'بطل ملاكمة يقاتل ظله',
    'سبّاح يسبح في بركة من الجيلي',
  ],
};

export function allCategories() {
  return Object.keys(PHRASE_BANK);
}

function effectiveList(category) {
  const base = PHRASE_BANK[category] || [];
  const store = getStore();
  const added = (store.phraseOverrides.added || []).filter((p) => p.category === category).map((p) => p.phrase);
  const removed = new Set(store.phraseOverrides.removed || []);
  return [...base, ...added].filter((p) => !removed.has(p));
}

export function randomPhrase(category) {
  const cats = category && PHRASE_BANK[category] ? [category] : allCategories();
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const list = effectiveList(cat);
  if (!list.length) return 'ارسم أي فكرة تخطر ببالك';
  return list[Math.floor(Math.random() * list.length)];
}

// عبارة يومية ثابتة لكل اللاعبين حول العالم (نفس اليوم = نفس العبارة)
export function dailyPhrase(date = new Date()) {
  const key = date.toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const list = effectiveList('عام');
  if (!list.length) return 'تحدي اليوم';
  return list[hash % list.length];
}
