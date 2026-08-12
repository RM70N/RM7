// الرسم الجماعي — كل اللاعبين يساهمون في نفس الرسمة بالتناوب بدل رسومات منفصلة
import normal from './normal.js';

export default {
  ...normal,
  id: 'collab',
  name: 'الرسم الجماعي',
  description: 'كل اللاعبين يرسمون على نفس اللوحة بالتناوب',
  bookStructure: 'shared', // كتاب واحد مشترك للغرفة كلها
  collabDrawing: true, // كل جولة رسم تُبنى فوق الرسمة التراكمية بدل لوحة فارغة

  roundType(round) {
    return round === 0 ? 'text' : 'drawing';
  },
  totalRounds(playerCount) {
    return playerCount; // جولة كتابة واحدة (الموضوع) + جولة رسم لكل بقية اللاعبين
  },
};
