# Deployment Guide

## Fastest Public Demo Path

Use Vercel for the Next.js app and a hosted PostgreSQL database for Prisma.

## 1. Create the Database

Use one of:

- Neon
- Supabase
- Railway PostgreSQL
- Vercel Postgres

Copy the production `DATABASE_URL`.

## 2. Create a Google AI Studio Key

Create an API key in Google AI Studio and set it as `GEMINI_API_KEY`.

The app defaults to:

```env
GEMMA_MODEL="gemma-4-26b-a4b-it"
GEMMA_REASONING_MODEL="gemma-4-31b-it"
```

## 3. Push the Repo Publicly

Make sure these are not committed:

- `.env`
- `.generated/`
- `.next/`
- `node_modules/`
- logs
- uploaded personal CV files

The `.gitignore` already excludes these.

## 4. Deploy on Vercel

1. Import the public GitHub repository into Vercel.
2. Add environment variables:

```env
DATABASE_URL="..."
GEMINI_API_KEY="..."
GEMMA_MODEL="gemma-4-26b-a4b-it"
GEMMA_REASONING_MODEL="gemma-4-31b-it"
```

3. Build command:

```bash
npm run build
```

4. Install command:

```bash
npm install
```

5. After deployment, run the production database push once:

```bash
npx prisma db push
```

You can run it locally by temporarily setting the production `DATABASE_URL`, or from a provider console if available.

## 5. Demo Test

Before submitting to Kaggle, test the public URL:

1. Open the app in an incognito browser.
2. Upload a sample CV with no private data.
3. Paste a job description.
4. Click analysis.
5. Generate and download the DOCX.
6. Reset the session and confirm the app starts cleanly.

## Fallback Option

If Vercel deployment is blocked by time, Railway is a good single-provider option because it can host both the Node app and PostgreSQL.
