import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  CandidateProfileSchema,
  JobDescriptionSchema,
  emptyCandidateProfile,
  normalizeJobDescription,
  type CandidateProfile,
  type ChatMessage,
  type CoachSessionView,
  type FlowState,
  type GeneratedDocumentView,
  type JobDescription
} from "@/lib/cv/schemas";
import { calculateCompleteness } from "@/lib/cv/completeness";
import { normalizeLocale, type Locale } from "@/lib/i18n";

type MemoryDocument = GeneratedDocumentView & {
  filePath: string;
  metadata?: Record<string, unknown>;
};

type MemorySession = Omit<CoachSessionView, "documents"> & {
  documents: MemoryDocument[];
  events: Array<{ name: string; payload?: Record<string, unknown>; createdAt: string }>;
};

const globalMemory = globalThis as unknown as {
  cvCoachMemory?: Map<string, MemorySession>;
};

const memory = globalMemory.cvCoachMemory ?? new Map<string, MemorySession>();
globalMemory.cvCoachMemory = memory;

const memoryStorePath = path.join(process.cwd(), ".generated", "session-store.json");

function hydrateMemory(): void {
  try {
    if (!fs.existsSync(memoryStorePath)) return;
    const sessions = JSON.parse(fs.readFileSync(memoryStorePath, "utf8")) as MemorySession[];
    sessions.forEach((session) => memory.set(session.id, session));
  } catch {
    // Local fallback storage is best-effort. Postgres remains the source of truth when configured.
  }
}

function persistMemory(): void {
  try {
    fs.mkdirSync(path.dirname(memoryStorePath), { recursive: true });
    fs.writeFileSync(memoryStorePath, JSON.stringify(Array.from(memory.values()), null, 2));
  } catch {
    // Do not block the product flow if local fallback persistence is unavailable.
  }
}

