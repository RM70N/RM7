// النمط السريع — نفس آلية العادي لكن الوقت يتناقص مع كل جولة (ضغط زمني متصاعد)
import normal from './normal.js';

export default {
  ...normal,
  id: 'speed',
  name: 'السريع',
  description: 'الوقت يتناقص مع كل جولة — ضغط زمني متصاعد',

  roundDuration(base, round, ctx) {
    let d = Math.max(15, base - round * 8);
    if (this.roundType(round) === 'drawing') d = Math.round(d * 1.4);
    return d;
  },
};
