import type { CandidateProfile, JobDescription } from "@/lib/cv/schemas";

export const lbsActionVerbs = [
  "Accelerated",
  "Achieved",
  "Analysed",
  "Built",
  "Conducted",
  "Created",
  "Delivered",
  "Designed",
  "Developed",
  "Drove",
  "Established",
  "Evaluated",
  "Executed",
  "Facilitated",
  "Generated",
  "Identified",
  "Implemented",
  "Improved",
  "Increased",
  "Led",
  "Managed",
  "Modelled",
  "Monitored",
  "Negotiated",
  "Optimised",
  "Oversaw",
  "Performed",
  "Prepared",
  "Prioritised",
  "Reduced",
  "Redesigned",
  "Resolved",
  "Restructured",
  "Secured",
  "Streamlined",
  "Supported",
  "Transformed"
];

export const lbsCoreCompetencies = [
  "Analytical thinking",
  "Commercial awareness",
  "Communication",
  "Financial modelling",
  "Influence",
  "Initiative",
  "Leadership",
  "Negotiation",
  "Problem solving",
  "Project management",
  "Quantitative ability",
  "Stakeholder management",
  "Strategic thinking",
  "Team work"
];

const approvedLanguageLevels = ["native", "fluent", "basic"];
const weakVerbStarts = [
  "assisted",
  "helped",
  "responsible",
  "worked",
  "involved",
  "participated",
  "supported"
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+.#%£€$ ]/g, "").trim();
}

function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") ?? "";
}

export function startsWithActionVerb(bullet: string): boolean {
  const start = firstWord(bullet).toLowerCase();
  return lbsActionVerbs.some((verb) => verb.toLowerCase() === start);
}

export function startsWithWeakVerb(bullet: string): boolean {
  const start = normalize(bullet).split(/\s+/).slice(0, 2).join(" ");
  return weakVerbStarts.some((verb) => start.startsWith(verb));
}

export function hasQuantifiedResult(bullet: string): boolean {
  return /\b\d+([.,]\d+)?\s?%?\b|[£€$]\s?\d+|\b\d+\+|\b\d+\s?(markets|countries|clients|customers|stakeholders|teams|departments|students|users|hours|days|weeks|months)\b/i.test(
    bullet
  );
}

export function hasResultLanguage(bullet: string): boolean {
  return /increased|reduced|improved|delivered|delivering|generated|saved|recovered|enabled|secured|achieved|created|driving|resulting|leading to|to achieve|ensuring|cutting|sizing|prioritising|prioritizing|optimising|optimizing|adherence|satisfaction|growth|efficiency/i.test(
    bullet
  );
}

export function hasCarShape(bullet: string): boolean {
  return startsWithActionVerb(bullet) && hasResultLanguage(bullet) && hasQuantifiedResult(bullet);
}

export function bulletWordCount(bullet: string): number {
  return bullet.trim().split(/\s+/).filter(Boolean).length;
}

export function isLikelyTooShortForLbs(bullet: string): boolean {
  return bulletWordCount(bullet) < 16;
}

export function isLikelyTooLongForLbs(bullet: string): boolean {
  return bulletWordCount(bullet) > 38;
}

export function pickActionVerbForBullet(bullet: string): string {
  const lower = normalize(bullet);
  if (/model|forecast|financial|analysis|analys/.test(lower)) return "Analysed";
  if (/build|develop|created|app|platform|system|dashboard|workflow/.test(lower)) return "Developed";
  if (/lead|team|stakeholder|coordinate|oversaw/.test(lower)) return "Led";
  if (/reduce|cut|streamline|optimis|improve/.test(lower)) return "Improved";
  if (/market|segment|research|evaluat/.test(lower)) return "Evaluated";
  if (/implement|introduc|launch/.test(lower)) return "Implemented";
  if (/prepare|report|presentation|material/.test(lower)) return "Prepared";
  return "Delivered";
}

export function improveBulletToLbsStyle(rawBullet: string): string {
  const bullet = rawBullet.trim().replace(/\.$/, "");
  if (!bullet) return bullet;

  const hasStrongStart = startsWithActionVerb(bullet) && !startsWithWeakVerb(bullet);
  const starter = hasStrongStart ? firstWord(bullet) : pickActionVerbForBullet(bullet);
  const body = hasStrongStart ? bullet.replace(new RegExp(`^${starter}\\s+`, "i"), "") : bullet;
  const cleaned = body.charAt(0).toLowerCase() + body.slice(1);

  return `${starter} ${cleaned}`.replace(/\s+/g, " ").trim();
}

