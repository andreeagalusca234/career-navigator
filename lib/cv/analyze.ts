import { generateGemmaJson, getGemmaModel, isGemmaConfigured } from "@/lib/ai/gemma";
import { getMissingProfileFields, hasMeaningfulEvidence } from "@/lib/cv/completeness";
import { evaluateLbsRules, improveBulletToLbsStyle } from "@/lib/cv/lbs-guidelines";
import { AnalysisSchema, type CandidateProfile, type CvAnalysis, type JobDescription } from "@/lib/cv/schemas";
import type { Locale } from "@/lib/i18n";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#. ]/gi, "").trim();
}

function overlap(profileSkills: string[], roleKeywords: string[]): string[] {
  const profileText = normalize(profileSkills.join(" "));
  return Array.from(new Set(roleKeywords.filter((keyword) => profileText.includes(normalize(keyword))))).slice(0, 8);
}

function missingKeywords(profileSkills: string[], roleKeywords: string[]): string[] {
  const profileText = normalize(profileSkills.join(" "));
  return Array.from(new Set(roleKeywords.filter((keyword) => !profileText.includes(normalize(keyword))))).slice(0, 8);
}

function profileSearchTerms(profile: CandidateProfile): string[] {
  return [
    ...profile.skills,
    ...profile.experience.flatMap((item) => [
      item.company,
      item.role,
      ...item.bullets.map((bullet) => `${bullet.raw} ${bullet.rewritten ?? ""}`)
    ]),
    ...profile.projects.flatMap((item) => [item.name, ...item.bullets.map((bullet) => bullet.raw)]),
    ...profile.leadership.flatMap((item) => [item.name, ...item.bullets.map((bullet) => bullet.raw)])
  ];
}

