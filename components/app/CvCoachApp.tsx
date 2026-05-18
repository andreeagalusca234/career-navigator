"use client";

import { useEffect, useMemo, useState } from "react";
import { AnalysisScoreCard } from "@/components/resume/AnalysisScoreCard";
import { ChatShell } from "@/components/chat/ChatShell";
import { CvPreview } from "@/components/resume/CvPreview";
import { DownloadCard } from "@/components/resume/DownloadCard";
import { LandingChoice } from "@/components/landing/LandingChoice";
import { ProfileCompleteness } from "@/components/resume/ProfileCompleteness";
import { UploadCard } from "@/components/upload/UploadCard";
import type { CoachSessionView, CvAnalysis, GeneratedDocumentView } from "@/lib/cv/schemas";
import { t, type Locale } from "@/lib/i18n";

type ApiResponse = {
  session?: CoachSessionView;
  analysis?: CvAnalysis;
  document?: GeneratedDocumentView;
  error?: string;
};

const storageKey = "cvCoachSessionId";

async function readJson(response: Response): Promise<ApiResponse> {
  const data = (await response.json().catch(() => ({}))) as ApiResponse;
  if (!response.ok) {
    throw new Error(data.error || "A aparut o eroare. Te rog incearca din nou.");
  }
  return data;
}

export function CvCoachApp() {
  const [session, setSession] = useState<CoachSessionView | null>(null);
  const [analysis, setAnalysis] = useState<CvAnalysis | null>(null);
  const [document, setDocument] = useState<GeneratedDocumentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canShowWorkspace = session && session.flowState !== "ENTRY";
  const hasLoadedProfile = Boolean(session && session.profile.completenessScore > 0);
  const readyForActions = useMemo(
    () => Boolean(session?.jobDescription && ["READY_FOR_ACTION", "ANALYSIS", "DOWNLOADING"].includes(session.flowState)),
    [session]
  );
  const locale = session?.locale ?? "ro";
  const text = t(locale);

  function syncSession(nextSession?: CoachSessionView) {
    if (!nextSession) return;
    localStorage.setItem(storageKey, nextSession.id);
    setSession(nextSession);
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const existingSessionId = localStorage.getItem(storageKey);
        const response = await fetch(
          existingSessionId ? `/api/session?sessionId=${encodeURIComponent(existingSessionId)}` : "/api/session",
          { method: "GET" }
        );
        const data = await readJson(response);
        if (!cancelled) syncSession(data.session);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : t("ro").common.sessionError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.document.documentElement.lang = locale;
  }, [locale]);

  async function sendChat(message: string, action?: "choose_upload" | "choose_scratch") {
    if (!session) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, message, action })
      });
      const data = await readJson(response);
      syncSession(data.session);
      setAnalysis(null);
      setDocument(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.common.chatError);
    } finally {
      setBusy(false);
    }
  }

  async function changeLocale(nextLocale: Locale) {
    if (!session || session.locale === nextLocale) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, locale: nextLocale })
      });
      const data = await readJson(response);
      syncSession(data.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.common.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function startOver() {
    if (!session) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, locale, reset: true })
      });
      const data = await readJson(response);
      syncSession(data.session);
      setAnalysis(null);
      setDocument(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.common.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function uploadCv(file: File) {
    if (!session) return;
    setBusy(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("sessionId", session.id);
      formData.append("file", file);

      const response = await fetch("/api/upload-cv", {
        method: "POST",
        body: formData
      });
      const data = await readJson(response);
      syncSession(data.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.common.uploadError);
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (!session) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id })
      });
      const data = await readJson(response);
      if (data.analysis) setAnalysis(data.analysis);
      syncSession(data.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.common.analyzeError);
    } finally {
      setBusy(false);
    }
  }

  async function generateCv() {
    if (!session) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id })
      });
      const data = await readJson(response);
      if (data.document) setDocument(data.document);
      syncSession(data.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.common.generateError);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="app-shell center-stage">
        <div className="loading-card">{t("ro").common.loading}</div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {!canShowWorkspace && (
        <LandingChoice
          locale={locale}
          disabled={busy}
          onLocaleChange={changeLocale}
          onUploadChoice={() => sendChat("", "choose_upload")}
          onScratchChoice={() => sendChat("", "choose_scratch")}
        />
      )}

      {canShowWorkspace && (
        <section className="workspace-grid">
          <div className="conversation-column">
            <ChatShell
              busy={busy}
              locale={locale}
              messages={session.messages}
              readyForActions={readyForActions}
              onLocaleChange={changeLocale}
              onReset={startOver}
              onAnalyze={analyze}
              onGenerate={generateCv}
              onSend={(message) => sendChat(message)}
            />
          </div>

          <aside className="side-panel">
            <UploadCard compact={hasLoadedProfile} disabled={busy} locale={locale} onUpload={uploadCv} />
            <ProfileCompleteness locale={locale} profile={session.profile} />
            <CvPreview locale={locale} profile={session.profile} jobDescription={session.jobDescription} />
            {analysis ? <AnalysisScoreCard analysis={analysis} locale={locale} /> : null}
            {document ? <DownloadCard document={document} locale={locale} /> : null}
          </aside>
        </section>
      )}

      {error ? <div className="toast-error">{error}</div> : null}
    </main>
  );
}
