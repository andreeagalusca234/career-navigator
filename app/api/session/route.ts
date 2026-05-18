import { NextResponse } from "next/server";
import { z } from "zod";
import { appendMessage, getOrCreateSession, resetSession, saveEvent, setSessionLocale } from "@/lib/db/store";
import { normalizeLocale } from "@/lib/i18n";

export const runtime = "nodejs";

const SessionPostSchema = z.object({
  sessionId: z.string().optional(),
  locale: z.enum(["ro", "en"]).optional(),
  reset: z.boolean().optional()
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const session = await getOrCreateSession(sessionId);

  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  const parsed = SessionPostSchema.safeParse(await request.json().catch(() => ({})));
  const body = parsed.success ? parsed.data : {};
  const session = await getOrCreateSession(body.sessionId);

  if (body.reset) {
    const locale = normalizeLocale(body.locale ?? session.locale);
    const nextSession = await resetSession(session.id, locale);
    await saveEvent(nextSession.id, "reset_session", { previousSessionId: session.id });
    return NextResponse.json({ session: nextSession });
  }

  if (body.locale) {
    const locale = normalizeLocale(body.locale);
    const changed = session.locale !== locale;
    await setSessionLocale(session.id, locale);
    await saveEvent(session.id, "changed_locale", { locale });
    if (changed) {
      await appendMessage(
        session.id,
        "assistant",
        locale === "en"
          ? "I switched the platform and CV language to English. I will continue in English."
          : "Am schimbat limba platformei si a CV-ului in romana. Voi continua in romana."
      );
    }
    return NextResponse.json({ session: await getOrCreateSession(session.id) });
  }

  await saveEvent(session.id, "started_session");

  return NextResponse.json({ session });
}
