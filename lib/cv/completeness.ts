import type { CandidateProfile, FlowState } from "@/lib/cv/schemas";
import type { Locale } from "@/lib/i18n";

const hasText = (value?: string) => Boolean(value && value.trim().length > 1);

export function calculateCompleteness(profile: CandidateProfile): number {
  let score = 0;

  if (hasText(profile.fullName)) score += 8;
  if (hasText(profile.contact.email) || hasText(profile.contact.phone)) score += 8;
  if (hasText(profile.contact.location) || hasText(profile.contact.linkedin)) score += 4;

  if (profile.education.length > 0) score += 15;

  if (profile.experience.length > 0 || profile.projects.length > 0) score += 18;

  const allBullets = [
    ...profile.experience.flatMap((item) => item.bullets),
    ...profile.projects.flatMap((item) => item.bullets),
    ...profile.leadership.flatMap((item) => item.bullets)
  ];

  if (allBullets.length > 0) score += 10;
  if (allBullets.some((bullet) => bullet.evidenceLevel !== "weak")) score += 10;
  if (allBullets.some((bullet) => bullet.metrics.length > 0)) score += 8;

  if (profile.skills.length >= 3) score += 12;
  if (profile.languages.length > 0) score += 5;
  if (hasText(profile.summary)) score += 2;

  return Math.min(100, score);
}

export function getMissingProfileFields(profile: CandidateProfile): string[] {
  const missing: string[] = [];

  if (!hasText(profile.fullName)) missing.push("numele complet");
  if (!hasText(profile.contact.email) && !hasText(profile.contact.phone)) missing.push("o metoda de contact");
  if (profile.education.length === 0) missing.push("educatia");
  if (profile.experience.length === 0 && profile.projects.length === 0) {
    missing.push("experienta, proiecte sau voluntariat");
  }
  if (!hasMeaningfulEvidence(profile)) missing.push("rezultate masurabile");
  if (profile.skills.length < 3) missing.push("competente relevante");
  if (profile.languages.length === 0) missing.push("limbi straine");

  return missing;
}

export function hasMeaningfulEvidence(profile: CandidateProfile): boolean {
  const bullets = [
    ...profile.experience.flatMap((item) => item.bullets),
    ...profile.projects.flatMap((item) => item.bullets),
    ...profile.leadership.flatMap((item) => item.bullets)
  ];

  return bullets.some((bullet) => bullet.evidenceLevel !== "weak" || bullet.metrics.length > 0);
}

function hasCoreCvMaterial(profile: CandidateProfile): boolean {
  return profile.education.length > 0 && (profile.experience.length > 0 || profile.projects.length > 0);
}

export function getNextProfileQuestion(profile: CandidateProfile, locale: Locale = "ro"): {
  flowState: FlowState;
  question: string;
} {
  const copy = {
    ro: {
      education:
        "Incepem cu educatia. Ce studiezi sau ce ai absolvit? Spune-mi institutia, programul si perioada, pe scurt.",
      experience:
        "Care este cea mai relevanta experienta a ta pana acum? Poate fi job, internship, proiect, voluntariat sau activitate de leadership.",
      achievements:
        "Pentru experienta principala, care a fost un rezultat concret? Poate fi timp economisit, clienti ajutati, procese imbunatatite, bani economisiti sau un volum de lucru clar.",
      jobDescription:
        "Am suficiente informatii din CV pentru pasul urmator. Trimite descrierea jobului pentru care vrei sa adaptam CV-ul.",
      skills:
        "Ce competente vrei sa evidentiem? Scrie 5-8 competente tehnice, analitice sau de business, separate prin virgula.",
      languages:
        "Ce limbi straine vorbesti si la ce nivel? De exemplu: romana nativ, engleza C1, franceza B1.",
      final: "Profilul de baza este suficient pentru pasul urmator. Trimite descrierea jobului pentru care vrei sa adaptam CV-ul."
    },
    en: {
      education:
        "Let’s start with education. What are you studying or what did you graduate from? Share the institution, programme, and dates briefly.",
      experience:
        "What is your most relevant experience so far? It can be a job, internship, project, volunteering, or leadership activity.",
      achievements:
        "For your main experience, what was one concrete result? It could be time saved, clients supported, processes improved, money saved, or clear work volume.",
      jobDescription:
        "I have enough information from the CV for the next step. Send the job description you want to tailor the CV for.",
      skills: "Which skills should we highlight? Write 5-8 technical, analytical, or business skills separated by commas.",
      languages: "Which languages do you speak and at what level? For example: Romanian native, English C1, French B1.",
      final: "The base profile is ready for the next step. Send the job description you want to tailor the CV for."
    }
  }[locale];

  if (profile.education.length === 0) {
    return {
      flowState: "COLLECT_EDUCATION",
      question: copy.education
    };
  }

  if (profile.experience.length === 0 && profile.projects.length === 0) {
    return {
      flowState: "COLLECT_EXPERIENCE",
      question: copy.experience
    };
  }

  if (!hasMeaningfulEvidence(profile)) {
    return {
      flowState: "COLLECT_ACHIEVEMENTS",
      question: copy.achievements
    };
  }

  if (hasCoreCvMaterial(profile)) {
    return {
      flowState: "REQUEST_JOB_DESCRIPTION",
      question: copy.jobDescription
    };
  }

  if (profile.skills.length < 3) {
    return {
      flowState: "COLLECT_SKILLS",
      question: copy.skills
    };
  }

  if (profile.languages.length === 0) {
    return {
      flowState: "COLLECT_SKILLS",
      question: copy.languages
    };
  }

  return {
    flowState: "REQUEST_JOB_DESCRIPTION",
    question: copy.final
  };
}
