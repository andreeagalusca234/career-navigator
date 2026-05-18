export const maxUploadBytes = 10 * 1024 * 1024;

const acceptedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export function validateCvUpload(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const hasAcceptedExtension = lowerName.endsWith(".pdf") || lowerName.endsWith(".docx");

  if (!acceptedTypes.has(file.type) && !hasAcceptedExtension) {
    return "Acceptam fisiere PDF sau DOCX.";
  }

  if (file.size > maxUploadBytes) {
    return "Fisierul este prea mare. Limita este 10 MB.";
  }

  return null;
}
