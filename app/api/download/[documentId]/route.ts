import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getGeneratedDocument, saveEvent } from "@/lib/db/store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const document = await getGeneratedDocument(params.documentId);

  if (!document) {
    return NextResponse.json({ error: "Documentul nu a fost gasit." }, { status: 404 });
  }

  try {
    const data = await fs.readFile(document.filePath);
    await saveEvent("unknown", "downloaded_cv", { documentId: document.id }).catch(() => undefined);

    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${document.fileName}"`
      }
    });
  } catch {
    const base64 = typeof document.metadata?.docxBase64 === "string" ? document.metadata.docxBase64 : null;

    if (!base64) {
      return NextResponse.json({ error: "Nu am putut descarca documentul." }, { status: 404 });
    }

    await saveEvent("unknown", "downloaded_cv", { documentId: document.id, source: "metadata" }).catch(
      () => undefined
    );

    return new NextResponse(Buffer.from(base64, "base64"), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${document.fileName}"`
      }
    });
  }
}
