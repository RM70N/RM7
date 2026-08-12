// شارات تُمنح تلقائيًا حسب الأداء والأنماط المُكمَّلة
export function computeGameBadges(modeId, awards, playerId) {
  const badges = [];
  if (modeId === 'story') badges.push('خطاط غنام');
  if (modeId === 'secret' || modeId === 'missing_piece') badges.push('الرسام الغامض');
  if (awards.fastest?.playerId === playerId) badges.push('⚡ الأسرع');
  if (awards.bestPainter?.playerId === playerId) badges.push('🎨 أفضل رسام');
  return badges;
}
