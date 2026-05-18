import { generateGemmaJson, getGemmaModel, isGemmaConfigured } from "@/lib/ai/gemma";
import { calculateCompleteness } from "@/lib/cv/completeness";
import { CandidateProfileSchema, type CandidateProfile, type JobDescription } from "@/lib/cv/schemas";
import { improveBulletToLbsStyle, selectLbsBusinessBullets } from "@/lib/cv/lbs-guidelines";
import { t, type Locale } from "@/lib/i18n";

export type TailoredCv = {
  profile: CandidateProfile;
  targetRole?: string;
  targetCompany?: string;
  headline: string;
  locale: Locale;
};

function prioritizeSkills(skills: string[], jobDescription: JobDescription): string[] {
  const keywords = new Set(jobDescription.keywords.map((keyword) => keyword.toLowerCase()));
  return [...skills].sort((a, b) => {
    const aMatch = keywords.has(a.toLowerCase()) ? 1 : 0;
    const bMatch = keywords.has(b.toLowerCase()) ? 1 : 0;
    return bMatch - aMatch || a.localeCompare(b);
  });
}

function normalizeLanguageLevel(level: string | undefined, locale: Locale): string | undefined {
  if (!level) return undefined;
  const text = t(locale).cv;
  if (/native|nativ/i.test(level)) return text.native;
  if (/fluent|bilingual|c1|c2|advanced|avansat/i.test(level)) return text.fluent;
  if (/basic|beginner|intermediate|a1|a2|b1|b2|baza|începător|incepator/i.test(level)) return text.basic;
  return level;
}

