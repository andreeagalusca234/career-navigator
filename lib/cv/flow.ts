import {
  CandidateProfileSchema,
  emptyCandidateProfile,
  type CandidateProfile,
  type FlowState
} from "@/lib/cv/schemas";
import { calculateCompleteness, getNextProfileQuestion } from "@/lib/cv/completeness";
import type { Locale } from "@/lib/i18n";

const metricPattern = /(\b\d+([.,]\d+)?\s?%?\b|\b[0-9]+\s?(lei|eur|euro|ron|clienti|ore|zile|saptamani|luni|utilizatori)\b)/gi;

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]| si | și /i)
    .map((item) => item.trim())
    .filter((item) => item.length > 1)
    .slice(0, 12);
}

function detectEvidenceLevel(text: string): "weak" | "medium" | "strong" {
  const metrics = text.match(metricPattern) ?? [];
  if (metrics.length > 0) return "strong";
  if (/imbunatat|crescut|redus|optimiz|automatiz|livrat|coordonat|analizat|dezvoltat/i.test(text)) {
    return "medium";
  }
  return "weak";
}

function extractMetrics(text: string): string[] {
  return Array.from(new Set(text.match(metricPattern) ?? [])).slice(0, 6);
}

function isDeferral(text: string): boolean {
  return /^(nu acum|mai tarziu|later|skip|sari peste|nu stiu acum)$/i.test(text.trim());
}

function pointsBackToUploadedCv(text: string): boolean {
  return /(cv|document|fisier|fișier).*(acolo|incarcat|încărcat|trimis|shared|deja)|verifica cv|verifică cv|it's in the cv|already in/i.test(
    text
  );
}

function parseEducation(message: string) {
  const degree = message.match(/(licenta|master|mba|bachelor|facultate|colegiu|liceu|doctorat)/i)?.[0];
  const institutionMatch = message.match(/(?:la|din|@)\s+([^,.]+)(?:,|\.|$)/i);

  return {
    institution: institutionMatch?.[1]?.trim() || message.split(/[,.]/)[0]?.trim() || "Educatie",
    degree,
    highlights: [message.trim()]
  };
}

function parseExperience(message: string) {
  const companyMatch = message.match(/(?:la|@)\s+([A-ZĂÂÎȘȚA-Za-z0-9&.\- ]{2,40})/);
  const roleMatch = message.match(
    /(intern|analyst|consultant|developer|engineer|manager|specialist|voluntar|coordonator|asistent|associate|product|marketing|finance|data)[A-ZĂÂÎȘȚa-zăâîșț ]*/i
  );
  const metrics = extractMetrics(message);

  return {
    company: companyMatch?.[1]?.trim() || "Experienta relevanta",
    role: roleMatch?.[0]?.trim() || "Rol relevant",
    bullets: [
      {
        raw: message.trim(),
        evidenceLevel: detectEvidenceLevel(message),
        metrics
      }
    ]
  };
}

function parseLanguages(message: string) {
  return splitList(message).map((item) => {
    const [language, proficiency] = item.split(/\s+-\s+|\s+/);
    return {
      language: language.trim(),
      proficiency: proficiency?.trim()
    };
  });
}

export function applyConversationalAnswer(
  currentProfile: CandidateProfile | undefined,
  message: string,
  flowState: FlowState
): CandidateProfile {
  const profile = CandidateProfileSchema.parse(currentProfile ?? emptyCandidateProfile());
  const text = message.trim();

  if (!text || isDeferral(text) || pointsBackToUploadedCv(text)) {
    return profile;
  }

  if (!profile.fullName && text.length < 80 && /^[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț\-\s]+$/.test(text)) {
    profile.fullName = text;
  }

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) profile.contact.email = email;

  const linkedin = text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/i)?.[0];
  if (linkedin) profile.contact.linkedin = linkedin;

  if (flowState === "COLLECT_EDUCATION" || profile.education.length === 0) {
    profile.education = [...profile.education, parseEducation(text)].slice(0, 4);
  } else if (flowState === "COLLECT_EXPERIENCE") {
    profile.experience = [parseExperience(text), ...profile.experience].slice(0, 6);
  } else if (flowState === "COLLECT_ACHIEVEMENTS") {
    const target = profile.experience[0];
    const bullet = {
      raw: text,
      evidenceLevel: detectEvidenceLevel(text),
      metrics: extractMetrics(text)
    };

    if (target) {
      target.bullets = [bullet, ...target.bullets].slice(0, 8);
    } else {
      profile.projects = [
        {
          name: "Proiect relevant",
          bullets: [bullet],
          technologies: []
        },
        ...profile.projects
      ].slice(0, 4);
    }
  } else if (flowState === "COLLECT_SKILLS") {
    if (/engleza|romana|franceza|germana|spaniola|italiana|c1|c2|b1|b2|a1|a2|nativ/i.test(text)) {
      profile.languages = [...profile.languages, ...parseLanguages(text)].slice(0, 8);
    } else {
      profile.skills = Array.from(new Set([...profile.skills, ...splitList(text)])).slice(0, 18);
    }
  } else if (/skill|competent|react|sql|excel|python|java|strategie|analiza|comunicare/i.test(text)) {
    profile.skills = Array.from(new Set([...profile.skills, ...splitList(text)])).slice(0, 18);
  }

  profile.completenessScore = calculateCompleteness(profile);
  return CandidateProfileSchema.parse(profile);
}

export function decideNextStep(profile: CandidateProfile, locale: Locale = "ro"): {
  flowState: FlowState;
  assistantMessage: string;
} {
  const next = getNextProfileQuestion(profile, locale);
  return {
    flowState: next.flowState,
    assistantMessage: next.question
  };
}

export function looksLikeJobDescription(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    message.length > 350 ||
    /responsibilities|requirements|cerinte|responsabilitati|qualifications|descrierea jobului|job description|about the role/.test(
      normalized
    )
  );
}