function safeSessionId(sessionId?: string | null): string {
  if (sessionId && /^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) {
    return sessionId;
  }
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function createMemorySession(sessionId?: string | null): MemorySession {
  hydrateMemory();
  const id = safeSessionId(sessionId);
  const existing = memory.get(id);
  if (existing) return existing;

  const session: MemorySession = {
    id,
    locale: "ro",
    flowState: "ENTRY",
    profile: emptyCandidateProfile(),
    messages: [],
    documents: [],
    events: []
  };
  memory.set(id, session);
  persistMemory();
  return session;
}

function removeGeneratedFiles(documents: MemoryDocument[]): void {
  documents.forEach((document) => {
    try {
      if (fs.existsSync(document.filePath)) {
        fs.unlinkSync(document.filePath);
      }
    } catch {
      // Generated files are disposable; stale files must not block a reset.
    }
  });
}

function messageView(message: {
  id: string;
  role: string;
  content: string;
  createdAt: Date | string;
  metadata?: Prisma.JsonValue | Record<string, unknown> | null;
}): ChatMessage {
  return {
    id: message.id,
    role: message.role === "user" || message.role === "assistant" ? message.role : "system",
    content: message.content,
    createdAt: new Date(message.createdAt).toISOString(),
    metadata: (message.metadata as Record<string, unknown> | undefined) ?? undefined
  };
}

function dbProfileToView(profile: {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  summary: string | null;
  education: Prisma.JsonValue;
  experience: Prisma.JsonValue;
  projects: Prisma.JsonValue;
  leadership: Prisma.JsonValue;
  skills: Prisma.JsonValue;
  languages: Prisma.JsonValue;
  awards: Prisma.JsonValue;
  completenessScore: number;
}): CandidateProfile {
  return CandidateProfileSchema.parse({
    fullName: profile.fullName ?? undefined,
    contact: {
      email: profile.email ?? undefined,
      phone: profile.phone ?? undefined,
      location: profile.location ?? undefined,
      linkedin: profile.linkedin ?? undefined
    },
    summary: profile.summary ?? undefined,
    education: profile.education,
    experience: profile.experience,
    projects: profile.projects,
    leadership: profile.leadership,
    skills: profile.skills,
    languages: profile.languages,
    awards: profile.awards,
    completenessScore: profile.completenessScore
  });
}

function dbJobToView(job: {
  rawText: string;
  company: string | null;
  roleTitle: string | null;
  location: string | null;
  seniority: string | null;
  requiredSkills: Prisma.JsonValue;
  preferredSkills: Prisma.JsonValue;
  responsibilities: Prisma.JsonValue;
  keywords: Prisma.JsonValue;
  recruiterSignals: Prisma.JsonValue;
  risks: Prisma.JsonValue;
}): JobDescription {
  return JobDescriptionSchema.parse({
    rawText: job.rawText,
    company: job.company ?? undefined,
    roleTitle: job.roleTitle ?? undefined,
    location: job.location ?? undefined,
    seniority: job.seniority ?? undefined,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    responsibilities: job.responsibilities,
    keywords: job.keywords,
    recruiterSignals: job.recruiterSignals,
    risks: job.risks
  });
}

function dbDocumentToView(document: {
  id: string;
  fileName: string;
  type: string;
  createdAt: Date | string;
}): GeneratedDocumentView {
  return {
    id: document.id,
    fileName: document.fileName,
    type: document.type,
    createdAt: new Date(document.createdAt).toISOString()
  };
}

function sessionToView(session: {
  id: string;
  locale: string;
  flowState: string;
  profile: ReturnType<typeof dbProfileToView> | null;
  jobDescription: ReturnType<typeof dbJobToView> | null;
  messages: ChatMessage[];
  documents: GeneratedDocumentView[];
}): CoachSessionView {
  return {
    id: session.id,
    locale: normalizeLocale(session.locale),
    flowState: session.flowState as FlowState,
    profile: session.profile ?? emptyCandidateProfile(),
    jobDescription: normalizeJobDescription(session.jobDescription),
    messages: session.messages,
    documents: session.documents
  };
}

async function loadDbSession(sessionId: string): Promise<CoachSessionView | null> {
  if (!prisma) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      profile: true,
      jobDescription: true,
      messages: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!session) return null;

  return sessionToView({
    id: session.id,
    locale: session.locale,
    flowState: session.flowState,
    profile: session.profile ? dbProfileToView(session.profile) : null,
    jobDescription: session.jobDescription ? dbJobToView(session.jobDescription) : null,
    messages: session.messages.map(messageView),
    documents: session.documents.map(dbDocumentToView)
  });
}

async function createDbSession(sessionId?: string | null): Promise<CoachSessionView> {
  if (!prisma) {
    return createMemorySession(sessionId);
  }

  const id = safeSessionId(sessionId);
  const session = await prisma.session.create({
    data: {
      id,
      locale: "ro",
      flowState: "ENTRY"
    },
    include: {
      profile: true,
      jobDescription: true,
      messages: true,
      documents: true
    }
  });

  return sessionToView({
    id: session.id,
    locale: session.locale,
    flowState: session.flowState,
    profile: null,
    jobDescription: null,
    messages: [],
    documents: []
  });
}

export async function getOrCreateSession(sessionId?: string | null): Promise<CoachSessionView> {
  hydrateMemory();

  try {
    const id = safeSessionId(sessionId);
    const dbSession = await loadDbSession(id);
    if (dbSession) return dbSession;
    return await createDbSession(id);
  } catch {
    const existing = sessionId ? memory.get(sessionId) : undefined;
    return existing ?? createMemorySession(sessionId);
  }
}