function analysisCopy(locale: Locale) {
  return {
    ro: {
      verdict: (score: number) => {
        if (score >= 85) return "Puternic, aproape gata de trimis dupa cateva editari mici.";
        if (score >= 70) return "Baza buna, dar are nevoie de imbunatatiri tintite pentru rol.";
        if (score >= 55) return "Riscant pentru recrutori. Cele mai bune dovezi nu ies inca suficient in fata.";
        return "Nu este inca pregatit pentru aplicare. Trebuie reconstruit in jurul rolului tinta.";
      },
      bulletCountFix: (total: number) => {
        if (total < 12) {
          return {
            title: "Completeaza experienta dupa standardul LBS",
            detail: `Ai ${total} bullet-uri in Business Experience. Tinta LBS este 12-15 in total, de obicei 3-4 pentru fiecare rol relevant.`
          };
        }
        if (total > 15) {
          return {
            title: "Taie pana la 12-15 bullet-uri",
            detail:
              "LBS recomanda 12-15 bullet-uri totale in Business Experience. Pastreaza numai dovezile cu impact, cifre si relevanta pentru rol."
          };
        }
        return {
          title: "Pastreaza densitatea LBS",
          detail: "Numarul de bullet-uri este in intervalul potrivit. Verifica acum calitatea CAR si relevanta pentru job."
        };
      },
      alignTitle: "Aliniaza limbajul cu rolul",
      alignDetail: (missing: string[]) =>
        `Adauga dovezi pentru: ${missing.slice(0, 5).join(", ")}. Acestea apar in descrierea jobului, dar nu sunt clare in CV.`,
      matchTitle: "Pastreaza potrivirea pe rol",
      matchDetail: "Competentele principale apar deja in CV. Urmatorul castig vine din dovezi mai concrete.",
      carTitle: "Aplica modelul CAR",
      carMissing: (count: number) =>
        `${count} bullet-uri nu arata complet Challenge, Action si Result. Incepe cu actiunea ta, apoi arata rezultatul in cifre cand exista.`,
      carOk: "Bullet-urile principale au actiune si rezultate. Pastreaza formularea concisa, fara jargon tehnic inutil.",
      actionVerbEvidence: "bullet-uri care incep cu verbe de actiune LBS",
      verbVariety: (verbs: string[]) => `varietate in verbele de actiune: ${verbs.join(", ")}`,
      languageIssues: "niveluri de limba standardizate: Native, Fluent sau Basic",
      rewriteReason:
        "Rescriere LBS: verb de actiune la inceput, o singura propozitie, CAR, rezultat cuantificat doar daca exista dovada reala.",
      priorities: [
        "Pastreaza CV-ul in template-ul LBS si tinteste o pagina.",
        "Transforma fiecare bullet important in format CAR: context scurt, actiunea ta, rezultat masurabil.",
        "Alege 12-15 bullet-uri de business in total, 3-4 per rol, prioritizate dupa jobul tinta.",
        "Adauga cuvintele-cheie reale din descrierea jobului doar unde sunt sustinute de experienta."
      ]
    },
    en: {
      verdict: (score: number) => {
        if (score >= 85) return "Strong and nearly ready to send after a few small edits.";
        if (score >= 70) return "Good base, but it needs targeted improvements for the role.";
        if (score >= 55) return "Risky for recruiters. The best evidence is not visible enough yet.";
        return "Not ready to apply yet. It needs to be rebuilt around the target role.";
      },
      bulletCountFix: (total: number) => {
        if (total < 12) {
          return {
            title: "Complete experience to the LBS standard",
            detail: `You have ${total} Business Experience bullets. The LBS target is 12-15 total, usually 3-4 for each relevant role.`
          };
        }
        if (total > 15) {
          return {
            title: "Cut down to 12-15 bullets",
            detail:
              "LBS recommends 12-15 total Business Experience bullets. Keep only evidence with impact, numbers, and role relevance."
          };
        }
        return {
          title: "Keep the LBS density",
          detail: "The bullet count is in the right range. Now check CAR quality and relevance to the job."
        };
      },
      alignTitle: "Align the language with the role",
      alignDetail: (missing: string[]) =>
        `Add evidence for: ${missing.slice(0, 5).join(", ")}. These appear in the job description but are not clear in the CV.`,
      matchTitle: "Keep the role fit",
      matchDetail: "The main skills already appear in the CV. The next gain comes from more concrete evidence.",
      carTitle: "Apply the CAR model",
      carMissing: (count: number) =>
        `${count} bullets do not fully show Challenge, Action, and Result. Start with your action, then show the result with numbers where real evidence exists.`,
      carOk: "The main bullets have action and results. Keep the wording concise, without unnecessary technical jargon.",
      actionVerbEvidence: "bullets that start with LBS action verbs",
      verbVariety: (verbs: string[]) => `variety in action verbs: ${verbs.join(", ")}`,
      languageIssues: "standardized language levels: Native, Fluent, or Basic",
      rewriteReason:
        "LBS rewrite: action verb first, one sentence, CAR structure, and quantified result only where there is real evidence.",
      priorities: [
        "Keep the CV in the LBS template and aim for one page.",
        "Turn every important bullet into CAR format: brief context, your action, measurable result.",
        "Choose 12-15 business bullets total, 3-4 per role, prioritized against the target job.",
        "Add real keywords from the job description only where your experience supports them."
      ]
    }
  }[locale];
}

function localizeMissingFields(fields: string[], locale: Locale): string[] {
  if (locale === "ro") return fields;

  const labels: Record<string, string> = {
    "numele complet": "full name",
    "o metoda de contact": "a contact method",
    educatia: "education",
    "experienta, proiecte sau voluntariat": "experience, projects, or volunteering",
    "rezultate masurabile": "measurable results",
    "competente relevante": "relevant skills",
    "limbi straine": "languages"
  };

  return fields.map((field) => labels[field] ?? field);
}

