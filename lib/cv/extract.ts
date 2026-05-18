import { calculateCompleteness } from "@/lib/cv/completeness";
import { CandidateProfileSchema, emptyCandidateProfile, type CandidateProfile } from "@/lib/cv/schemas";

const sectionHeadings = {
  education: /^\s*(education|educatie|studii|academic)\s*$/i,
  experience: /^\s*(business experience|experience|experienta|work experience|professional experience)\s*$/i,
  projects: /^\s*(projects|projecte|proiecte|projects and leadership)\s*$/i,
  additional: /^\s*(additional information|additional)\s*$/i,
  skills: /^\s*(skills|competente|technologies|tools|instrumente|tech skills)\s*$/i,
  languages: /^\s*(languages|limbi|language)\s*$/i
};

const dateLinePattern =
  /^(?:\d{4}\s*[-\u2013\u2014]\s*(?:\d{4}|present|prezent)|\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4})$/i;
const datePrefixPattern =
  /^(?<date>(?:\d{4}\s*[-\u2013\u2014]\s*(?:\d{4}|present|prezent)|\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}))\s+(?<rest>.+)$/i;
const rolePattern =
  /(head|manager|coordinator|assistant|analyst|analytics|operations|intern|associate|consultant|developer|engineer|specialist|lead|officer|director|founder|chancellor|project leader)/i;
const bulletPattern = /^\s*(?:[-*\u2022\uF0B7])\s*/;

function linesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeHeading(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return parsed.text ?? "";
  } catch {
    return "";
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value ?? "";
  } catch {
    return "";
  }
}

function findSection(lines: string[], heading: RegExp): string[] {
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return [];

  const rest = lines.slice(start + 1);
  const nextHeading = rest.findIndex((line) =>
    Object.values(sectionHeadings).some((candidate) => candidate.test(line))
  );

  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).slice(0, 18);
}

function sliceBetweenSections(lines: string[], startHeading: RegExp, endHeadings: RegExp[]): string[] {
  const start = lines.findIndex((line) => startHeading.test(line));
  if (start === -1) return [];

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => endHeadings.some((heading) => heading.test(line)));
  return end === -1 ? rest : rest.slice(0, end);
}

function isDateLine(line: string): boolean {
  return dateLinePattern.test(line.trim());
}

function splitDatePrefix(line: string): { date: string; rest: string } | null {
  const match = line.trim().match(datePrefixPattern);
  const date = match?.groups?.date?.trim();
  const rest = match?.groups?.rest?.trim();
  return date && rest ? { date, rest } : null;
}

function splitDateRange(line: string): { startDate?: string; endDate?: string } {
  const parts = line.split(/\s*[-\u2013\u2014]\s*/).map((part) => part.trim());
  if (parts.length >= 2) {
    return { startDate: parts[0], endDate: parts.slice(1).join(" - ") };
  }
  return { startDate: line.trim() };
}

function splitEntriesByDate(lines: string[]): Array<{ date: string; lines: string[] }> {
  const entries: Array<{ date: string; lines: string[] }> = [];

  for (const line of lines) {
    const prefixedDate = splitDatePrefix(line);

    if (prefixedDate) {
      entries.push({ date: prefixedDate.date, lines: [prefixedDate.rest] });
    } else if (isDateLine(line)) {
      entries.push({ date: line, lines: [] });
    } else if (entries.length) {
      entries[entries.length - 1].lines.push(line);
    }
  }

  return entries.filter((entry) => entry.lines.length > 0);
}

function parseSkills(lines: string[]): string[] {
  return Array.from(
    new Set(
      lines
        .flatMap((line) => line.split(/[,;|]/))
        .map((item) => item.trim())
        .filter((item) => item.length > 1 && item.length < 50)
    )
  ).slice(0, 24);
}