export async function resetSession(sessionId?: string | null, locale: Locale = "ro"): Promise<CoachSessionView> {
  hydrateMemory();
  const normalizedLocale = normalizeLocale(locale);

  if (sessionId) {
    const memorySession = memory.get(sessionId);
    if (memorySession) {
      removeGeneratedFiles(memorySession.documents);
      memory.delete(sessionId);
      persistMemory();
    }
  }

  if (prisma && sessionId) {
    try {
      const documents = await prisma.generatedDocument.findMany({
        where: { sessionId },
        select: { filePath: true }
      });
      removeGeneratedFiles(
        documents.map((document) => ({
          id: "",
          fileName: "",
          type: "docx",
          createdAt: nowIso(),
          filePath: document.filePath
        }))
      );
      await prisma.session.delete({ where: { id: sessionId } });
    } catch {
      // If the DB row is already gone, a new clean local session is still the right outcome.
    }
  }

  const nextSession = await createDbSession();
  await setSessionLocale(nextSession.id, normalizedLocale);
  return getOrCreateSession(nextSession.id);
}

export async function setSessionLocale(sessionId: string, locale: Locale): Promise<void> {
  hydrateMemory();
  const normalizedLocale = normalizeLocale(locale);
  const memorySession = memory.get(sessionId);
  if (memorySession) {
    memorySession.locale = normalizedLocale;
    persistMemory();
  }

  if (!prisma) return;

  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: { locale: normalizedLocale }
    });
  } catch {
    // The local fallback still reflects the selected language.
  }
}

