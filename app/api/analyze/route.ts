import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeCvWithGemma } from "@/lib/cv/analyze";
import { appendMessage, getOrCreateSession, saveEvent, setFlowState } from "@/lib/db/store";

export const runtime = "nodejs";

const AnalyzeRequestSchema = z.object({
  sessionId: z.string()
});

export async function POST(request: Request) {
  const parsed = AnalyzeRequestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: "Lipseste sesiunea." }, { status: 400 });
  }

  const session = await getOrCreateSession(parsed.data.sessionId);

  if (!session.jobDescription) {
    return NextResponse.json(
      {
        error:
          session.locale === "en"
            ? "For a useful analysis, I need the job description."
            : "Pentru o analiza utila, am nevoie de descrierea jobului."
      },
      { status: 400 }
    );
  }

  const { analysis, model, usedGemma } = await analyzeCvWithGemma(
    session.profile,
    session.jobDescription,
    session.locale
  );
  await setFlowState(session.id, "ANALYSIS");
  await saveEvent(session.id, "analyzed_cv", { score: analysis.score, model, usedGemma });
  await appendMessage(
    session.id,
    "assistant",
    session.locale === "en"
      ? `The analysis is ready. The score is ${analysis.score}/100. Main priority: ${analysis.priorities[0]}`
      : `Analiza este gata. Scorul este ${analysis.score}/100. Prioritatea principala: ${analysis.priorities[0]}`
  );

  return NextResponse.json({ analysis, session: await getOrCreateSession(session.id) });
}
