# Romanian Conversational CV Coach - Build Plan

## 1. Product Summary

Build a Romanian-first conversational CV coach for students and early-career professionals who cannot access premium career coaching.

The app has one core job:

> Help a Romanian-speaking user build, improve, and download a recruiter-grade CV through a natural conversation.

The product must feel closer to a calm, expert career advisor than a form builder. The user should never face a long questionnaire. The system asks one useful question at a time, remembers answers, detects gaps, requests the target job description, then generates feedback and a tailored CV.

## 2. Non-Negotiable Product Principles

1. Romanian conversation only
   - UI copy, chatbot, error states, help text, and follow-up questions should be in Romanian.
   - Exception: the final CV can be in English if the target job description is in English or the user requests an English CV.

2. No forms unless unavoidable
   - Forms are the enemy of this product.
   - Use conversation, chips, buttons, upload cards, and inline corrections.

3. Ask only what is missing
   - Uploaded CV flow must not ask for information already present.
   - Scratch flow must ask one question at a time and progressively build the profile.

4. Job-description-first tailoring
   - The app should extract role, company, seniority, keywords, requirements, and success criteria from the pasted/uploaded job description.
   - Do not ask the user to manually enter role and company if the JD contains them.

5. Simple stack
   - Next.js frontend and backend routes.
   - Node WebSocket service only if using Gemini Live voice/realtime mode.
   - Local PostgreSQL.
   - Vercel AI SDK for agent orchestration.
   - Gemini API for language, file understanding, and Live API where needed.

6. Privacy by default
   - No auth for MVP.
   - Use anonymous session IDs stored in localStorage.
   - Delete uploaded files after extraction unless explicitly needed for debugging.
   - Store structured profile, not raw CV, by default.

## 3. Important Technical Clarification

The user mentioned "Gemma 4". The correct product API for this app should be Gemini, not Gemma. Gemma is Google's open model family, while Gemini API is the hosted product API suitable for document understanding, structured generation, and Live conversational interaction.

Recommended approach:

- Use Vercel AI SDK with Gemini for normal text chat, tool calling, structured extraction, and CV generation.
- Use Gemini Live API only for real-time voice/audio or ultra-low-latency conversational mode.
- Keep the first MVP text-first. Add Live voice as Phase 2.

Reason: Gemini Live API uses stateful WebSockets. Vercel serverless functions are not the right place to host long-lived WebSocket proxy connections. For Live mode, run a separate Node WebSocket service locally now, later deploy it to Render, Fly.io, Railway, or another long-running Node host.

## 4. MVP Scope

### Included in MVP

- Landing screen in Romanian.
- Two choices:
  - "Am deja un CV"
  - "Vreau sa il construim de la zero"
- PDF upload flow.
- CV extraction into structured profile.
- Scratch conversation flow.
- Job description paste/upload step.
- AI feedback using a CV quality rubric.
- Tailored CV generation.
- Download as `.docx`.
- Save anonymous sessions in local PostgreSQL.
- Resume editing loop through chat.
- Simple admin-free local development setup.

### Excluded from MVP

- Auth.
- Payments.
- User accounts.
- Human coach marketplace.
- Full interview coaching.
- Alumni network matching.
- Multi-language UI beyond Romanian.
- Production analytics beyond basic event logging.
- Google Docs export.
- PDF export, unless easy after `.docx` generation.

## 5. Recommended Architecture

```mermaid
flowchart TD
  A[Next.js App Router UI] --> B[Next.js API Routes]
  B --> C[Vercel AI SDK Agent]
  C --> D[Gemini Text and File Models]
  C --> E[Agent Tools]
  E --> F[PostgreSQL]
  E --> G[DOCX Generator]
  B --> H[Local File Temp Storage]
  A --> I[Optional Live Voice Client]
  I --> J[Node WebSocket Live Proxy]
  J --> K[Gemini Live API]
```

### MVP architecture

Use only this path first:

