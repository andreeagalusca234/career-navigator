import { NextResponse } from "next/server";
import { z } from "zod";
import { createCvDocx } from "@/lib/cv/docx";
import { generateTailoredCvWithGemma } from "@/lib/cv/tailor";
import {
  appendMessage,
  getOrCreateSession,
  saveEvent,
  saveGeneratedDocument,
  setFlowState
} from "@/lib/db/store";

export const runtime = "nodejs";

const GenerateRequestSchema = z.object({
  sessionId: z.string()
});

export async function POST(request: Request) {
  const parsed = GenerateRequestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: "Lipseste sesiunea." }, { status: 400 });
  }

  const session = await getOrCreateSession(parsed.data.sessionId);

  if (!session.jobDescription) {
    return NextResponse.json(
      {
        error:
          session.locale === "en"
            ? "To generate the tailored CV, I need the job description."
            : "Pentru a genera CV-ul adaptat, am nevoie de descrierea jobului."
      },
      { status: 400 }
    );
  }

  if (session.profile.completenessScore < 45) {
    return NextResponse.json(
      {
        error:
          session.locale === "en"
            ? "The profile is still too thin. I need more education, experience, or relevant projects."
            : "Profilul este inca prea subtire. Mai am nevoie de educatie, experienta sau proiecte relevante."
      },
      { status: 400 }
    );
  }

  await setFlowState(session.id, "GENERATING_CV");
  const { tailoredCv, model, usedGemma } = await generateTailoredCvWithGemma(
    session.profile,
    session.jobDescription,
    session.locale
  );
  const file = await createCvDocx(tailoredCv);
  const document = await saveGeneratedDocument({
    sessionId: session.id,
    id: file.id,
    fileName: file.fileName,
    filePath: file.filePath,
    type: "docx",
    metadata: {
      targetRole: tailoredCv.targetRole,
      targetCompany: tailoredCv.targetCompany,
      model,
      usedGemma,
      docxBase64: file.base64
    }
  });

  await setFlowState(session.id, "DOWNLOADING");
  await saveEvent(session.id, "generated_cv", { documentId: document.id, model, usedGemma });
  await appendMessage(
    session.id,
    "assistant",
    session.locale === "en"
      ? "Your tailored CV is ready. You can download it as a DOCX or we can revise one section."
      : "CV-ul tau adaptat este gata. Il poti descarca in format DOCX sau putem revizui o sectiune."
  );

  return NextResponse.json({ document, session: await getOrCreateSession(session.id) });
}
