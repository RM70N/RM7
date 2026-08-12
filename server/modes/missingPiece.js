// القطعة الناقصة — يبدأ كل كتاب برسمة ناقصة على اللاعب الأول إكمالها بإبداع
import normal from './normal.js';

const W = 800, H = 600;

// أشكال بدائية ناقصة عشوائية (خطوط متجهية) تُستخدم كنقطة انطلاق
function randomSeedStrokes() {
  const cx = W / 2 + (Math.random() - 0.5) * 200;
  const cy = H / 2 + (Math.random() - 0.5) * 150;
  const shapes = [
    // دائرة ناقصة (قوس فقط)
    () => {
      const r = 90 + Math.random() * 40;
      const pts = [];
      const startA = Math.random() * Math.PI * 2;
      for (let a = 0; a <= 1.3 * Math.PI; a += 0.15) {
        pts.push([cx + r * Math.cos(startA + a), cy + r * Math.sin(startA + a)]);
      }
      return [{ tool: 'pencil', color: '#000000', size: 6, points: pts }];
    },
    // خطان متقاطعان (بداية شكل غير مكتمل)
    () => [
      { tool: 'line', color: '#000000', size: 6, points: [[cx - 120, cy], [cx + 40, cy - 80]] },
      { tool: 'line', color: '#000000', size: 6, points: [[cx - 60, cy + 90], [cx + 100, cy - 20]] },
    ],
    // مستطيل ناقص ضلع واحد (ثلاثة أضلاع فقط)
    () => {
      const w = 160, h = 110;
      const x = cx - w / 2, y = cy - h / 2;
      return [
        { tool: 'line', color: '#000000', size: 6, points: [[x, y], [x + w, y]] },
        { tool: 'line', color: '#000000', size: 6, points: [[x, y], [x, y + h]] },
        { tool: 'line', color: '#000000', size: 6, points: [[x, y + h], [x + w, y + h]] },
      ];
    },
    // خربشة موجية بسيطة
    () => {
      const pts = [];
      for (let x = cx - 140; x <= cx + 140; x += 12) {
        pts.push([x, cy + Math.sin((x - cx) / 25) * 40]);
      }
      return [{ tool: 'pencil', color: '#000000', size: 6, points: pts }];
    },
  ];
  return shapes[Math.floor(Math.random() * shapes.length)]();
}

export default {
  ...normal,
  id: 'missing_piece',
  name: 'القطعة الناقصة',
  description: 'كل كتاب يبدأ برسمة ناقصة عليك إكمالها بإبداع',
  hasSeed: true,

  // معكوس الترتيب: الجولة الأولى رسم (إكمال) بدل كتابة
  roundType(round) {
    return round % 2 === 0 ? 'drawing' : 'text';
  },
  seedEntry() {
    return { type: 'drawing', authorId: null, authorName: 'رسامين غنام', strokes: randomSeedStrokes(), seeded: true };
  },
};