function parseLanguages(lines: string[]) {
  return lines
    .flatMap((line) => line.split(/[,;|]/))
    .map((item) => item.trim())
    .filter((item) => item.length > 1)
    .slice(0, 8)
    .map((item) => {
      const match = item.match(/^([A-Za-z ]+)(?:\(([^)]+)\)|\s+-\s+(.+))?$/);
      return {
        language: match?.[1]?.trim() || item,
        proficiency: match?.[2]?.trim() || match?.[3]?.trim()
      };
    });
}

function isBulletLine(line: string): boolean {
  return bulletPattern.test(line);
}

function mergeContinuation(current: string, next: string): string {
  const trimmed = current.trim();
  const prefix = trimmed.endsWith("-") ? trimmed.slice(0, -1) : trimmed;
  return `${prefix} ${next.trim()}`.replace(/\s+/g, " ").trim();
}

function mergeWrappedBullets(lines: string[]): string[] {
  const bullets: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isBulletLine(trimmed)) {
      bullets.push(trimmed.replace(bulletPattern, "").trim());
      continue;
    }

    if (bullets.length) {
      bullets[bullets.length - 1] = mergeContinuation(bullets[bullets.length - 1], trimmed);
    }
  }

  return bullets;
}

function evidenceLevel(text: string): "weak" | "medium" | "strong" {
  if (/\d|[\u00A3\u20AC$]/.test(text)) return "strong";
  if (
    /built|created|developed|improved|managed|coordinated|analysed|analyzed|led|oversaw|performed|conducted|redesigned|introduced|implemented|prepared|dezvoltat|imbunatatit|coordonat/i.test(
      text
    )
  ) {
    return "medium";
  }
  return "weak";
}

function parseBullet(line: string) {
  return {
    raw: line.replace(bulletPattern, ""),
    evidenceLevel: evidenceLevel(line),
    metrics: line.match(/\b\d+([.,]\d+)?\s?%?\b|[~\u00A3\u20AC$]\s?\d+[kKmM]?\b/g) ?? []
  };
}

function parseEducation(lines: string[]) {
  return splitEntriesByDate(lines)
    .map((entry) => {
      const { startDate, endDate } = splitDateRange(entry.date);
      const [institutionLine, ...details] = entry.lines;
      const degreeIndex = details.findIndex((line) =>
        /(master|bachelor|bsc|msc|mba|degree|erasmus|faculty|programme|management|administration)/i.test(line)
      );
      const degree = degreeIndex >= 0 ? details[degreeIndex] : details[0];
      const highlights = details.filter((line, index) => index !== degreeIndex && line !== degree).slice(0, 6);

      return {
        institution: institutionLine ?? "Education",
        degree,
        startDate,
        endDate,
        highlights
      };
    })
    .slice(0, 5);
}

function parseExperience(lines: string[]) {
  return splitEntriesByDate(lines)
    .map((entry) => {
      const { startDate, endDate } = splitDateRange(entry.date);
      const cleanLines = entry.lines.filter(Boolean);
      const company = cleanLines[0] ?? "Experience";
      const roleIndex = cleanLines.findIndex((line, index) => index > 0 && rolePattern.test(line));
      const role = roleIndex >= 0 ? cleanLines[roleIndex] : cleanLines[1] ?? "Role";
      const location = company.match(/\(([^)]+)\)/)?.[1];
      const bulletLines = cleanLines.slice(roleIndex >= 0 ? roleIndex + 1 : 2);
      const bullets = mergeWrappedBullets(bulletLines);

      return {
        company: company.replace(/\s+/g, " "),
        role,
        location,
        startDate,
        endDate,
        bullets: bullets.slice(0, 7).map(parseBullet)
      };
    })
    .slice(0, 6);
}

function parseProjects(lines: string[]) {
  const firstBullet = lines.findIndex(isBulletLine);
  const projectLines =
    firstBullet >= 0 ? lines.slice(firstBullet) : lines.filter((line) => !/^(ai|product|projects?)\b/i.test(line));
  const bullets = mergeWrappedBullets(projectLines);

  if (!bullets.length) return [];

  return [
    {
      name: lines.find((line) => /project/i.test(line)) ?? "AI & Product Projects",
      bullets: bullets.slice(0, 8).map(parseBullet),
      technologies: []
    }
  ];
}

