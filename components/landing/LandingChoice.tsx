import { t, type Locale } from "@/lib/i18n";

type LandingChoiceProps = {
  disabled: boolean;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onUploadChoice: () => void;
  onScratchChoice: () => void;
};

export function LandingChoice({ disabled, locale, onLocaleChange, onUploadChoice, onScratchChoice }: LandingChoiceProps) {
  const text = t(locale).landing;

  return (
    <section className="landing-wrap">
      <div className="hero-card">
        <div aria-label={t(locale).chat.languageAria} className="voice-language-toggle landing-language-toggle" role="group">
          <button className={locale === "ro" ? "selected" : ""} type="button" onClick={() => onLocaleChange("ro")}>
            RO
          </button>
          <button className={locale === "en" ? "selected" : ""} type="button" onClick={() => onLocaleChange("en")}>
            EN
          </button>
        </div>
        <p className="eyebrow">{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <p className="hero-copy">{text.copy}</p>
        <div className="choice-row" aria-label={text.aria}>
          <button className="primary-choice" disabled={disabled} onClick={onUploadChoice}>
            {text.upload}
          </button>
          <button className="secondary-choice" disabled={disabled} onClick={onScratchChoice}>
            {text.scratch}
          </button>
        </div>
        <p className="privacy-note">{text.privacy}</p>
      </div>
    </section>
  );
}
