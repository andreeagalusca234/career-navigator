import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateCompleteness } from "@/lib/cv/completeness";
import { applyConversationalAnswer, decideNextStep, looksLikeJobDescription } from "@/lib/cv/flow";
import { ingestJobDescriptionWithGemma } from "@/lib/cv/job-description";
import {
  appendMessage,
  getOrCreateSession,
  saveCandidateProfile,
  saveEvent,
  saveJobDescription,
  setFlowState
} from "@/lib/db/store";
import type { Locale } from "@/lib/i18n";

export const runtime = "nodejs";

const ChatRequestSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().optional(),
  action: z.enum(["choose_upload", "choose_scratch"]).optional()
});

function refusesFakeMetrics(message: string): boolean {
  return /\b(inventeaza|inventam|exagereaza|exageram|fake|minte|invent|make up|lie|fabricate)\b|adauga cifre/i.test(
    message
  );
}

function chatCopy(locale: Locale) {
  return {
    ro: {
      invalid: "Cererea nu este valida.",
      upload:
        "Perfect. Incarca PDF-ul cu CV-ul tau, iar eu extrag informatiile importante si iti cer doar ce lipseste.",
      scratch:
        "Incepem simplu, fara formular. Ce studiezi sau ce ai absolvit? Spune-mi institutia, programul si perioada, pe scurt.",
      fakeMetrics:
        "Nu pot inventa rezultate sau cifre. Pot insa reformula elegant ce ai facut real si te pot ajuta sa gasim dovezi verificabile.",
      extractedRole: (roleTitle?: string) =>
        `Am extras rolul tinta${roleTitle ? `: ${roleTitle}` : ""}. Pot analiza CV-ul, genera o versiune adaptata sau iti pot spune ce lipseste pentru rol.`
    },
    en: {
      invalid: "The request is not valid.",
      upload:
        "Perfect. Upload your CV as PDF or DOCX, and I will extract the important information and ask only for what is missing.",
      scratch:
        "Let's keep it simple, without a form. What are you studying or what did you graduate from? Share the institution, programme, and dates briefly.",
      fakeMetrics:
        "I cannot invent results or numbers. I can, however, phrase what you really did more clearly and help you find verifiable evidence.",
      extractedRole: (roleTitle?: string) =>
        `I extracted the target role${roleTitle ? `: ${roleTitle}` : ""}. I can analyze the CV, generate a tailored version, or tell you what is still missing for the role.`
    }
  }[locale];
}

export async function POST(request: Request) {
  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: chatCopy("ro").invalid }, { status: 400 });
  }

  const { sessionId, action } = parsed.data;
  const message = parsed.data.message?.trim() ?? "";
  const session = await getOrCreateSession(sessionId);
  const messages = chatCopy(session.locale);

  if (message) {
    await appendMessage(session.id, "user", message);
  }

  if (action === "choose_upload") {
    await setFlowState(session.id, "UPLOAD_CV");
    await saveEvent(session.id, "chose_upload");
    await appendMessage(session.id, "assistant", messages.upload);
    return NextResponse.json({ session: await getOrCreateSession(session.id) });
  }

  if (action === "choose_scratch") {
    await setFlowState(session.id, "COLLECT_EDUCATION");
    await saveEvent(session.id, "chose_scratch");
    await appendMessage(session.id, "assistant", messages.scratch);
    return NextResponse.json({ session: await getOrCreateSession(session.id) });
  }

  if (!message) {
    return NextResponse.json({ session });
  }

  if (refusesFakeMetrics(message)) {
    await appendMessage(session.id, "assistant", messages.fakeMetrics);
    return NextResponse.json({ session: await getOrCreateSession(session.id) });
  }

  if (session.flowState === "REQUEST_JOB_DESCRIPTION" || looksLikeJobDescription(message)) {
    const { jobDescription, model, usedGemma } = await ingestJobDescriptionWithGemma(message, session.locale);
    await saveJobDescription(session.id, jobDescription);
    await setFlowState(session.id, "READY_FOR_ACTION");
    await saveEvent(session.id, "added_job_description", {
      roleTitle: jobDescription.roleTitle,
      company: jobDescription.company,
      model,
      usedGemma
    });
    await appendMessage(session.id, "assistant", messages.extractedRole(jobDescription.roleTitle));
    return NextResponse.json({ session: await getOrCreateSession(session.id) });
  }

  const updatedProfile = applyConversationalAnswer(session.profile, message, session.flowState);
  updatedProfile.completenessScore = calculateCompleteness(updatedProfile);
  await saveCandidateProfile(session.id, updatedProfile);

  const next = decideNextStep(updatedProfile, session.locale);
  await setFlowState(session.id, next.flowState);
  await appendMessage(session.id, "assistant", next.assistantMessage);

  return NextResponse.json({ session: await getOrCreateSession(session.id) });
}
