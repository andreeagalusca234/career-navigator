import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type { CandidateProfile } from "@/lib/cv/schemas";
import type { TailoredCv } from "@/lib/cv/tailor";
import { t, type Locale } from "@/lib/i18n";

const writableRoot = process.env.VERCEL ? os.tmpdir() : process.cwd();
const outputDir = path.join(writableRoot, ".generated", "documents");
const templatePath = path.join(process.cwd(), "templates", "lbs_template.docx");

type RunOptions = {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  size?: number;
};

type ParagraphOptions = {
  center?: boolean;
  borderBottom?: boolean;
  indentLeft?: number;
  hanging?: number;
  list?: boolean;
  keepNext?: boolean;
  spacingAfter?: number;
  line?: number;
  tabPos?: number;
};

function text(value?: string): string {
  return value?.trim() ?? "";
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function runProperties(options: RunOptions = {}): string {
  return [
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>',
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.color ? `<w:color w:val="${options.color}"/>` : "",
    `<w:sz w:val="${options.size ?? 18}"/>`,
    `<w:szCs w:val="${options.size ?? 18}"/>`
  ].join("");
}

function run(value: string, options: RunOptions = {}): string {
  if (!value) return "";
  const space = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : "";
  return `<w:r><w:rPr>${runProperties(options)}</w:rPr><w:t${space}>${xmlEscape(value)}</w:t></w:r>`;
}

function tab(): string {
  return `<w:r><w:tab/></w:r>`;
}

function paragraph(children: string[], options: ParagraphOptions = {}): string {
  const pPr = [
    options.list ? '<w:pStyle w:val="ListParagraph"/>' : "",
    options.list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr>' : "",
    options.keepNext ? "<w:keepNext/>" : "",
    options.borderBottom
      ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>'
      : "",
    `<w:spacing w:after="${options.spacingAfter ?? 0}" w:line="${options.line ?? 210}" w:lineRule="auto"/>`,
    options.center ? '<w:jc w:val="center"/>' : "",
    options.tabPos ? `<w:tabs><w:tab w:val="left" w:pos="${options.tabPos}"/></w:tabs>` : "",
    options.indentLeft || options.hanging
      ? `<w:ind${options.indentLeft ? ` w:left="${options.indentLeft}"` : ""}${options.hanging ? ` w:hanging="${options.hanging}"` : ""}/>`
      : "",
    `<w:rPr>${runProperties()}</w:rPr>`
  ].join("");

  return `<w:p><w:pPr>${pPr}</w:pPr>${children.join("")}</w:p>`;
}

function divider(): string {
  return paragraph([], { borderBottom: true, line: 100 });
}

function sectionTitle(title: string): string {
  return `${divider()}${paragraph([run(title.toUpperCase(), { bold: true })], {
    keepNext: true,
    spacingAfter: 0
  })}`;
}

function dateRange(start?: string, end?: string): string {
  const startText = text(start);
  const endText = text(end);
  if (startText && endText) return `${startText} - ${endText}`;
  return startText || endText || "";
}

function entryHeading(date: string, heading: string): string {
  return paragraph([run(date, { bold: true }), tab(), run(heading, { bold: true })], {
    indentLeft: 1440,
    hanging: 1440,
    tabPos: 1440,
    keepNext: true
  });
}

function indentedLine(value: string, options: RunOptions = {}): string {
  return paragraph([run(value, options)], {
    indentLeft: 1440,
    keepNext: true
  });
}

function bullet(value: string): string {
  return paragraph([run(value)], {
    list: true,
    indentLeft: 2160,
    hanging: 360
  });
}

function contactLine(profile: CandidateProfile): string {
  return [
    profile.contact.email,
    profile.contact.phone,
    profile.contact.location,
    profile.contact.linkedin
  ]
    .filter(Boolean)
    .join(" | ");
}

function educationSection(profile: CandidateProfile, locale: Locale): string {
  if (!profile.education.length) return "";
  const text = t(locale).cv;

  const entries = profile.education
    .map((item) => {
      const heading = [item.institution, item.location].filter(Boolean).join(", ");
      const degree = [item.degree, item.field].filter(Boolean).join(" - ");
      const highlights = item.highlights.map((highlight) => indentedLine(highlight));

      return [
        entryHeading(dateRange(item.startDate, item.endDate), heading),
        degree ? indentedLine(degree) : "",
        ...highlights
      ].join("");
    })
    .join("");

  return `${sectionTitle(text.education)}${entries}`;
}

function experienceSection(profile: CandidateProfile, locale: Locale): string {
  if (!profile.experience.length) return "";
  const text = t(locale).cv;

  const entries = profile.experience
    .map((item) => {
      const heading = item.company.includes("(")
        ? item.company.toUpperCase()
        : [item.company.toUpperCase(), item.location].filter(Boolean).join(", ");
      const role = item.role ? indentedLine(item.role, { bold: true }) : "";
      const bullets = item.bullets
        .slice(0, 5)
        .map((itemBullet) => bullet(itemBullet.rewritten || itemBullet.raw))
        .join("");

      return [
        entryHeading(dateRange(item.startDate, item.endDate), heading),
        role,
        bullets
      ].join("");
    })
    .join("");

  return `${sectionTitle(text.businessExperience)}${entries}`;
}

function projectSection(profile: CandidateProfile, locale: Locale): string {
  const projects = [...profile.projects, ...profile.leadership];
  if (!projects.length) return "";
  const text = t(locale).cv;

  const entries = projects
    .map((item) => {
      const bullets = item.bullets.slice(0, 8).map((itemBullet) => bullet(itemBullet.rewritten || itemBullet.raw));
      return [
        entryHeading("", item.name),
        item.role ? indentedLine(item.role, { bold: true }) : "",
        item.description ? indentedLine(item.description) : "",
        ...bullets
      ].join("");
    })
    .join("");

  return `${sectionTitle(text.projectsLeadership)}${entries}`;
}

function additionalInformationSection(profile: CandidateProfile, locale: Locale): string {
  const text = t(locale).cv;
  const lines = [
    profile.skills.length
      ? paragraph([run(`${text.skills}: `, { bold: true }), run(profile.skills.join(", "))], { indentLeft: 284 })
      : "",
    profile.languages.length
      ? paragraph(
          [
            run(`${text.languages}: `, { bold: true }),
            run(
              profile.languages
                .map((language) => [language.language, language.proficiency].filter(Boolean).join(" "))
                .join(", ")
            )
          ],
          { indentLeft: 284 }
        )
      : "",
    profile.awards.length
      ? paragraph([run(`${text.awards}: `, { bold: true }), run(profile.awards.join(", "))], { indentLeft: 284 })
      : ""
  ].filter(Boolean);

  if (!lines.length) return "";

  return `${sectionTitle(text.additionalInformation)}${lines.join("")}`;
}

function fallbackSectPr(): string {
  return '<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:code="9"/><w:pgMar w:top="737" w:right="567" w:bottom="851" w:left="567" w:header="709" w:footer="709" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>';
}

function buildBody(tailoredCv: TailoredCv, sectPr: string): string {
  const { profile } = tailoredCv;
  const labels = t(tailoredCv.locale).cv;
  const name = text(profile.fullName) || labels.fallbackName;
  const contact = contactLine(profile);

  return [
    paragraph([run(name, { bold: true, size: 20 })], { center: true, line: 210 }),
    contact ? paragraph([run(contact, { bold: true })], { center: true, line: 210 }) : "",
    educationSection(profile, tailoredCv.locale),
    experienceSection(profile, tailoredCv.locale),
    projectSection(profile, tailoredCv.locale),
    additionalInformationSection(profile, tailoredCv.locale),
    sectPr
  ].join("");
}

function replaceDocumentBody(templateXml: string, bodyXml: string): string {
  const bodyStart = templateXml.indexOf("<w:body>");
  const bodyEnd = templateXml.indexOf("</w:body>");

  if (bodyStart === -1 || bodyEnd === -1) {
    throw new Error("Template DOCX is missing word/document.xml body.");
  }

  return `${templateXml.slice(0, bodyStart + "<w:body>".length)}${bodyXml}${templateXml.slice(bodyEnd)}`;
}

export async function createCvDocx(tailoredCv: TailoredCv): Promise<{
  id: string;
  fileName: string;
  filePath: string;
  base64: string;
}> {
  await fs.mkdir(outputDir, { recursive: true });

  const templateBuffer = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentEntry = zip.file("word/document.xml");

  if (!documentEntry) {
    throw new Error("Template DOCX is missing word/document.xml.");
  }

  const templateXml = await documentEntry.async("string");
  const sectPr = templateXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)?.at(-1) ?? fallbackSectPr();
  const bodyXml = buildBody(tailoredCv, sectPr);
  zip.file("word/document.xml", replaceDocumentBody(templateXml, bodyXml));

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE"
  });

  const id = crypto.randomUUID();
  const labels = t(tailoredCv.locale).cv;
  const safeName = (tailoredCv.profile.fullName || labels.adapted)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const fileName = `${safeName || labels.adapted}-${tailoredCv.locale}-lbs.docx`;
  const filePath = path.join(outputDir, `${id}-${fileName}`);

  await fs.writeFile(filePath, buffer);

  return { id, fileName, filePath, base64: buffer.toString("base64") };
}
