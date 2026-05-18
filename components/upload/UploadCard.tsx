"use client";

import { useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

type UploadCardProps = {
  disabled: boolean;
  locale: Locale;
  compact?: boolean;
  onUpload: (file: File) => void;
};

export function UploadCard({ disabled, locale, compact = false, onUpload }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const text = t(locale).upload;

  function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    onUpload(file);
  }

  return (
    <section
      className={`upload-card ${compact ? "compact-upload" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        handleFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <div>
        <p className="section-kicker">{text.kicker}</p>
        <h2>{compact ? text.compactTitle : text.title}</h2>
        {!compact ? <p>{text.intro}</p> : null}
        {fileName ? <p className="file-name">{fileName}</p> : null}
      </div>
      <button className="primary-button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {disabled ? text.busy : text.choose}
      </button>
      {!compact ? (
        <p className="privacy-note">{text.privacy}</p>
      ) : null}
    </section>
  );
}
