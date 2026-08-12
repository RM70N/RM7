// النمط السري — لا يُكشف صاحب أي إدخال حتى يُكشف الكتاب كاملًا في العرض النهائي
import normal from './normal.js';

export default {
  ...normal,
  id: 'secret',
  name: 'السري',
  description: 'لا يرى أي لاعب نتائج الآخرين، وحتى الأسماء تبقى مخفية حتى ينكشف الكتاب كاملًا',
  hideAuthorsUntilComplete: true,
};