function keywordScore(text: string, jobDescription: JobDescription): number {
  const lower = text.toLowerCase();
  return [...jobDescription.keywords, ...jobDescription.requiredSkills].filter((keyword) =>
    lower.includes(keyword.toLowerCase())
  ).length;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function localizePlace(value: string, locale: Locale): string {
  if (locale === "en") return value;

  return value
    .replace(/\bLondon\b/g, "Londra")
    .replace(/\bGermany\b/g, "Germania")
    .replace(/\bRomania\b/g, "Romania")
    .replace(/\bCanada\b/g, "Canada")
    .replace(/\bRemote\b/g, "la distanta")
    .replace(/\bREMOTE\b/g, "la distanta");
}

function localizeTextForCv(value: string | undefined, locale: Locale): string | undefined {
  if (!value || locale === "en") return value;

  const trimmed = value.trim();
  const normalized = normalizeForMatch(trimmed);
  const exact: Record<string, string> = {
    "london business school, london, uk": "London Business School, Londra, UK",
    "babes-bolyai university (ubb), cluj-napoca, romania": "Universitatea Babes-Bolyai (UBB), Cluj-Napoca, Romania",
    "ulm university, ulm, germany (feb-mar)": "Universitatea Ulm, Ulm, Germania (feb.-mar.)",
    "retail goods company (canada, remote)": "Companie de bunuri de retail (Canada, la distanta)",
    "masters in analytics and management": "Master in Analitica si Management",
    "e-infra merit scholarship award (£20,000)": "Bursa de merit E-INFRA (£20.000)",
    "clubs & societies: data & ai club; tech club; women in business club; vp, central & eastern europe club":
      "Cluburi si societati: Clubul Date si IA; Clubul de Tehnologie; Clubul Femei in Afaceri; VP, Clubul Europa Centrala si de Est",
    "bachelor's degree in business administration (bba), thesis grade: 10/10, final exam grade: 10/10":
      "Licenta in Administrarea Afacerilor (BBA), nota lucrare de licenta: 10/10, nota examen final: 10/10",
    "performance scholarship (£4,000); full-tuition waiver (£7,000)":
      "Bursa de performanta (£4.000); scutire integrala de taxa de scolarizare (£7.000)",
    "erasmus+ study mobility faculty of mathematics and economics (scholarship - £4,000)":
      "Mobilitate de studiu Erasmus+, Facultatea de Matematica si Economie (bursa - £4.000)",
    "relevant courses: machine learning and decision making, emerging market finance, financial modelling":
      "Cursuri relevante: Invatare automata si luarea deciziilor, Finante pe piete emergente, Modelare financiara",
    "head of operations & payments analytics (full-time until aug 2025; part-time until jan 2026)":
      "Coordonator Operatiuni si Analiza Platilor (norma intreaga pana in aug. 2025; norma partiala pana in ian. 2026)",
    "project coordinator (8 months, 20hrs/week)": "Coordonator proiect (8 luni, 20 ore/saptamana)",
    "operations assistant (20hrs/week)": "Asistent operatiuni (20 ore/saptamana)",
    "projects": "Proiecte",
    "leadership": "Liderat",
    "google project management professional certificate course (oct 2023 - jan 2024)":
      "Certificat profesional Google Project Management (oct. 2023 - ian. 2024)",
    "microsoft azure data fundamentals certificate (jun 2022)":
      "Certificat Microsoft Azure Data Fundamentals (iun. 2022)",
    "excellentia award- recognised as one of the most active students at babes-bolyai university":
      "Premiul Excellentia - recunoscuta drept una dintre cele mai active studente la Universitatea Babes-Bolyai"
  };

  if (exact[normalized]) return exact[normalized];

  return localizePlace(trimmed, locale)
    .replace(/\bFull-Time\b/g, "full-time")
    .replace(/\bPart-Time\b/g, "part-time")
    .replace(/\buntil\b/g, "pana in")
    .replace(/\bScholarship\b/g, "Bursa")
    .replace(/\bRelevant courses\b/g, "Cursuri relevante")
    .replace(/\bFaculty\b/g, "Facultatea")
    .replace(/\bAwards?\b/g, "Premii")
    .replace(/\bCertificate\b/g, "Certificat");
}

function localizeLanguageName(value: string, locale: Locale): string {
  if (locale === "en") return value;
  const normalized = normalizeForMatch(value);
  const names: Record<string, string> = {
    romanian: "Romana",
    english: "Engleza",
    german: "Germana",
    russian: "Rusa",
    french: "Franceza",
    spanish: "Spaniola",
    italian: "Italiana"
  };
  return names[normalized] ?? value;
}

function localizeBulletForCv(value: string, locale: Locale, rawValue?: string): string {
  if (locale === "en") return value;

  const source = normalizeForMatch(`${rawValue ?? ""} ${value}`);
  const translatedBullets: Array<[RegExp, string]> = [
    [
      /investigated escalated merchant cases|payment disputes across 10\+ markets/,
      "Investigat cazuri complexe ale comerciantilor si dispute de plata in peste 10 piete, transformand concluziile in imbunatatiri de proces si contribuind la controale antifrauda la nivel de platforma"
    ],
    [
      /defined kpis|scalable operational frameworks|efficiency by 25/,
      "Definit KPI-uri si cadre operationale scalabile de la zero, crescand eficienta cu 25% si folosind instrumente de IA si automatizare pentru prioritizare si decizii bazate pe date"
    ],
    [
      /used sql|1,000\+ merchant accounts|recovered.*765k/,
      "Analizat cu SQL date de plati pentru peste 1.000 de conturi de comercianti, identificand tipare de frauda, pierderi de venit si anomalii comportamentale care au informat decizii de risc si au recuperat aproximativ £765k venit suplimentar"
    ],
    [
      /built dashboards|reports tracking key payments|senior stakeholders/,
      "Construit tablouri de bord si rapoarte pentru indicatori cheie de plati si operatiuni, prezentand perspective bazate pe date catre parti interesate senior din produs, inginerie si conformitate"
    ],
    [
      /tracked and analysed student performance|12% increase in client satisfaction/,
      "Analizat performanta studentilor pe clase si alocarea copiilor folosind Python, generand o crestere de 12% a satisfactiei clientilor"
    ],
    [
      /introduced agile scheduling|software estimation accuracy by 12/,
      "Introdus planificare agila, imbunatatind acuratetea estimarilor software cu 12%"
    ],
    [
      /redesigned crm workflow|17% enrolment growth/,
      "Reproiectat fluxul CRM, reducand timpii de raspuns si generand o crestere de 17% a inscrierilor"
    ],
    [
      /managed social media|e-commerce inventory|customer engagement by 10/,
      "Gestionat retelele sociale si inventarul de comert online, crescand implicarea clientilor cu 10% in T4 2022"
    ],
    [
      /implemented client support software|customer satisfaction by 25|response time by 19/,
      "Implementat software de suport clienti pentru telefon si retele sociale, imbunatatind satisfactia clientilor cu 25% in T3 2022 si reducand timpul de raspuns cu 19%"
    ],
    [
      /prepared financial reports|accounting documents|5 departments/,
      "Pregatit rapoarte financiare si documente contabile pentru a sustine operatiunile de afaceri in 5 departamente"
    ],
    [
      /recruitsmart|ai-driven recruitment platform|career insights/,
      "Dezvoltat RecruitSmart (LBS AI Lab), o platforma de recrutare bazata pe IA care combina optimizarea CV-ului, CRM de networking si urmarirea aplicatiilor pentru perspective de cariera personalizate si bazate pe date"
    ],
    [
      /rag-based chatbot|hugging face|structured datasets/,
      "Construit un chatbot RAG (Hugging Face) pentru interogarea si recuperarea informatiilor din seturi de date structurate, simuland sisteme de IA pentru suport clienti si management al cunostintelor"
    ],
    [
      /fraud detection system|streamlit app simulating real-time transaction monitoring/,
      "Construit si lansat un sistem integral de detectie a fraudei, antrenand modele ML de clasificare si dezvoltand o aplicatie Streamlit care simuleaza monitorizarea tranzactiilor in timp real, luarea deciziilor si alertele pe baza de reguli: https://credit-card-fraud-detection-ml-andreea.streamlit.app/"
    ],
    [
      /altos-style analytics application|operational workflows|structured decision/,
      "Dezvoltat o aplicatie de analiza in stil AltOS pentru modelarea fluxurilor operationale si sustinerea deciziilor structurate: https://altosapp.streamlit.app/"
    ],
    [
      /translated data workflows|productised interfaces|claude code/,
      "Transformat fluxuri de date in interfete de produs, folosind instrumente de IA (Claude Code) pentru prototipare rapida si iteratie"
    ],
    [
      /alfrey|social planning assistant|24 hours/,
      "Construit Alfrey (Hack LBS AI Hackathon), un asistent IA de planificare sociala care optimizeaza disponibilitatea grupurilor si recomanda locatii/activitati, livrand un MVP functional in 24 de ore intr-o echipa multifunctionala"
    ],
    [
      /student chancellor|student engagement by 56/,
      "Coordonat initiative ca reprezentant student al Facultatii de Afaceri, crescand implicarea studentilor cu 56% prin initiative tintite"
    ],
    [
      /sentra project leader|youth entrepreneurship/,
      "Coordonat proiectul SEntrA (Cipru), promovand antreprenoriatul in randul tinerilor prin programe de educatie non-formala"
    ]
  ];

  const translated = translatedBullets.find(([pattern]) => pattern.test(source))?.[1];
  if (translated) return translated;

  return value
    .replace(/^Analysed\b/i, "Analizat")
    .replace(/^Built\b/i, "Construit")
    .replace(/^Conducted\b/i, "Realizat")
    .replace(/^Created\b/i, "Creat")
    .replace(/^Delivered\b/i, "Livrat")
    .replace(/^Designed\b/i, "Proiectat")
    .replace(/^Developed\b/i, "Dezvoltat")
    .replace(/^Drove\b/i, "Generat")
    .replace(/^Evaluated\b/i, "Evaluat")
    .replace(/^Identified\b/i, "Identificat")
    .replace(/^Implemented\b/i, "Implementat")
    .replace(/^Improved\b/i, "Imbunatatit")
    .replace(/^Increased\b/i, "Crescut")
    .replace(/^Led\b/i, "Coordonat")
    .replace(/^Managed\b/i, "Gestionat")
    .replace(/^Modelled\b/i, "Modelat")
    .replace(/^Optimised\b/i, "Optimizat")
    .replace(/^Prepared\b/i, "Pregatit")
    .replace(/^Reduced\b/i, "Redus")
    .replace(/^Redesigned\b/i, "Reproiectat")
    .replace(/^Streamlined\b/i, "Eficientizat")
    .replace(/^Supported\b/i, "Sustinut");
}

function improveProjectBullets(profile: CandidateProfile, jobDescription: JobDescription, locale: Locale): CandidateProfile {
  return {
    ...profile,
    projects: profile.projects.map((project) => ({
      ...project,
      bullets: [...project.bullets]
        .sort((a, b) => keywordScore(b.raw, jobDescription) - keywordScore(a.raw, jobDescription))
        .slice(0, 4)
        .map((bullet) => ({
          ...bullet,
          rewritten: localizeBulletForCv(improveBulletToLbsStyle(bullet.rewritten || bullet.raw), locale, bullet.raw)
        }))
    })),
    leadership: profile.leadership.map((item) => ({
      ...item,
      bullets: item.bullets.slice(0, 2).map((bullet) => ({
        ...bullet,
        rewritten: localizeBulletForCv(improveBulletToLbsStyle(bullet.rewritten || bullet.raw), locale, bullet.raw)
      }))
    })),
    languages: profile.languages.map((language) => ({
      ...language,
      language: localizeLanguageName(language.language, locale),
      proficiency: normalizeLanguageLevel(language.proficiency, locale)
    }))
  };
}

function localizeBusinessBullets(profile: CandidateProfile, locale: Locale): CandidateProfile {
  return {
    ...profile,
    experience: profile.experience.map((experience) => ({
      ...experience,
      company: localizeTextForCv(experience.company, locale) ?? localizePlace(experience.company, locale),
      role: localizeTextForCv(experience.role, locale) ?? experience.role,
      location: localizePlace(experience.location ?? "", locale) || experience.location,
      bullets: experience.bullets.map((bullet) => ({
        ...bullet,
        rewritten: bullet.rewritten ? localizeBulletForCv(bullet.rewritten, locale, bullet.raw) : undefined
      }))
    }))
  };
}

function localizeProfileForCv(profile: CandidateProfile, locale: Locale): CandidateProfile {
  if (locale === "en") return profile;

  return {
    ...profile,
    education: profile.education.map((education) => ({
      ...education,
      institution: localizeTextForCv(education.institution, locale) ?? localizePlace(education.institution, locale),
      degree: localizeTextForCv(education.degree, locale),
      field: localizeTextForCv(education.field, locale),
      location: localizePlace(education.location ?? "", locale) || education.location,
      highlights: education.highlights.map((highlight) => localizeTextForCv(highlight, locale) ?? highlight)
    })),
    projects: profile.projects.map((project) => ({
      ...project,
      name: localizeTextForCv(project.name, locale) ?? project.name,
      role: localizeTextForCv(project.role, locale),
      description: localizeTextForCv(project.description, locale)
    })),
    leadership: profile.leadership.map((project) => ({
      ...project,
      name: localizeTextForCv(project.name, locale) ?? project.name,
      role: localizeTextForCv(project.role, locale),
      description: localizeTextForCv(project.description, locale)
    })),
    awards: profile.awards.map((award) => localizeTextForCv(award, locale) ?? award)
  };
}

export function generateTailoredCv(
  profile: CandidateProfile,
  jobDescription: JobDescription,
  locale: Locale = "ro"
): TailoredCv {
  const text = t(locale).cv;
  const targetRole = jobDescription.roleTitle;
  const targetCompany = jobDescription.company;
  const lbsProfile = localizeProfileForCv(improveProjectBullets(
    localizeBusinessBullets(selectLbsBusinessBullets(profile, jobDescription), locale),
    jobDescription,
    locale
  ), locale);
  const summaryBits = [
    targetRole
      ? locale === "en"
        ? `candidate focused on ${targetRole}`
        : `candidat orientat spre ${targetRole}`
      : text.earlyCareer,
    lbsProfile.skills.slice(0, 3).join(", "),
    lbsProfile.experience.length ? text.relevantExperience : text.relevantProjects
  ].filter(Boolean);

  return {
    profile: {
      ...lbsProfile,
      summary: lbsProfile.summary ?? `${text.summaryPrefix} ${summaryBits.join(", ")}. ${text.summarySuffix}`,
      skills: prioritizeSkills(lbsProfile.skills, jobDescription),
      awards: lbsProfile.awards.slice(0, 3)
    },
    targetRole,
    targetCompany,
    headline: targetCompany && targetRole ? `${targetRole} - ${targetCompany}` : targetRole ?? text.adaptedHeadline,
    locale
  };
}

export async function generateTailoredCvWithGemma(
  profile: CandidateProfile,
  jobDescription: JobDescription,
  locale: Locale = "ro"
): Promise<{
  tailoredCv: TailoredCv;
  model: string;
  usedGemma: boolean;
}> {
  const fallback = generateTailoredCv(profile, jobDescription, locale);

  if (!isGemmaConfigured()) {
    return { tailoredCv: fallback, model: "local-tailor", usedGemma: false };
  }

  try {
    const { data, model } = await generateGemmaJson(CandidateProfileSchema, {
      model: getGemmaModel("reasoning"),
      temperature: 0.2,
      thinking: true,
      systemInstruction:
        "You are an expert CV tailoring engine using Gemma 4. Rewrite only from evidence already present in the candidate profile. Follow London Business School CV style: concise, action-led, CAR where possible, no invented numbers. Return valid JSON only.",
      prompt: JSON.stringify({
        task:
          locale === "en"
            ? "Tailor this candidate profile to the job description. Preserve truthful facts, dates, employers, contact details, and real metrics."
            : "Adapteaza acest profil pentru descrierea jobului. Raspunde in romana si pastreaza strict faptele, datele, angajatorii, contactul si metricile reale.",
        locale,
        guardrails: [
          "Do not invent experience, education, certifications, technologies, awards, dates, or metrics.",
          "Keep bullets one sentence where possible.",
          "Prioritize the strongest role-relevant evidence.",
          "Return the complete CandidateProfile JSON shape."
        ],
        jobDescription,
        deterministicBaseProfile: fallback.profile
      })
    });

    const profile = CandidateProfileSchema.parse({
      ...data,
      contact: data.contact.email || data.contact.phone || data.contact.linkedin ? data.contact : fallback.profile.contact,
      fullName: data.fullName ?? fallback.profile.fullName,
      completenessScore: calculateCompleteness(data)
    });

    return {
      tailoredCv: {
        ...fallback,
        profile,
        headline: fallback.headline,
        locale
      },
      model,
      usedGemma: true
    };
  } catch {
    return { tailoredCv: fallback, model: "local-tailor", usedGemma: false };
  }
}
