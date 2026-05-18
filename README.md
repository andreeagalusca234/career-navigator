# Career Navigator: Gemma 4 CV Coach

Career Navigator is a bilingual CV coach for students and early-career candidates who need practical career support without expensive coaching. The app extracts a CV, asks only for missing evidence, reads a target job description, analyzes fit, and generates an LBS-style `.docx` CV.

The project is built for the Gemma 4 Good Hackathon, with the strongest fit in the Digital Equity & Inclusivity impact track.

## Gemma 4 Usage

The app uses Gemma 4 through the Gemini API:

- `gemma-4-26b-a4b-it` for fast job-description extraction.
- `gemma-4-31b-it` for higher-quality CV analysis and final tailoring.
- Local deterministic fallbacks keep the demo usable if the API key is missing, but the intended public demo should run with a real `GEMINI_API_KEY`.

Relevant implementation files:

- `lib/ai/gemma.ts` - Gemma 4 API wrapper.
- `lib/cv/job-description.ts` - Gemma-powered job extraction.
- `lib/cv/analyze.ts` - Gemma-powered CV analysis.
- `lib/cv/tailor.ts` - Gemma-powered CV tailoring.

Google references:

- Gemma 4 model overview: https://deepmind.google/models/gemma/gemma-4/
- Gemma with Gemini API: https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api

## Features

- Romanian and English platform switch.
- CV upload from PDF or DOCX.
- Chatbot-style coaching with speech input and answer playback.
- Structured profile memory with a full reset button.
- LBS CV guidance, CAR bullet rewriting, and action-word checks.
- Role-specific CV analysis and DOCX generation.
- Public-demo friendly document storage fallback.

## Local Setup

```bash
npm install
docker compose up -d
copy .env.example .env
npm run db:push
npm run dev
```

Open `http://127.0.0.1:3000`.

Required environment variables:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cvcoach"
GEMINI_API_KEY="your-google-ai-studio-key"
GEMMA_MODEL="gemma-4-26b-a4b-it"
GEMMA_REASONING_MODEL="gemma-4-31b-it"
```

## Deployment

Recommended quick path:

1. Push this repository to a public GitHub repo.
2. Create a hosted PostgreSQL database, for example Neon, Supabase, Railway, or Vercel Postgres.
3. Deploy to Vercel or Railway.
4. Set `DATABASE_URL`, `GEMINI_API_KEY`, `GEMMA_MODEL`, and `GEMMA_REASONING_MODEL`.
5. Run `npm run db:push` once against the production database.

Build checks:

```bash
npm run typecheck
npm run build
```

## Competition Assets

Submission materials are in `docs/`:

- `docs/KAGGLE_WRITEUP.md`
- `docs/VIDEO_SCRIPT.md`
- `docs/DEPLOYMENT.md`
- `docs/SUBMISSION_CHECKLIST.md`

The media-gallery cover draft is `public/kaggle-cover.svg`.

## Privacy

Uploaded CV files are parsed in memory. The app stores structured profile data and generated CV metadata for the anonymous session. For production, add auth, explicit retention controls, and a delete-my-data workflow.

## License

CC-BY-4.0 for hackathon submission compatibility.
