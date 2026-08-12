// بالنقاط — يُقارن وصف كل لاعب بالجملة السابقة؛ إن تطابق المعنى يحصل الطرفان على نقاط
import normal from './normal.js';
import { similarity, SIMILARITY_THRESHOLD } from '../similarity.js';

export default {
  ...normal,
  id: 'points',
  name: 'بالنقاط',
  description: 'قارن وصفك بالجملة الأصلية — كلما تطابق المعنى كسبتما نقاطًا',
  scored: true,

  // يُستدعى بعد كل submit ناجح؛ يعيد { authorId, points }[] أو null
  scoreOnSubmit(book, round, entry) {
    if (entry.type !== 'text' || round < 2) return null;
    const prevText = book.entries[round - 2];
    if (!prevText || prevText.type !== 'text') return null;
    const sim = similarity(entry.text, prevText.text);
    if (sim >= SIMILARITY_THRESHOLD) {
      const pts = Math.round(sim * 10) + 1;
      return [
        { authorId: entry.authorId, points: pts },
        { authorId: prevText.authorId, points: pts },
      ];
    }
    return null;
  },
};
