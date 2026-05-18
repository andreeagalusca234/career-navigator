"use client";

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, MicOff, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { ChatMessage } from "@/lib/cv/schemas";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { QuickReplyButtons } from "@/components/chat/QuickReplyButtons";
import { t, type Locale, voiceLanguage as localeVoiceLanguage } from "@/lib/i18n";

type ChatShellProps = {
  messages: ChatMessage[];
  busy: boolean;
  locale: Locale;
  readyForActions: boolean;
  onLocaleChange: (locale: Locale) => void;
  onReset: () => void;
  onSend: (message: string) => void;
  onAnalyze: () => void;
  onGenerate: () => void;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0?: {
    transcript?: string;
  };
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

type VoiceLanguage = "ro-RO" | "en-GB";

function appendDictation(current: string, transcript: string): string {
  const cleanedTranscript = transcript.replace(/\s+/g, " ").trim();
  if (!cleanedTranscript) return current;

  const separator = current.trim() ? " " : "";
  return `${current}${separator}${cleanedTranscript}`.trimStart();
}

function pickVoice(voices: SpeechSynthesisVoice[], language: VoiceLanguage): SpeechSynthesisVoice | undefined {
  const normalizedLanguage = language.toLowerCase();
  const family = normalizedLanguage.split("-")[0];

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalizedLanguage) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${family}-`)) ??
    (language === "en-GB" ? voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) : undefined)
  );
}

export function ChatShell({
  messages,
  busy,
  locale,
  readyForActions,
  onLocaleChange,
  onReset,
  onSend,
  onAnalyze,
  onGenerate
}: ChatShellProps) {
  const [draft, setDraft] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [autoRead, setAutoRead] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const text = t(locale).chat;
  const voiceLanguage = localeVoiceLanguage(locale);

  function scrollToLatest(behavior: ScrollBehavior = "auto") {
    const list = listRef.current;
    if (!list) return;

    list.scrollTo({
      top: list.scrollHeight,
      behavior
    });
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function speak(content: string) {
    if (!("speechSynthesis" in window)) {
      setVoiceError(text.browserCannotSpeak);
      return;
    }

    window.speechSynthesis.cancel();
    let selectedVoice = pickVoice(voices, voiceLanguage);

    if (voiceLanguage === "ro-RO" && voices.length > 0 && !selectedVoice) {
      selectedVoice = pickVoice(voices, "en-GB");
      setVoiceNotice(text.missingRomanianVoice);
    } else {
      setVoiceNotice(null);
    }

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = voiceLanguage;
    utterance.voice = selectedVoice ?? null;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setVoiceError(text.cannotSpeak);
    };

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  function createRecognition(): BrowserSpeechRecognition | null {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError(text.recognitionUnsupported);
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = voiceLanguage;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        setDraft((current) => appendDictation(current, finalText));
      }
      setInterimTranscript(interimText.trim());
    };
    recognition.onerror = (event) => {
      setListening(false);
      setInterimTranscript("");
      setVoiceError(
        event.error === "not-allowed"
          ? text.micPermission
          : text.cannotListen
      );
    };
    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
    };

    return recognition;
  }

  function toggleListening() {
    setVoiceError(null);
    setVoiceNotice(null);

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = createRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setVoiceError(text.micBusy);
    }
  }

  function toggleAutoRead() {
    setVoiceError(null);
    setVoiceNotice(null);

    if (autoRead || speaking) {
      setAutoRead(false);
      stopSpeaking();
      return;
    }

    setAutoRead(true);
    if (latestAssistantMessage) {
      lastSpokenMessageIdRef.current = latestAssistantMessage.id;
      speak(latestAssistantMessage.content);
    }
  }

  function changeLanguage(nextLocale: Locale) {
    setVoiceError(null);
    setVoiceNotice(null);
    recognitionRef.current?.stop();
    setListening(false);
    stopSpeaking();
    onLocaleChange(nextLocale);
  }

  function startOver() {
    const confirmed = window.confirm(text.resetConfirm);
    if (!confirmed) return;

    setDraft("");
    setInterimTranscript("");
    setVoiceError(null);
    setVoiceNotice(null);
    recognitionRef.current?.stop();
    setListening(false);
    stopSpeaking();
    onReset();
  }

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    setSpeechSupported(Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition));

    if ("speechSynthesis" in window) {
      const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => {
        window.speechSynthesis.onvoiceschanged = null;
        stopSpeaking();
        recognitionRef.current?.abort();
      };
    }

    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!autoRead || !latestAssistantMessage) return;
    if (lastSpokenMessageIdRef.current === latestAssistantMessage.id) return;

    lastSpokenMessageIdRef.current = latestAssistantMessage.id;
    speak(latestAssistantMessage.content);
  }, [autoRead, latestAssistantMessage?.id, voiceLanguage, voices.length]);

  useLayoutEffect(() => {
    scrollToLatest("auto");
  }, [messages]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToLatest(messages.length > 1 ? "smooth" : "auto"));
    const timeout = window.setTimeout(() => scrollToLatest("auto"), 80);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [messages.length, busy]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || busy) return;
    setDraft("");
    setInterimTranscript("");
    stopSpeaking();
    onSend(value);
    window.setTimeout(() => scrollToLatest("smooth"), 0);
  }

  return (
    <section className="chat-shell">
      <div className="chat-header">
        <div>
          <p className="section-kicker">{text.kicker}</p>
          <h2>{text.title}</h2>
        </div>
        <div className="chat-header-actions">
          <span className="model-pill">{text.modelBadge}</span>
          <div aria-label={text.languageAria} className="voice-language-toggle" role="group">
            <button
              className={locale === "ro" ? "selected" : ""}
              type="button"
              onClick={() => changeLanguage("ro")}
            >
              RO
            </button>
            <button
              className={locale === "en" ? "selected" : ""}
              type="button"
              onClick={() => changeLanguage("en")}
            >
              EN
            </button>
          </div>
          <button
            aria-label={listening ? text.stopDictation : text.dictate}
            className={`icon-button ${listening ? "active" : ""}`}
            disabled={!speechSupported || busy}
            title={speechSupported ? text.dictateTitle : text.dictateUnsupported}
            type="button"
            onClick={toggleListening}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            aria-label={autoRead ? text.stopReading : text.listen}
            className={`icon-button ${autoRead || speaking ? "active" : ""}`}
            title={text.listenTitle}
            type="button"
            onClick={toggleAutoRead}
          >
            {autoRead || speaking ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            aria-label={text.reset}
            className="icon-button"
            disabled={busy}
            title={text.resetTitle}
            type="button"
            onClick={startOver}
          >
            <RotateCcw size={18} />
          </button>
          {busy ? <span className="status-pill">{text.busy}</span> : <span className="status-pill ready">{text.ready}</span>}
        </div>
      </div>

      <div ref={listRef} className="message-list" aria-live="polite">
        {messages.length ? (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        ) : (
          <div className="empty-chat">{text.empty}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {readyForActions ? (
        <QuickReplyButtons disabled={busy} locale={locale} onAnalyze={onAnalyze} onGenerate={onGenerate} />
      ) : null}

      <form className="chat-input-row" onSubmit={submit}>
        <div className="voice-input-wrap">
          <textarea
            value={draft}
            disabled={busy}
            rows={2}
            placeholder={listening ? text.listeningPlaceholder : text.placeholder}
            onChange={(event) => setDraft(event.target.value)}
          />
          {interimTranscript || voiceError || voiceNotice ? (
            <p className={`voice-status ${voiceError ? "voice-error" : ""}`}>
              {voiceError ?? voiceNotice ?? `${text.listeningPrefix}: ${interimTranscript}`}
            </p>
          ) : null}
        </div>
        <button className="send-button" disabled={busy || !draft.trim()}>
          {text.send}
        </button>
      </form>
    </section>
  );
}
