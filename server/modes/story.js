// القصة — وضع كتابة فقط بدون رسم؛ بناء قصة جماعية سطرًا بسطر
import normal from './normal.js';

export default {
  ...normal,
  id: 'story',
  name: 'القصة',
  description: 'بناء قصة جماعية سطرًا بسطر، بدون رسم',
  textOnly: true,

  roundType() {
    return 'text';
  },
  roundDuration(base) {
    return base;
  },
};