```text
Next.js UI -> API route -> Vercel AI SDK -> Gemini -> tools -> Postgres -> DOCX
```

### Phase 2 Live architecture

Use this path only when adding voice:

```text
Browser microphone -> Node WebSocket proxy -> Gemini Live API -> browser audio/chat UI
```

## 6. Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js App Router, React, TypeScript | Fast full-stack development |
| Styling | Tailwind CSS, shadcn/ui, Radix primitives | Clean, accessible UI with Airbnb-like polish |
| AI orchestration | Vercel AI SDK | Streaming chat, tool calling, structured outputs |
| AI model | Gemini via `@ai-sdk/google` | Gemini support inside AI SDK |
| Live realtime | Gemini Live API via Node WebSocket proxy | Required for native audio/live conversation |
| Backend | Next.js route handlers plus optional Node `ws` service | Simplest setup now, scalable later |
| Database | Local PostgreSQL | Good relational model for sessions, profiles, messages |
| ORM | Prisma or Drizzle | Pick one. Recommendation: Prisma for speed and clarity |
| File handling | Temporary local upload folder for MVP | Avoid object storage until production |
| DOCX export | `docx` npm package | Reliable Word document generation |
| Validation | Zod | Shared schema validation for agent tools and APIs |
| Package manager | pnpm | Faster, cleaner monorepo support |

## 7. Suggested Repository Structure

```text
cv-coach-ro/
  app/
    page.tsx
    layout.tsx
    api/
      chat/route.ts
      upload-cv/route.ts
      analyze/route.ts
      generate-cv/route.ts
      download/[documentId]/route.ts
  components/
    landing/
    chat/
    upload/
    resume/
    ui/
  lib/
    ai/
      agent.ts
      prompts.ts
      tools.ts
      schemas.ts
      models.ts
    cv/
      extract.ts
      score.ts
      tailor.ts
      docx.ts
      templates.ts
    db/
      prisma.ts
    files/
      upload.ts
      cleanup.ts
    utils/
  prisma/
    schema.prisma
    migrations/
  live-server/
    index.ts
    gemini-live.ts
  public/
  tests/
    fixtures/
      sample-cv.pdf
      sample-jd.txt
    evals/
  docker-compose.yml
  .env.example
  README.md
```

## 8. Core User Flows

## 8.1 Entry Flow

Screen copy:

```text
Hai sa construim un CV care chiar te ajuta sa obtii interviuri.

Ai deja un CV sau il construim de la zero?

[Am deja un CV]
[Vreau sa il construim de la zero]
```

Rules:

- No signup.
- Generate `sessionId` on first visit.
- Store `sessionId` in localStorage.
- Create `Session` row in Postgres.

## 8.2 Uploaded CV Flow

1. User clicks "Am deja un CV".
2. Show upload card.
3. Accept PDF only for MVP.
4. Upload PDF to `/api/upload-cv`.
5. Validate:
   - MIME type: `application/pdf`
   - Max size: 10 MB
   - Reject encrypted or unreadable PDFs
6. Send file to Gemini extraction pipeline.
7. Extract structured profile.
8. Store structured profile in Postgres.
9. Delete raw uploaded PDF.
10. Bot summarizes what it found in Romanian.
11. Bot asks only the highest-priority missing question.
12. After minimum profile completeness is reached, request job description.

Example bot response:

```text
Am citit CV-ul tau. Am gasit educatia, doua experiente de lucru si cateva competente tehnice.

Lipsesc insa rezultatele masurabile. Pentru experienta de la Deloitte, care a fost cel mai concret impact al muncii tale? De exemplu: venit crescut, costuri reduse, timp economisit, clienti deserviti sau procese imbunatatite.
```

## 8.3 Scratch Flow

1. User clicks "Vreau sa il construim de la zero".
2. Bot starts with education.
3. Then work experience.
4. Then projects, leadership, volunteering, awards, skills.
5. Ask one question at a time.
6. Use quick reply chips where useful.
7. Store every answer as structured data, not only raw messages.
8. Once enough information exists, request job description.

