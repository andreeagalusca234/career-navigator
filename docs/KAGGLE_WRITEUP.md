# Career Navigator: Gemma 4 CV Coach

## Subtitle

A bilingual career-coaching assistant that helps Romanian-speaking students turn an existing CV and a target job description into a recruiter-ready, LBS-style CV.

## Track

Impact Track: Digital Equity & Inclusivity

## Summary

Career Navigator addresses a practical equity problem: many talented students and early-career candidates do not have access to premium career coaching, especially in smaller markets or non-native English contexts. The result is not a lack of ability, but a lack of translation between lived experience and recruiter-readable evidence.

The app works like a coach, not a form. A user uploads a PDF or DOCX CV, selects Romanian or English, and pastes a target job description. The assistant extracts what is already present, asks only for genuinely missing evidence, analyzes the profile against the role, and generates a polished `.docx` CV in the selected language.

## How Gemma 4 Is Used

The backend uses Gemma 4 through the Gemini API:

- `gemma-4-26b-a4b-it` extracts structured job-description signals: role title, seniority, required skills, responsibilities, keywords, recruiter signals, and risk areas.
- `gemma-4-31b-it` performs higher-reasoning CV analysis against the target role and the CV rubric.
- `gemma-4-31b-it` also tailors the final structured CV, rewriting only from existing evidence and preserving true dates, employers, education, skills, and metrics.

The app has deterministic local fallbacks for robustness, but the intended public demo runs with a real Gemma 4 API key. Each Gemma-powered workflow logs which model was used so judges can verify the execution path.

## Architecture

The system is a Next.js full-stack app:

1. React UI handles upload, chat, language switching, voice input/playback, preview, and downloads.
2. Next.js API routes manage sessions, uploads, chat turns, analysis, generation, and downloads.
3. Prisma stores anonymous sessions, structured profiles, job descriptions, messages, events, and generated document metadata.
4. Gemma 4 provides language understanding, reasoning, and tailoring.
5. A deterministic DOCX renderer creates the Word document using the LBS-style template.

The raw uploaded CV is parsed in memory and not retained as a file. The app stores the structured profile instead, which is safer and easier to audit.

## Product Flow

The user chooses either "I already have a CV" or "Build from scratch." In the upload flow, the app extracts education, experience, projects, skills, languages, and awards. If enough information exists, it does not ask repeated questions. It moves directly to the target job description.

Once the job description is pasted, Gemma 4 extracts the role requirements. The user can then analyze the CV or generate a tailored version. The analysis highlights matched and missing role signals, weak evidence, CAR-model improvements, and LBS-style formatting issues. The generated CV is available as `.docx`.

## Technical Choices

Gemma 4 is used where judgment matters: interpreting a job description, evaluating fit, and rewriting CV bullets without hallucinating. Deterministic logic is used where reliability matters: profile completeness, file validation, flow state, reset behavior, and final Word rendering.

This hybrid design makes the app more trustworthy. The model decides how to improve language and prioritize evidence, but the renderer controls formatting, section order, and file output. The guardrails explicitly prohibit invented achievements, metrics, employers, dates, and skills.

## Impact

The app targets candidates who are qualified but undersupported. Romanian users can work naturally in Romanian, switch to English when applying internationally, speak answers instead of typing them, and receive a professional CV without needing to understand CV frameworks such as CAR or LBS formatting rules.

This is digital equity in a concrete workflow: less friction, less hidden knowledge, and a practical output that can immediately help someone apply for work.

## Links

- Live demo: TODO
- Public code repository: TODO
- Video demo: TODO
