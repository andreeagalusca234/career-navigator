import { z } from "zod";
import type { Locale } from "@/lib/i18n";

export const EvidenceLevelSchema = z.enum(["weak", "medium", "strong"]);

export const BulletSchema = z.object({
  raw: z.string().min(1),
  rewritten: z.string().optional(),
  evidenceLevel: EvidenceLevelSchema.default("weak"),
  metrics: z.array(z.string()).default([])
});

export const EducationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().optional(),
  field: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.string().optional(),
  highlights: z.array(z.string()).default([])
});

export const ExperienceSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  bullets: z.array(BulletSchema).default([])
});

export const ProjectSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  description: z.string().optional(),
  bullets: z.array(BulletSchema).default([]),
  technologies: z.array(z.string()).default([])
});

export const LanguageSchema = z.object({
  language: z.string().min(1),
  proficiency: z.string().optional()
});

export const CandidateProfileSchema = z.object({
  fullName: z.string().optional(),
  contact: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
      linkedin: z.string().optional()
    })
    .default({}),
  summary: z.string().optional(),
  education: z.array(EducationSchema).default([]),
  experience: z.array(ExperienceSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  leadership: z.array(ProjectSchema).default([]),
  skills: z.array(z.string()).default([]),
  languages: z.array(LanguageSchema).default([]),
  awards: z.array(z.string()).default([]),
  completenessScore: z.number().int().min(0).max(100).default(0)
});

export const JobDescriptionSchema = z.object({
  rawText: z.string().default(""),
  company: z.string().optional(),
  roleTitle: z.string().optional(),
  location: z.string().optional(),
  seniority: z.string().optional(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  recruiterSignals: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([])
});

export const AnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.string(),
  topFixes: z.array(
    z.object({
      title: z.string(),
      detail: z.string()
    })
  ),
  missingEvidence: z.array(z.string()),
  roleMatch: z.object({
    matched: z.array(z.string()),
    missing: z.array(z.string())
  }),
  bulletRewrites: z.array(
    z.object({
      original: z.string(),
      rewrite: z.string(),
      reason: z.string()
    })
  ),
  priorities: z.array(z.string())
});

export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
export type JobDescription = z.infer<typeof JobDescriptionSchema>;
export type CvAnalysis = z.infer<typeof AnalysisSchema>;

export type FlowState =
  | "ENTRY"
  | "UPLOAD_CV"
  | "EXTRACTING_CV"
  | "CV_REVIEW_SUMMARY"
  | "SCRATCH_START"
  | "COLLECT_EDUCATION"
  | "COLLECT_EXPERIENCE"
  | "COLLECT_ACHIEVEMENTS"
  | "COLLECT_SKILLS"
  | "REQUEST_JOB_DESCRIPTION"
  | "JD_INGESTED"
  | "READY_FOR_ACTION"
  | "ANALYSIS"
  | "GENERATING_CV"
  | "DOWNLOADING"
  | "REVISION_LOOP";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type GeneratedDocumentView = {
  id: string;
  fileName: string;
  type: string;
  createdAt: string;
};

export type CoachSessionView = {
  id: string;
  locale: Locale;
  flowState: FlowState;
  profile: CandidateProfile;
  jobDescription?: JobDescription;
  messages: ChatMessage[];
  documents: GeneratedDocumentView[];
};

export function emptyCandidateProfile(): CandidateProfile {
  return CandidateProfileSchema.parse({
    contact: {},
    education: [],
    experience: [],
    projects: [],
    leadership: [],
    skills: [],
    languages: [],
    awards: [],
    completenessScore: 0
  });
}

export function normalizeProfile(profile: unknown): CandidateProfile {
  const parsed = CandidateProfileSchema.safeParse(profile);
  return parsed.success ? parsed.data : emptyCandidateProfile();
}

export function normalizeJobDescription(jobDescription: unknown): JobDescription | undefined {
  if (!jobDescription) {
    return undefined;
  }

  const parsed = JobDescriptionSchema.safeParse(jobDescription);
  return parsed.success ? parsed.data : undefined;
}