Question order:

1. Name and target geography, optional in MVP.
2. Education.
3. Work experience, most recent first.
4. Achievements inside each role.
5. Projects and leadership.
6. Skills.
7. Languages.
8. Target job description.

## 8.4 Job Description Flow

The bot asks:

```text
Trimite descrierea jobului pentru care vrei sa adaptezi CV-ul. Poti copia textul aici sau poti incarca un fisier.
```

System extracts:

- Company.
- Role title.
- Location.
- Seniority.
- Required skills.
- Preferred skills.
- Keywords.
- Responsibilities.
- Evaluation criteria.
- Likely recruiter priorities.

Then show three action buttons:

```text
[Analizeaza CV-ul meu]
[Genereaza CV adaptat]
[Ce imi lipseste pentru rol?]
```

The user only listed two options, but the third is strategically useful. If you want maximum simplicity, hide the third behind the analysis view.

## 8.5 Analysis Flow

Output structure:

1. Overall score.
2. Recruiter-readiness verdict.
3. Biggest weaknesses.
4. Missing evidence.
5. Bullet-level rewrites.
6. Role match against JD.
7. Priority improvements.

Do not give generic advice. Every recommendation must map to either:

- A missing CV field.
- A weak bullet.
- A requirement in the job description.
- A recruiter concern.

## 8.6 Generate Tailored CV Flow

1. User clicks "Genereaza CV adaptat".
2. Agent calls `generateTailoredCv` tool.
3. Tool creates final structured CV JSON.
4. Agent asks for confirmation only if critical details are missing.
5. Generate `.docx` with strict template.
6. Save generated document metadata.
7. Show download button.

Output UX:

```text
CV-ul tau adaptat este gata.

[Descarca DOCX]
[Revizuieste sectiunea Experienta]
[Genereaza o versiune mai concisa]
```

## 9. Agent Design

## 9.1 Agent Responsibilities

The agent must:

- Speak Romanian.
- Detect flow state.
- Extract structured data from natural conversation.
- Avoid repeat questions.
- Ask one question at a time.
- Use tools for all state changes.
- Keep a profile completeness score.
- Decide when to ask for the job description.
- Generate analysis and tailored CV only after enough information exists.

The agent must not:

- Invent work experience.
- Invent metrics.
- Overstate achievements.
- Ask for sensitive personal data unless required for the CV.
- Create long generic career advice.
- Switch to English in conversation unless the user asks.

## 9.2 Agent Tools

Use Vercel AI SDK tools with Zod schemas.

Recommended tools:

| Tool | Purpose |
|---|---|
| `getSessionState` | Load current session, flow, profile, JD status |
| `updateCandidateProfile` | Patch structured CV profile |
| `extractCvFromUpload` | Convert PDF CV into structured profile |
| `ingestJobDescription` | Extract target role, company, keywords, criteria |
| `getMissingProfileFields` | Return only missing or weak fields |
| `scoreCvAgainstRubric` | Score CV using internal rubric |
| `scoreFitAgainstJob` | Compare profile to JD |
| `rewriteBullet` | Rewrite one CV bullet with evidence and impact |
| `generateTailoredCv` | Produce final structured CV JSON |
| `createDocx` | Render DOCX file from structured CV |
| `saveConversationEvent` | Persist useful product events |

## 9.3 Agent Loop Rules

Use a bounded multi-step agent loop.

Recommended defaults:

```ts
stopWhen: stepCountIs(5)
```

Increase only for generation flows:

```ts
stopWhen: stepCountIs(8)
```

Reason:

- CV generation may require profile load, JD load, gap check, structured generation, and document rendering.
- Normal chat should stay fast and cheap.

## 10. Data Model

Use a structured resume profile instead of relying on chat history.

### Prisma schema draft