export async function setFlowState(sessionId: string, flowState: FlowState): Promise<void> {
  hydrateMemory();
  const memorySession = memory.get(sessionId);
  if (memorySession) {
    memorySession.flowState = flowState;
    persistMemory();
  }

  if (!prisma) return;

  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: { flowState }
    });
  } catch {
    // The in-memory session above keeps local exploration usable when Postgres is not running.
  }
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  metadata?: Record<string, unknown>
): Promise<ChatMessage> {
  hydrateMemory();
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: nowIso(),
    metadata
  };

  const memorySession = memory.get(sessionId);
  if (memorySession) {
    memorySession.messages.push(message);
    persistMemory();
  }

  if (!prisma) return message;

  try {
    const saved = await prisma.message.create({
      data: {
        id: message.id,
        sessionId,
        role,
        content,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
    return messageView(saved);
  } catch {
    return message;
  }
}

export async function saveCandidateProfile(sessionId: string, profile: CandidateProfile): Promise<CandidateProfile> {
  hydrateMemory();
  const normalized = CandidateProfileSchema.parse({
    ...profile,
    completenessScore: calculateCompleteness(profile)
  });

  const memorySession = memory.get(sessionId);
  if (memorySession) {
    memorySession.profile = normalized;
    persistMemory();
  }

  if (!prisma) return normalized;

  try {
    await prisma.candidateProfile.upsert({
      where: { sessionId },
      create: {
        sessionId,
        fullName: normalized.fullName,
        email: normalized.contact.email,
        phone: normalized.contact.phone,
        location: normalized.contact.location,
        linkedin: normalized.contact.linkedin,
        summary: normalized.summary,
        education: normalized.education as Prisma.InputJsonValue,
        experience: normalized.experience as Prisma.InputJsonValue,
        projects: normalized.projects as Prisma.InputJsonValue,
        leadership: normalized.leadership as Prisma.InputJsonValue,
        skills: normalized.skills as Prisma.InputJsonValue,
        languages: normalized.languages as Prisma.InputJsonValue,
        awards: normalized.awards as Prisma.InputJsonValue,
        completenessScore: normalized.completenessScore
      },
      update: {
        fullName: normalized.fullName,
        email: normalized.contact.email,
        phone: normalized.contact.phone,
        location: normalized.contact.location,
        linkedin: normalized.contact.linkedin,
        summary: normalized.summary,
        education: normalized.education as Prisma.InputJsonValue,
        experience: normalized.experience as Prisma.InputJsonValue,
        projects: normalized.projects as Prisma.InputJsonValue,
        leadership: normalized.leadership as Prisma.InputJsonValue,
        skills: normalized.skills as Prisma.InputJsonValue,
        languages: normalized.languages as Prisma.InputJsonValue,
        awards: normalized.awards as Prisma.InputJsonValue,
        completenessScore: normalized.completenessScore
      }
    });
  } catch {
    // The returned profile is still useful for the current UI response.
  }

  return normalized;
}

export async function saveJobDescription(sessionId: string, jobDescription: JobDescription): Promise<JobDescription> {
  hydrateMemory();
  const normalized = JobDescriptionSchema.parse(jobDescription);

  const memorySession = memory.get(sessionId);
  if (memorySession) {
    memorySession.jobDescription = normalized;
    persistMemory();
  }

  if (!prisma) return normalized;

  try {
    await prisma.jobDescription.upsert({
      where: { sessionId },
      create: {
        sessionId,
        rawText: normalized.rawText,
        company: normalized.company,
        roleTitle: normalized.roleTitle,
        location: normalized.location,
        seniority: normalized.seniority,
        requiredSkills: normalized.requiredSkills as Prisma.InputJsonValue,
        preferredSkills: normalized.preferredSkills as Prisma.InputJsonValue,
        responsibilities: normalized.responsibilities as Prisma.InputJsonValue,
        keywords: normalized.keywords as Prisma.InputJsonValue,
        recruiterSignals: normalized.recruiterSignals as Prisma.InputJsonValue,
        risks: normalized.risks as Prisma.InputJsonValue
      },
      update: {
        rawText: normalized.rawText,
        company: normalized.company,
        roleTitle: normalized.roleTitle,
        location: normalized.location,
        seniority: normalized.seniority,
        requiredSkills: normalized.requiredSkills as Prisma.InputJsonValue,
        preferredSkills: normalized.preferredSkills as Prisma.InputJsonValue,
        responsibilities: normalized.responsibilities as Prisma.InputJsonValue,
        keywords: normalized.keywords as Prisma.InputJsonValue,
        recruiterSignals: normalized.recruiterSignals as Prisma.InputJsonValue,
        risks: normalized.risks as Prisma.InputJsonValue
      }
    });
  } catch {
    // Keep the UI moving if the local database is not available.
  }

  return normalized;
}

export async function saveEvent(
  sessionId: string,
  name: string,
  payload?: Record<string, unknown>
): Promise<void> {
  hydrateMemory();
  const memorySession = memory.get(sessionId);
  if (memorySession) {
    memorySession.events.push({ name, payload, createdAt: nowIso() });
    persistMemory();
  }

  if (!prisma) return;

  try {
    await prisma.event.create({
      data: {
        sessionId,
        name,
        payload: payload as Prisma.InputJsonValue
      }
    });
  } catch {
    // Event logging must never block the product flow.
  }
}

export async function saveGeneratedDocument(input: {
  sessionId: string;
  id: string;
  fileName: string;
  filePath: string;
  type: string;
  metadata?: Record<string, unknown>;
}): Promise<GeneratedDocumentView> {
  hydrateMemory();
  const document: MemoryDocument = {
    id: input.id,
    fileName: input.fileName,
    filePath: input.filePath,
    type: input.type,
    createdAt: nowIso(),
    metadata: input.metadata
  };

  const memorySession = memory.get(input.sessionId);
  if (memorySession) {
    memorySession.documents.unshift(document);
    persistMemory();
  }

  if (!prisma) return document;

  try {
    const saved = await prisma.generatedDocument.create({
      data: {
        id: input.id,
        sessionId: input.sessionId,
        fileName: input.fileName,
        filePath: input.filePath,
        type: input.type,
        metadata: input.metadata as Prisma.InputJsonValue
      }
    });
    return dbDocumentToView(saved);
  } catch {
    return document;
  }
}

export async function getGeneratedDocument(documentId: string): Promise<MemoryDocument | null> {
  hydrateMemory();

  for (const session of memory.values()) {
    const found = session.documents.find((document) => document.id === documentId);
    if (found) return found;
  }

  if (!prisma) return null;

  try {
    const document = await prisma.generatedDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) return null;

    return {
      id: document.id,
      fileName: document.fileName,
      filePath: document.filePath,
      type: document.type,
      createdAt: document.createdAt.toISOString(),
      metadata: (document.metadata as Record<string, unknown> | undefined) ?? undefined
    };
  } catch {
    return null;
  }
}
