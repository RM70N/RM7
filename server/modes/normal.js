// النمط العادي (تلفون غنام) — الأساس الذي تُبنى عليه بقية الأنماط
export default {
  id: 'normal',
  name: 'العادي (تلفون غنام)',
  description: 'كتابة ↔ رسم بالتناوب حتى نهاية الدورة',
  bookStructure: 'per-player',
  collabDrawing: false,
  hideAuthorsUntilComplete: false,
  noTimer: false,

  roundType(round) {
    return round % 2 === 0 ? 'text' : 'drawing';
  },
  roundDuration(base, round, ctx) {
    let d = base;
    if (this.roundType(round) === 'drawing') d = Math.round(d * 1.5);
    return d;
  },
  totalRounds(playerCount) {
    return playerCount;
  },
  seedEntry() {
    return null;
  },
  scoreOnSubmit() {
    return null;
  },
};
