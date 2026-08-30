import { useEffect, useState } from 'react';
import { siteApi } from '../lib/api';

interface Props {
  projectId: string;
  /** يتغيّر بعد كل تعديل عشان نجبر إعادة التحميل */
  version: number;
}

/**
 * معاينة الموقع داخل iframe معزول.
 *
 * الحماية: sandbox بدون allow-same-origin، فأي سكربت داخل الموقع
 * المرفوع يشتغل في أصل معزول ولا يقدر يوصل لجلستك ولا لواجهة النظام.
 *
 * ولأن العزل يمنع وصول كوكي الجلسة للإطار، نجيب رمز معاينة موقّعًا
 * ونمرّره في المسار عشان ملفات الموقع (CSS وصور وسكربتات) تتحمّل.
 */
export function SitePreview({ projectId, version }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setToken(null);
    setError(null);

    siteApi
      .previewToken(projectId)
      .then((res) => {
        if (!cancelled) setToken(res.token);
      })
      .catch(() => {
        if (!cancelled) setError('ما قدرنا نفتح المعاينة — حدّث الصفحة');
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, version]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-slate-400">
        {error}
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-slate-400">
        نجهّز المعاينة…
      </div>
    );
  }

  return (
    <iframe
      key={`${token}-${version}`}
      src={`${siteApi.previewUrl(projectId, token)}?v=${version}`}
      title="معاينة الموقع"
      className="h-full w-full border-0 bg-white"
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      referrerPolicy="no-referrer"
    />
  );
}