export function getBusinessBulletStats(profile: CandidateProfile): {
  total: number;
  perRole: Array<{ role: string; count: number }>;
} {
  return {
    total: profile.experience.reduce((total, item) => total + item.bullets.length, 0),
    perRole: profile.experience.map((item) => ({
      role: item.role,
      count: item.bullets.length
    }))
  };
}

export function selectLbsBusinessBullets(profile: CandidateProfile, jobDescription?: JobDescription): CandidateProfile {
  const keywords = new Set((jobDescription?.keywords ?? []).map(normalize));
  let remainingBudget = 15;

  const experience = profile.experience.map((item) => {
    const sortedBullets = [...item.bullets].sort((a, b) => {
      const aText = normalize(`${a.raw} ${a.rewritten ?? ""}`);
      const bText = normalize(`${b.raw} ${b.rewritten ?? ""}`);
      const aKeywordScore = [...keywords].filter((keyword) => keyword && aText.includes(keyword)).length;
      const bKeywordScore = [...keywords].filter((keyword) => keyword && bText.includes(keyword)).length;
      const aMetricScore = hasQuantifiedResult(a.raw) ? 1 : 0;
      const bMetricScore = hasQuantifiedResult(b.raw) ? 1 : 0;
      return bKeywordScore + bMetricScore - (aKeywordScore + aMetricScore);
    });

    const idealCount = Math.min(sortedBullets.length, item.bullets.length >= 4 ? 4 : item.bullets.length);
    const count = Math.min(idealCount || sortedBullets.length, remainingBudget);
    remainingBudget -= count;

    return {
      ...item,
      bullets: sortedBullets.slice(0, count).map((bullet) => ({
        ...bullet,
        rewritten: improveBulletToLbsStyle(bullet.rewritten || bullet.raw)
      }))
    };
  });

  return {
    ...profile,
    experience
  };
}

export function evaluateLbsRules(profile: CandidateProfile, jobDescription?: JobDescription) {
  const businessStats = getBusinessBulletStats(profile);
  const businessBullets = profile.experience.flatMap((experience) =>
    experience.bullets.map((bullet) => ({
      role: experience.role,
      text: bullet.rewritten || bullet.raw
    }))
  );
  const repeatedStarts = businessBullets
    .map((bullet) => firstWord(bullet.text).toLowerCase())
    .filter(Boolean)
    .filter((word, index, words) => words.indexOf(word) !== index);
  const missingActionVerb = businessBullets.filter((bullet) => !startsWithActionVerb(bullet.text));
  const missingCar = businessBullets.filter((bullet) => !hasCarShape(bullet.text));
  const tooShort = businessBullets.filter((bullet) => isLikelyTooShortForLbs(bullet.text));
  const tooLong = businessBullets.filter((bullet) => isLikelyTooLongForLbs(bullet.text));
  const weakStarts = businessBullets.filter((bullet) => startsWithWeakVerb(bullet.text));
  const languageIssues = profile.languages.filter(
    (language) => language.proficiency && !approvedLanguageLevels.includes(language.proficiency.toLowerCase())
  );
  const jobKeywords = jobDescription ? [...jobDescription.requiredSkills, ...jobDescription.keywords] : [];
  const profileText = normalize(
    [
      profile.skills.join(" "),
      ...businessBullets.map((bullet) => bullet.text),
      ...profile.projects.flatMap((project) => project.bullets.map((bullet) => bullet.raw))
    ].join(" ")
  );
  const missingJobKeywords = jobKeywords.filter((keyword) => !profileText.includes(normalize(keyword))).slice(0, 8);

  return {
    businessStats,
    missingActionVerb,
    missingCar,
    tooShort,
    tooLong,
    weakStarts,
    repeatedStarts: Array.from(new Set(repeatedStarts)),
    languageIssues,
    missingJobKeywords,
    scorePenalty:
      Math.min(6, missingCar.length) +
      Math.min(5, missingActionVerb.length) +
      Math.min(4, weakStarts.length * 2) +
      (businessStats.total < 8 ? 5 : businessStats.total < 12 ? 2 : 0) +
      (businessStats.total > 15 ? 4 : 0) +
      (languageIssues.length ? 2 : 0)
  };
}

export const lbsGuidelineSummary = [
  "Use the LBS template and keep the CV to one page.",
  "Write education and business experience in reverse chronological order.",
  "Business experience should usually contain 12-15 bullets total, with 3-4 per role.",
  "Each bullet should be one continuous sentence, action-led, CAR-shaped, and quantified where possible.",
  "Show transferable skills and impact rather than technical jargon.",
  "Avoid repeating the same action verb across many bullets.",
  "Put languages in Additional Information and use Native, Fluent, or Basic proficiency labels.",
  "Include academic awards in Education and prioritise only the most signal-rich distinctions."
];
