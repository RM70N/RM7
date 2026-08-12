// التحفة — بدون حد زمني، للرسم المتأنّي عالي الجودة (بحد أقصى أمني للسيرفر فقط)
import normal from './normal.js';

const SAFETY_CAP_SECONDS = 20 * 60; // صمام أمان حتى لا تتجمّد الغرفة إن غادر الجميع

export default {
  ...normal,
  id: 'masterpiece',
  name: 'التحفة (بدون وقت)',
  description: 'بدون حد زمني — خذ وقتك في الرسم والكتابة',
  noTimer: true,

  roundDuration() {
    return SAFETY_CAP_SECONDS;
  },
};