```prisma
model Session {
  id            String   @id @default(cuid())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  locale        String   @default("ro")
  flowState     String   @default("ENTRY")
  profile       CandidateProfile?
  jobDescription JobDescription?
  messages      Message[]
  documents     GeneratedDocument[]
  events        Event[]
}

model CandidateProfile {
  id          String   @id @default(cuid())
  sessionId   String   @unique
  session     Session  @relation(fields: [sessionId], references: [id])
  fullName    String?
  email       String?
  phone       String?
  location    String?
  linkedin    String?
  summary     String?
  education   Json     @default("[]")
  experience  Json     @default("[]")
  projects    Json     @default("[]")
  leadership  Json     @default("[]")
  skills      Json     @default("[]")
  languages   Json     @default("[]")
  awards      Json     @default("[]")
  completenessScore Int @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model JobDescription {
  id              String   @id @default(cuid())
  sessionId        String   @unique
  session          Session  @relation(fields: [sessionId], references: [id])
  rawText          String
  company          String?
  roleTitle        String?
  location         String?
  seniority        String?
  requiredSkills   Json     @default("[]")
  preferredSkills  Json     @default("[]")
  responsibilities Json     @default("[]")
  keywords         Json     @default("[]")
  recruiterSignals Json    @default("[]")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model Message {
  id        String   @id @default(cuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  role      String
  content   String
  metadata  Json?
  createdAt DateTime @default(now())
}

model GeneratedDocument {
  id        String   @id @default(cuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  type      String
  fileName  String
  filePath  String
  version   Int      @default(1)
  metadata  Json?
  createdAt DateTime @default(now())
}

model Event {
  id        String   @id @default(cuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  name      String
  payload   Json?
  createdAt DateTime @default(now())
}
```

## 11. Core Schemas

### Candidate profile JSON

```ts
export const CandidateProfileSchema = z.object({
  fullName: z.string().optional(),
  contact: z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
  }).optional(),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string().optional(),
    field: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    location: z.string().optional(),
    highlights: z.array(z.string()).default([]),
  })).default([]),
  experience: z.array(z.object({
    company: z.string(),
    role: z.string(),
    location: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    bullets: z.array(z.object({
      raw: z.string(),
      rewritten: z.string().optional(),
      evidenceLevel: z.enum(["weak", "medium", "strong"]).default("weak"),
      metrics: z.array(z.string()).default([]),
    })).default([]),
  })).default([]),
  projects: z.array(z.any()).default([]),
  skills: z.array(z.string()).default([]),
  languages: z.array(z.object({
    language: z.string(),
    proficiency: z.string().optional(),
  })).default([]),
});
```

### Job description JSON

```ts
export const JobDescriptionSchema = z.object({
  company: z.string().optional(),
  roleTitle: z.string().optional(),
  location: z.string().optional(),
  seniority: z.string().optional(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  recruiterSignals: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});
```

## 12. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Main Romanian agent chat |
| `/api/upload-cv` | POST | Upload PDF, extract profile, delete raw file |
| `/api/analyze` | POST | Analyze current profile against rubric and JD |
| `/api/generate-cv` | POST | Generate tailored CV JSON and DOCX |
| `/api/download/[documentId]` | GET | Download generated DOCX |
| `/api/session` | POST/GET | Create or load anonymous session |

## 13. AI Model Usage

Use environment variables, not hardcoded model names.

```env
GEMINI_API_KEY=""
GEMINI_CHAT_MODEL="gemini-2.5-flash"
GEMINI_REASONING_MODEL="gemini-2.5-pro"
GEMINI_LIVE_MODEL="gemini-live-2.5-flash-native-audio"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cvcoach"
```

Recommended split:

| Task | Model class | Notes |
|---|---|---|
| Normal chat | Fast Gemini model | Low latency, low cost |
| CV PDF extraction | Gemini document-capable model | Needs PDF input support |
| JD extraction | Fast Gemini model with structured output | Low cost |
| CV analysis | Stronger reasoning model | Quality matters |
| Tailored CV generation | Stronger reasoning model | Quality matters |
| Live voice | Gemini Live model | Phase 2 only |

