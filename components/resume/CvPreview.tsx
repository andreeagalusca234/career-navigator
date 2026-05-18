import type { CandidateProfile, JobDescription } from "@/lib/cv/schemas";
import { t, type Locale } from "@/lib/i18n";

type CvPreviewProps = {
  profile: CandidateProfile;
  jobDescription?: JobDescription;
  locale: Locale;
};

export function CvPreview({ profile, jobDescription, locale }: CvPreviewProps) {
  const text = t(locale).preview;

  return (
    <section className="panel-block cv-preview">
      <div className="panel-title-row">
        <h2>{text.title}</h2>
        {jobDescription?.roleTitle ? <span>{jobDescription.roleTitle}</span> : null}
      </div>

      <div className="cv-paper">
        <h3>{profile.fullName || text.fallbackName}</h3>
        <p className="muted-line">
          {[profile.contact.email, profile.contact.phone, profile.contact.location].filter(Boolean).join(" | ") ||
            text.contact}
        </p>

        <PreviewSection title={text.education} items={profile.education.map((item) => item.institution)} pending={text.pending} />
        <PreviewSection
          title={text.experience}
          items={profile.experience.map((item) => `${item.role} - ${item.company}`)}
          pending={text.pending}
        />
        <PreviewSection title={text.skills} items={profile.skills} inline pending={text.pending} />
        <PreviewSection
          title={text.languages}
          items={profile.languages.map((item) => [item.language, item.proficiency].filter(Boolean).join(" "))}
          inline
          pending={text.pending}
        />
      </div>
    </section>
  );
}

function PreviewSection({
  title,
  items,
  pending,
  inline = false
}: {
  title: string;
  items: string[];
  pending: string;
  inline?: boolean;
}) {
  return (
    <div className="preview-section">
      <h4>{title}</h4>
      {items.length ? (
        inline ? (
          <p>{items.join(", ")}</p>
        ) : (
          <ul>
            {items.slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )
      ) : (
        <p className="muted-line">{pending}</p>
      )}
    </div>
  );
}
