import { NextResponse } from "next/server";
import { calculateCompleteness, getMissingProfileFields } from "@/lib/cv/completeness";
import { extractCandidateProfileFromFile } from "@/lib/cv/extract";
import { decideNextStep } from "@/lib/cv/flow";
import {
  appendMessage,
  getOrCreateSession,
  saveCandidateProfile,
  saveEvent,
  setFlowState
} from "@/lib/db/store";
import { validateCvUpload } from "@/lib/files/upload";
import type { Locale } from "@/lib/i18n";

export const runtime = "nodejs";

function uploadCopy(locale: Locale) {
  return {
    ro: {
      missingFile: "Nu am gasit fisierul CV.",
      found: {
        education: "educatia",
        experience: "experienta",
        projects: "proiecte",
        skills: "competente"
      },
      basics: "cateva informatii de baza",
      read: "Am citit CV-ul tau.",
      foundPrefix: "Am gasit",
      missingPrefix: "Mai lipsesc",
      enough: "Profilul arata suficient pentru urmatorul pas.",
      unreadable:
        "Nu am putut citi clar textul din fisier. Te rog incarca un PDF exportat direct din Word/Google Docs sau un DOCX editabil."
    },
    en: {
      missingFile: "I could not find the CV file.",
      found: {
        education: "education",
        experience: "experience",
        projects: "projects",
        skills: "skills"
      },
      basics: "some basic information",
      read: "I read your CV.",
      foundPrefix: "I found",
      missingPrefix: "Still missing",
      enough: "The profile has enough material for the next step.",
      unreadable:
        "I could not read the text clearly from the file. Please upload a PDF exported directly from Word/Google Docs or an editable DOCX."
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

export async function POST(request: Request) {
  const formData = await request.formData();
  const sessionId = formData.get("sessionId")?.toString();
  const file = formData.get("file");
  const session = await getOrCreateSession(sessionId);
  const messages = uploadCopy(session.locale);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: messages.missingFile }, { status: 400 });
  }

  const uploadError = validateCvUpload(file);
  if (uploadError) {
    const error =
      session.locale === "en"
        ? uploadError.includes("10 MB")
          ? "The file is too large. The limit is 10 MB."
          : "We accept PDF or DOCX files."
        : uploadError;
    return NextResponse.json({ error }, { status: 400 });
  }

  await setFlowState(session.id, "EXTRACTING_CV");
  await saveEvent(session.id, "uploaded_cv", { fileName: file.name, size: file.size });

  const buffer = Buffer.from(await file.arrayBuffer());
  const { profile, extractedTextLength } = await extractCandidateProfileFromFile(buffer, file.name, file.type);
  profile.completenessScore = calculateCompleteness(profile);

  const savedProfile = await saveCandidateProfile(session.id, profile);
  const missing = localizeMissingFields(getMissingProfileFields(savedProfile), session.locale);
  const next = decideNextStep(savedProfile, session.locale);
  await setFlowState(session.id, next.flowState);

  const foundParts = [
    savedProfile.education.length ? messages.found.education : null,
    savedProfile.experience.length ? messages.found.experience : null,
    savedProfile.projects.length ? messages.found.projects : null,
    savedProfile.skills.length ? messages.found.skills : null
  ].filter(Boolean);

  const summary =
    extractedTextLength > 0
      ? `${messages.read} ${messages.foundPrefix} ${foundParts.length ? foundParts.join(", ") : messages.basics}. ${
          missing.length ? `${messages.missingPrefix}: ${missing.slice(0, 3).join(", ")}.` : messages.enough
        }\n\n${next.assistantMessage}`
      : messages.unreadable;

  await appendMessage(session.id, "assistant", summary);

  return NextResponse.json({ session: await getOrCreateSession(session.id) });
}