## 14. Prompting Strategy

## 14.1 Main system prompt, Romanian

```text
Esti un consilier de cariera expert pentru studenti si candidati early-career care aplica la companii competitive.

Vorbesti intotdeauna in limba romana. Esti direct, clar si practic. Nu folosesti jargon inutil. Nu pui mai mult de o intrebare principala odata.

Obiectivul tau este sa construiesti, imbunatatesti si adaptezi CV-ul utilizatorului pentru un rol tinta.

Reguli stricte:
- Nu inventa experiente, cifre, rezultate sau competente.
- Daca lipsesc metrici, intreaba utilizatorul pentru exemple reale.
- Daca utilizatorul a incarcat un CV, nu intreba lucruri deja prezente in CV.
- Cere descrierea jobului inainte de analiza finala sau generarea CV-ului adaptat.
- Prioritizeaza claritatea, impactul masurabil, relevanta pentru rol si formatul potrivit pentru recrutori.
- Cand ai nevoie de date structurate, foloseste tool-urile disponibile.
- Raspunsurile trebuie sa fie scurte, utile si actionabile.
```

## 14.2 CV extraction prompt

```text
Extrage informatiile din CV in schema structurata furnizata.

Nu inventa date lipsa. Daca un camp nu apare in CV, lasa-l gol.
Pastreaza bullet-urile originale, dar marcheaza nivelul de evidenta:
- weak: descrie activitati fara rezultate
- medium: are rezultate partiale sau competente clare
- strong: include actiune, impact si metrici

Returneaza doar JSON valid.
```

## 14.3 JD extraction prompt

```text
Extrage rolul tinta din descrierea jobului.

Identifica firma, titlul rolului, senioritatea, competentele cerute, competentele preferate, responsabilitatile, cuvintele-cheie si semnalele pe care un recrutor probabil le va cauta in CV.

Returneaza doar JSON valid.
```

## 14.4 Feedback prompt

```text
Analizeaza CV-ul candidatului fata de descrierea jobului si fata de un standard de CV pentru roluri competitive.

Evalueaza:
1. Claritatea profilului
2. Relevanta fata de rol
3. Calitatea bullet-urilor
4. Dovezi si metrici
5. Structura si prioritizare
6. Riscuri pentru recruiter
7. Actiuni concrete de imbunatatire

Nu da sfaturi generice. Leaga fiecare recomandare de un exemplu concret din CV sau de o cerinta din job description.
Raspunde in romana.
```

## 15. CV Quality Rubric

Score each dimension from 1 to 5.

| Dimension | What good looks like |
|---|---|
| Target fit | CV clearly mirrors the role's most important requirements |
| Bullet quality | Bullets use action, context, result, and quantified impact |
| Evidence | Claims are backed by metrics, scope, tools, clients, revenue, cost, users, time saved |
| Structure | Best material appears first, no clutter, consistent formatting |
| Seniority signal | CV sounds appropriate for the target level |
| Differentiation | Candidate has clear edge versus similar applicants |
| Readability | Recruiter can understand the profile in 30 seconds |
| Risk reduction | Gaps, vague claims, and irrelevant content are minimized |

Final scoring:

```text
85-100: Strong, ready to apply after minor edits
70-84: Good base, needs targeted improvement
55-69: Risky, likely to underperform with recruiters
0-54: Not ready, needs substantial rebuilding
```

## 16. DOCX Generation Rules

Use a deterministic DOCX renderer. Do not ask the model to generate Word formatting.

Pipeline:

```text
Structured CV JSON -> Template renderer -> DOCX file -> Download link
```

Recommended document format:

- One page for undergraduate/MBA internship/early career unless experience requires two.
- Name at top.
- Contact line.
- Education.
- Experience.
- Leadership/projects.
- Skills/languages.
- No photo.
- No Europass format.
- No graphics-heavy design.
- Consistent dates and locations.
- Bullet points start with strong action verbs.
- Metrics included where true.

