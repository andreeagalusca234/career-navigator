import { generateGemmaJson, getGemmaModel, isGemmaConfigured } from "@/lib/ai/gemma";
import { JobDescriptionSchema, type JobDescription } from "@/lib/cv/schemas";
import type { Locale } from "@/lib/i18n";

const knownSkills = [
  "Excel",
  "PowerPoint",
  "SQL",
  "Python",
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Tableau",
  "Power BI",
  "Google Analytics",
  "financial modeling",
  "financial modelling",
  "market research",
  "stakeholder management",
  "project management",
  "stakeholder management",
  "data analysis",
  "machine learning",
  "communication",
  "leadership",
  "consulting",
  "strategy"
];

const keywordStopwords = new Set([
  "requirements",
  "responsibilities",
  "associate",
  "intern",
  "role",
  "job",
  "build",
  "support",
  "improve",
  "coordinate",
  "execution",
  "business",
  "data"
]);

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sentenceLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n|(?<=\.)\s+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 10);
}

export function ingestJobDescription(rawText: string): JobDescription {
  const lines = sentenceLines(rawText);
  const firstUsefulLine = lines.find((line) => line.length < 100) ?? rawText.split(/\r?\n/)[0] ?? "";
  const lower = rawText.toLowerCase();

  const roleLine =
    lines.find((line) =>
      /(intern|analyst|consultant|developer|engineer|manager|specialist|associate|product|finance|marketing|data)/i.test(
        line
      )
    ) ?? firstUsefulLine;

  const companyMatch = rawText.match(/(?:company|compania|at|la)\s+([A-Z][A-Za-z0-9&.\- ]{2,40})/);
  const locationMatch = rawText.match(/(?:location|locatie|locație)\s*[:\-]\s*([A-Za-zĂÂÎȘȚăâîșț,\- ]{2,60})/i);

  const requiredSkills = knownSkills.filter((skill) => lower.includes(skill.toLowerCase()));
  const responsibilities = lines
    .filter((line) => /(responsib|vei|you will|own|build|manage|analy[sz]e|develop|support|coordinate)/i.test(line))
    .slice(0, 8);
  const recruiterSignals = lines
    .filter((line) => /(must|required|cerint|strong|excellent|preferred|ideal|looking for|cautam)/i.test(line))
    .slice(0, 8);

  const seniority =
    rawText.match(/\b(internship|intern|junior|entry[- ]level|graduate|associate|senior|lead|manager)\b/i)?.[0] ??
    undefined;

  const keywords = unique([
    ...requiredSkills,
    ...(roleLine.match(/[A-Z][A-Za-z+.#-]{1,20}/g) ?? []),
    ...(rawText.match(/\b[A-Za-z][A-Za-z+-]{3,}\b/g) ?? []).slice(0, 25)
  ])
    .filter((keyword) => !keywordStopwords.has(keyword.toLowerCase().replace(/[^a-z]/g, "")))
    .slice(0, 18);

  return JobDescriptionSchema.parse({
    rawText,
    company: companyMatch?.[1]?.trim(),
    roleTitle: roleLine.trim(),
    location: locationMatch?.[1]?.trim(),
    seniority,
    requiredSkills,
    preferredSkills: recruiterSignals.filter((line) => /preferred|nice|avantaj|plus/i.test(line)).slice(0, 6),
    responsibilities,
    keywords,
    recruiterSignals,
    risks: []
  });
}

export async function ingestJobDescriptionWithGemma(rawText: string, locale: Locale): Promise<{
  jobDescription: JobDescription;
  model: string;
  usedGemma: boolean;
}> {
  const fallback = ingestJobDescription(rawText);

  if (!isGemmaConfigured()) {
    return { jobDescription: fallback, model: "local-parser", usedGemma: false };
  }

  try {
    const { data, model } = await generateGemmaJson(JobDescriptionSchema, {
      model: getGemmaModel("fast"),
      temperature: 0.1,
      systemInstruction:
        "You are a precise career-data extraction engine. Extract only information that appears in the job description. Return valid JSON only. Do not invent employer names, requirements, skills, or seniority.",
      prompt: JSON.stringify({
        task:
          locale === "en"
            ? "Extract the target role from this job description for CV tailoring."
            : "Extrage rolul tinta din aceasta descriere de job pentru adaptarea CV-ului.",
        outputShape: {
          rawText: "original job description text",
          company: "company name if explicit",
          roleTitle: "role title if explicit",
          location: "location if explicit",
          seniority: "seniority if explicit",
          requiredSkills: ["hard and soft skills explicitly required"],
          preferredSkills: ["nice-to-have skills"],
          responsibilities: ["main responsibilities"],
          keywords: ["ATS/recruiter keywords"],
          recruiterSignals: ["signals recruiters will look for"],
          risks: ["candidate-risk signals or missing evidence areas"]
        },
        jobDescription: rawText
      })
    });

    return {
      jobDescription: JobDescriptionSchema.parse({
        ...fallback,
        ...data,
        rawText,
        requiredSkills: data.requiredSkills.length ? data.requiredSkills : fallback.requiredSkills,
        responsibilities: data.responsibilities.length ? data.responsibilities : fallback.responsibilities,
        keywords: data.keywords.length ? data.keywords : fallback.keywords,
        recruiterSignals: data.recruiterSignals.length ? data.recruiterSignals : fallback.recruiterSignals
      }),
      model,
      usedGemma: true
    };
  } catch {
    return { jobDescription: fallback, model: "local-parser", usedGemma: false };
  }
}
