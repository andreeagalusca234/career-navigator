import type { CandidateProfile } from "@/lib/cv/schemas";
import { t, type Locale } from "@/lib/i18n";

type ProfileCompletenessProps = {
  profile: CandidateProfile;
  locale: Locale;
};

export function ProfileCompleteness({ profile, locale }: ProfileCompletenessProps) {
  const text = t(locale).profile;

  return (
    <section className="panel-block">
      <div className="panel-title-row">
        <h2>{text.title}</h2>
        <strong>{profile.completenessScore}%</strong>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${profile.completenessScore}%` }} />
      </div>
      <p>
        {profile.completenessScore >= 70
          ? text.ready
          : text.collecting}
      </p>
    </section>
  );
}