Template variants:

1. Consulting / business.
2. Finance.
3. Tech / product.
4. General graduate role.

MVP can ship only one clean general template.

## 17. UX and Visual Design

## 17.1 Design direction

Airbnb-like means:

- Generous whitespace.
- Rounded cards.
- Soft shadows.
- Warm neutral background.
- Coral/red accent.
- Simple typography.
- High trust, low noise.
- Very few visible controls.

Do not copy Airbnb brand assets. Use the aesthetic principle, not their exact identity.

## 17.2 Design tokens

```ts
const theme = {
  background: "#FFF8F3",
  surface: "#FFFFFF",
  text: "#222222",
  mutedText: "#717171",
  border: "#E5E5E5",
  accent: "#FF5A5F",
  accentDark: "#E0484D",
  radius: "24px",
};
```

## 17.3 Key screens

### Landing

- Centered hero card.
- One sentence value proposition.
- Two large choice buttons.
- Tiny privacy reassurance.

### Upload

- Drag-and-drop upload card.
- Progress state.
- Extraction state with short Romanian copy.
- No technical details.

### Chat workspace

Desktop:

- Left: conversation.
- Right: live CV preview / profile completeness.

Mobile:

- Conversation first.
- Sticky bottom input.
- CV preview as bottom sheet.

### Analysis

- Score card.
- Top three fixes.
- Role match section.
- Bullet rewrites.
- CTA to generate tailored CV.

### Download

- Simple success card.
- Download button.
- Secondary actions for revision.

## 18. Frontend Components

```text
<LandingChoice />
<UploadCard />
<ChatShell />
<MessageBubble />
<QuickReplyButtons />
<ProfileCompleteness />
<CvPreview />
<AnalysisScoreCard />
<RecommendationList />
<BulletRewriteCard />
<DownloadCard />
```

## 19. Conversation State Machine

```text
ENTRY
  -> UPLOAD_CV
  -> SCRATCH_START

UPLOAD_CV
  -> EXTRACTING_CV
  -> CV_REVIEW_SUMMARY
  -> FILLING_GAPS
  -> REQUEST_JOB_DESCRIPTION

SCRATCH_START
  -> COLLECT_EDUCATION
  -> COLLECT_EXPERIENCE
  -> COLLECT_ACHIEVEMENTS
  -> COLLECT_SKILLS
  -> REQUEST_JOB_DESCRIPTION

REQUEST_JOB_DESCRIPTION
  -> JD_INGESTED
  -> READY_FOR_ACTION

READY_FOR_ACTION
  -> ANALYSIS
  -> GENERATING_CV
  -> DOWNLOADING
  -> REVISION_LOOP
```

State should be stored in `Session.flowState`.

## 20. Local Development Setup

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: cvcoach
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Install

```bash
pnpm create next-app cv-coach-ro --typescript --tailwind --eslint --app
cd cv-coach-ro
pnpm add ai @ai-sdk/google zod prisma @prisma/client docx react-dropzone
pnpm add -D tsx
pnpm prisma init
```

Optional for Live API proxy:

```bash
pnpm add ws @google/genai
pnpm add -D @types/ws
```

## 21. Implementation Milestones

## Phase 0 - Project skeleton, 0.5 day

Deliverables:

- Next.js app created.
- Tailwind and shadcn/ui configured.
- Local PostgreSQL running.
- Prisma connected.
- `.env.example` created.
- Basic landing page.

Definition of done:

- `pnpm dev` works.
- Database migration works.
- Landing screen shows two user choices.

## Phase 1 - Anonymous sessions and chat shell, 1 day

Deliverables:

- Anonymous session creation.
- Chat UI.
- `/api/chat` route.
- Vercel AI SDK connected to Gemini.
- Messages stored in Postgres.
- Romanian system prompt active.

Definition of done:

- User can chat in Romanian.
- Refresh keeps session and history.
- Bot asks entry flow question correctly.

## Phase 2 - Scratch CV builder, 1.5 days