export function analyzeCv(profile: CandidateProfile, jobDescription: JobDescription, locale: Locale = "ro"): CvAnalysis {
  const text = analysisCopy(locale);
  const searchableProfile = profileSearchTerms(profile);
  const matched = overlap(searchableProfile, jobDescription.keywords);
  const missing = missingKeywords(searchableProfile, [
    ...jobDescription.requiredSkills,
    ...jobDescription.keywords
  ]);

  const hasExperience = profile.experience.length > 0 || profile.projects.length > 0;
  const evidence = hasMeaningfulEvidence(profile);
  const missingFields = localizeMissingFields(getMissingProfileFields(profile), locale);
  const lbs = evaluateLbsRules(profile, jobDescription);

  const score =
    35 +
    Math.min(20, matched.length * 4) +
    (hasExperience ? 15 : 0) +
    (evidence ? 15 : 0) +
    (profile.education.length ? 8 : 0) +
    (profile.languages.length ? 4 : 0) -
    Math.min(18, missing.length * 3) -
    lbs.scorePenalty;

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const weakBullets = profile.experience
    .flatMap((experience) => experience.bullets.map((bullet) => ({ company: experience.company, bullet })))
    .filter(({ bullet }) => bullet.evidenceLevel === "weak" || !bullet.rewritten)
    .slice(0, 5);

  return {
    score: boundedScore,
    verdict: text.verdict(boundedScore),
    topFixes: [
      missing.length
        ? {
            title: text.alignTitle,
            detail: text.alignDetail(missing)
          }
        : {
            title: text.matchTitle,
            detail: text.matchDetail
          },
      {
        title: text.carTitle,
        detail: lbs.missingCar.length ? text.carMissing(lbs.missingCar.length) : text.carOk
      },
      text.bulletCountFix(lbs.businessStats.total)
    ],
    missingEvidence: [
      ...missingFields,
      ...(lbs.missingActionVerb.length ? [text.actionVerbEvidence] : []),
      ...(lbs.repeatedStarts.length ? [text.verbVariety(lbs.repeatedStarts)] : []),
      ...(lbs.languageIssues.length ? [text.languageIssues] : [])
    ],
    roleMatch: {
      matched,
      missing
    },
    bulletRewrites: weakBullets.map(({ bullet }) => ({
      original: bullet.raw,
      rewrite: improveBulletToLbsStyle(bullet.raw),
      reason: text.rewriteReason
    })),
    priorities: text.priorities
  };
}

export async function analyzeCvWithGemma(
  profile: CandidateProfile,
  jobDescription: JobDescription,
  locale: Locale = "ro"
): Promise<{
  analysis: CvAnalysis;
  model: string;
  usedGemma: boolean;
}> {
  const fallback = analyzeCv(profile, jobDescription, locale);

  if (!isGemmaConfigured()) {
    return { analysis: fallback, model: "local-rubric", usedGemma: false };
  }

  try {
    const { data, model } = await generateGemmaJson(AnalysisSchema, {
      model: getGemmaModel("reasoning"),
      temperature: 0.15,
      thinking: true,
      systemInstruction:
        "You are an expert LBS-style CV reviewer. Use Gemma 4 reasoning to evaluate role fit, evidence quality, CAR bullet structure, and recruiter risk. Do not invent achievements, metrics, employers, dates, or skills. Return valid JSON only.",
      prompt: JSON.stringify({
        task:
          locale === "en"
            ? "Analyze this candidate profile against the target job. Keep feedback concise, specific, and evidence-grounded."
            : "Analizeaza acest profil fata de jobul tinta. Raspunde in romana, concret si bazat doar pe dovezile existente.",
        locale,
        requiredOutput: {
          score: "integer 0-100",
          verdict: "short verdict",
          topFixes: [{ title: "fix title", detail: "specific detail" }],
          missingEvidence: ["missing evidence item"],
          roleMatch: { matched: ["matched keyword"], missing: ["missing keyword"] },
          bulletRewrites: [{ original: "original bullet", rewrite: "improved CAR bullet", reason: "why" }],
          priorities: ["ranked next action"]
        },
        guardrails: [
          "Never invent metrics. If a metric is missing, ask for it or keep the statement qualitative.",
          "Tie every recommendation to the candidate profile or the job description.",
          "Use the selected locale for all human-readable text."
        ],
        fallbackRubricAnalysis: fallback,
        candidateProfile: profile,
        jobDescription
      })
    });

    return {
      analysis: AnalysisSchema.parse({
        ...data,
        topFixes: data.topFixes.length ? data.topFixes.slice(0, 4) : fallback.topFixes,
        missingEvidence: data.missingEvidence.length ? data.missingEvidence.slice(0, 8) : fallback.missingEvidence,
        bulletRewrites: data.bulletRewrites.length ? data.bulletRewrites.slice(0, 5) : fallback.bulletRewrites,
        priorities: data.priorities.length ? data.priorities.slice(0, 6) : fallback.priorities
      }),
      model,
      usedGemma: true
    };
  } catch {
    return { analysis: fallback, model: "local-rubric", usedGemma: false };
  }
}
