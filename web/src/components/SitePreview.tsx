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
 */
export function SitePreview({ projectId, version }: Props) {
  return (
    <iframe
      key={version}
      src={`/api/sites/${projectId}/preview/?v=${version}`}
      title="معاينة الموقع"
      className="h-full w-full border-0 bg-white"
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      referrerPolicy="no-referrer"
    />
  );
}