Deliverables:

- State machine.
- `updateCandidateProfile` tool.
- Profile completeness calculation.
- One-question-at-a-time flow.
- Live CV preview from structured profile.

Definition of done:

- User can build a minimum profile without uploading a CV.
- Data is stored structurally.
- Bot does not ask the same question repeatedly.

## Phase 3 - PDF upload and extraction, 1.5 days

Deliverables:

- Upload UI.
- `/api/upload-cv` route.
- Gemini PDF extraction.
- Structured profile save.
- Gap detection.
- Raw file deletion.

Definition of done:

- User uploads PDF.
- App extracts profile.
- Bot summarizes found info and asks only for missing high-priority info.

## Phase 4 - Job description ingestion, 1 day

Deliverables:

- JD paste box inside chat.
- `ingestJobDescription` tool.
- Role/company/keyword extraction.
- Ready-for-action state.
- Action buttons.

Definition of done:

- User pastes JD.
- App extracts target role and company automatically.
- User sees action buttons.

## Phase 5 - CV analysis, 1.5 days

Deliverables:

- CV quality rubric.
- JD fit scoring.
- Analysis UI.
- Top recommendations.
- Bullet rewrite suggestions.

Definition of done:

- Analysis is specific to the user's CV and JD.
- No generic advice.
- Recommendations are ranked by impact.

## Phase 6 - Tailored CV and DOCX download, 2 days

Deliverables:

- `generateTailoredCv` tool.
- Final structured CV JSON.
- DOCX renderer.
- Download endpoint.
- Revision loop.

Definition of done:

- User can generate and download a Word CV.
- User can ask for revisions through chat.
- Generated file uses deterministic formatting.

## Phase 7 - Polish and QA, 1.5 days

Deliverables:

- Mobile responsive UI.
- Loading states.
- Empty states.
- Error handling.
- Romanian copy review.
- Basic eval set.
- Cost and latency logging.

Definition of done:

- App feels smooth on mobile.
- Common failures are handled cleanly.
- 10 sample CV/JD tests pass.

## Phase 8 - Optional Gemini Live voice, 2-4 days

Deliverables:

- Node WebSocket proxy.
- Browser microphone capture.
- Live API connection.
- Audio playback.
- Transcript capture.
- Profile update from transcript.

Definition of done:

- User can speak to the coach in Romanian.
- Transcript is saved.
- Agent can update structured profile from spoken answers.

Do not build this before the text MVP works.

## 22. Testing and Evaluation

## 22.1 Unit tests

Test:

- Profile completeness calculation.
- JD extraction schema validation.
- CV JSON to DOCX rendering.
- Session creation.
- Flow state transitions.

## 22.2 AI evals

Create fixture set:

```text
sample-cv-weak.pdf
sample-cv-strong.pdf
sample-jd-consulting.txt
sample-jd-finance.txt
sample-jd-product.txt
scratch-conversation-1.json
scratch-conversation-2.json
```

Eval criteria:

- Does the bot stay in Romanian?
- Does it avoid repeating known questions?
- Does it refuse to invent metrics?
- Does it ask for JD before final tailoring?
- Does it produce role-specific recommendations?
- Does the CV output fit the target role?

## 22.3 Manual QA checklist

- Upload invalid file.
- Upload large file.
- Upload CV with missing metrics.
- Upload CV with Romanian content.
- Paste English JD.
- Paste Romanian JD.
- User gives vague answer.
- User says "nu stiu".
- User asks to exaggerate experience.
- User refreshes page.
- User downloads DOCX.

## 23. Security and Privacy

MVP rules:

- No auth, but use anonymous session ID.
- Do not expose Gemini API key to browser.
- Validate file type and size.
- Delete uploaded PDF after extraction.
- Sanitize file names.
- Store generated DOCX locally during development only.
- Add clear privacy text on upload screen.

Upload privacy copy:

```text
CV-ul tau este folosit pentru a extrage informatiile necesare si este sters dupa procesare in versiunea MVP locala.
```

