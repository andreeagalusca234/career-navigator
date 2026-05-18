import type { GeneratedDocumentView } from "@/lib/cv/schemas";
import { t, type Locale } from "@/lib/i18n";

type DownloadCardProps = {
  document: GeneratedDocumentView;
  locale: Locale;
};

export function DownloadCard({ document, locale }: DownloadCardProps) {
  const text = t(locale).download;

  return (
    <section className="panel-block download-card">
      <h2>{text.title}</h2>
      <p>{document.fileName}</p>
      <a className="primary-button as-link" href={`/api/download/${document.id}`}>
        {text.button}
      </a>
    </section>
  );
}