function parseAdditional(lines: string[]) {
  const leadershipLines: string[] = [];
  const skillLines: string[] = [];
  const languageLines: string[] = [];
  const awardLines: string[] = [];
  let current: "leadership" | "awards" | "" = "";

  for (const line of lines) {
    const trimmed = line.trim();
    const key = normalizeHeading(trimmed);

    if (key === "certificates" || key === "certificatesawards" || key === "awards") {
      current = "awards";
      continue;
    }

    if (key === "interests") {
      current = "";
      continue;
    }

    if (trimmed === "&") continue;

    const leadershipMatch = trimmed.match(/^Leadership\s+(.+)$/i);
    if (leadershipMatch) {
      current = "leadership";
      leadershipLines.push(leadershipMatch[1]);
      continue;
    }

    const skillsMatch = trimmed.match(/^(?:Tech Skills|Skills)\s+(.+)$/i);
    if (skillsMatch) {
      skillLines.push(skillsMatch[1]);
      current = "";
      continue;
    }

    const languagesMatch = trimmed.match(/^Languages\s+(.+)$/i);
    if (languagesMatch) {
      languageLines.push(languagesMatch[1]);
      current = "";
      continue;
    }

    if (key === "leadership") {
      current = "leadership";
      continue;
    }

    if (current === "leadership") leadershipLines.push(trimmed);
    if (current === "awards") awardLines.push(trimmed);
  }

  return {
    leadership: leadershipLines.length
      ? [
          {
            name: "Leadership",
            bullets: mergeWrappedBullets(leadershipLines).slice(0, 5).map(parseBullet),
            technologies: []
          }
        ]
      : [],
    skills: parseSkills(skillLines),
    languages: parseLanguages(languageLines),
    awards: awardLines.map((line) => line.replace(bulletPattern, "").trim()).filter(Boolean).slice(0, 8)
  };
}

export function extractCandidateProfileFromText(text: string): CandidateProfile {
  const lines = linesFromText(text);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim();
  const linkedin = text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/i)?.[0];
  const fullName = lines.find(
    (line) =>
      !sectionHeadings.education.test(line) &&
      /^[A-Z][A-Za-z .'-]{4,70}$/.test(line) &&
      line.split(/\s+/).length <= 5
  );

  const educationLines = sliceBetweenSections(lines, sectionHeadings.education, [
    sectionHeadings.experience,
    sectionHeadings.projects,
    sectionHeadings.additional
  ]);
  const experienceLines = sliceBetweenSections(lines, sectionHeadings.experience, [
    sectionHeadings.projects,
    sectionHeadings.additional
  ]);
  const projectLines = sliceBetweenSections(lines, sectionHeadings.projects, [sectionHeadings.additional]);
  const additionalLines = sliceBetweenSections(lines, sectionHeadings.additional, []);
  const skillLines = findSection(lines, sectionHeadings.skills);
  const languageLines = findSection(lines, sectionHeadings.languages);
  const additional = parseAdditional(additionalLines);

  const profile = CandidateProfileSchema.parse({
    ...emptyCandidateProfile(),
    fullName,
    contact: {
      email,
      phone,
      linkedin
    },
    education: parseEducation(educationLines),
    experience: parseExperience(experienceLines),
    projects: parseProjects(projectLines),
    leadership: additional.leadership,
    skills: additional.skills.length ? additional.skills : parseSkills(skillLines),
    languages: additional.languages.length ? additional.languages : parseLanguages(languageLines),
    awards: additional.awards
  });

  return CandidateProfileSchema.parse({
    ...profile,
    completenessScore: calculateCompleteness(profile)
  });
}

export async function extractCandidateProfileFromFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{
  profile: CandidateProfile;
  extractedTextLength: number;
}> {
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx");
  const text = isDocx ? await extractDocxText(buffer) : await extractPdfText(buffer);
  const profile = text ? extractCandidateProfileFromText(text) : emptyCandidateProfile();

  return {
    profile,
    extractedTextLength: text.length
  };
}