Production later:

- Add auth.
- Add explicit consent.
- Add file retention setting.
- Add encryption at rest.
- Add delete-my-data flow.
- Move file storage to Google Cloud Storage or Vercel Blob.

## 24. Error Handling

| Failure | User-facing response |
|---|---|
| PDF unreadable | "Nu am putut citi PDF-ul. Te rog incarca o versiune exportata direct din Word/Google Docs." |
| Gemini error | "A aparut o eroare la analiza. Te rog incearca din nou." |
| Missing JD | "Pentru o analiza utila, am nevoie de descrierea jobului." |
| Weak answer | "E un inceput bun. Ai un exemplu concret de rezultat sau impact?" |
| User wants fake metrics | "Nu pot inventa rezultate. Pot reformula elegant ce ai facut real." |

## 25. Product Metrics

Track anonymously:

- Started session.
- Chose upload vs scratch.
- Uploaded CV successfully.
- Completed profile.
- Added JD.
- Clicked analysis.
- Generated CV.
- Downloaded DOCX.
- Asked for revision.

Quality metrics:

- Average completeness before generation.
- Average analysis score.
- Number of questions asked before JD.
- Generation failure rate.
- DOCX download success rate.

## 26. Main Risks

| Risk | Mitigation |
|---|---|
| Bot asks too many questions | Use missing-field priority and one-question rule |
| CV output is generic | Force JD-grounded generation and rubric scoring |
| Model invents achievements | Strict prompt plus tool schemas plus evidence levels |
| Live API complicates MVP | Ship text MVP first, add voice later |
| WebSockets do not fit Vercel serverless | Use separate Node WebSocket service for Live mode |
| DOCX formatting inconsistent | Deterministic renderer, never model-generated formatting |
| Romanian language sounds unnatural | Review product copy manually, keep responses short |

## 27. Build Order Recommendation

Do not start with Gemini Live.

Build in this order:

1. Text chat agent.
2. Structured profile memory.
3. CV upload extraction.
4. JD extraction.
5. Analysis.
6. DOCX generation.
7. UX polish.
8. Gemini Live voice.

This avoids the classic mistake: building impressive realtime infrastructure before the product actually helps users get better CVs.

## 28. First Sprint Task List

### Day 1

- Create Next.js app.
- Add Tailwind and UI primitives.
- Add local PostgreSQL Docker Compose.
- Add Prisma schema.
- Create anonymous session flow.
- Build landing choice UI.

### Day 2

- Add `/api/chat`.
- Configure Gemini through Vercel AI SDK.
- Add Romanian system prompt.
- Save messages.
- Build chat shell.

### Day 3

- Add profile schema.
- Add profile update tool.
- Implement scratch flow.
- Add completeness panel.

### Day 4

- Add PDF upload.
- Implement Gemini extraction.
- Save extracted profile.
- Ask missing questions.

### Day 5

- Add JD ingestion.
- Add action buttons.
- Implement first analysis output.

### Day 6-7

- Build DOCX renderer.
- Generate first tailored CV.
- Add download route.
- Fix UX rough edges.

## 29. Definition of MVP Done

The MVP is done when a Romanian-speaking user can:

1. Open the app without signing in.
2. Choose upload or scratch flow.
3. Build or extract a structured profile.
4. Provide a target job description.
5. Receive specific feedback in Romanian.
6. Generate a tailored CV.
7. Download a clean `.docx` file.
8. Revise the CV through chat.

Anything else is secondary.

## 30. Reference Notes

- Gemini Live API supports low-latency realtime audio/vision/text interaction through WebSockets.
- Gemini API supports document/PDF understanding.
- Vercel AI SDK supports Gemini models, streaming text, file inputs, structured outputs, and tool calling.
- Vercel AI SDK agent patterns support tool execution and bounded multi-step loops.
- For production Live API voice, plan a dedicated WebSocket-capable Node service rather than relying on Vercel serverless functions.
