/* ===== إعداد عنوان الخادم الخلفي ===== */
// اتركه فارغًا "" إذا كانت الواجهة والخادم على نفس النطاق (تشغيل محلي أو استضافة موحّدة).
// إذا نشرت الواجهة (مجلد public) على استضافة ساكنة مثل Netlify منفصلة عن الخادم،
// ضع هنا رابط الخادم الخلفي (مثال: 'https://ghannam-painters.onrender.com') بدون شرطة مائلة في النهاية.
window.GHANNAM_API_ORIGIN = '';

// رابط REST كامل لمسار معيّن
window.ghannamApi = function (path) {
  return (window.GHANNAM_API_ORIGIN || '') + path;
};

// رابط WebSocket الصحيح حسب الإعداد أعلاه
window.ghannamWsUrl = function () {
  if (window.GHANNAM_API_ORIGIN) {
    const u = new URL(window.GHANNAM_API_ORIGIN);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}/ws`;
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
};
