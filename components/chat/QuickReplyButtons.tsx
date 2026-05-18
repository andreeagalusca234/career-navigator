import { t, type Locale } from "@/lib/i18n";

type QuickReplyButtonsProps = {
  disabled: boolean;
  locale: Locale;
  onAnalyze: () => void;
  onGenerate: () => void;
};

export function QuickReplyButtons({ disabled, locale, onAnalyze, onGenerate }: QuickReplyButtonsProps) {
  const text = t(locale).quickActions;

  return (
    <div className="quick-actions">
      <button disabled={disabled} onClick={onAnalyze}>
        {text.analyze}
      </button>
      <button disabled={disabled} onClick={onGenerate}>
        {text.generate}
      </button>
    </div>
  );
}
