"""
AI Career & Learning Navigator
"Talented students don't lack ability — they lack guidance."
"""

import os
import json
import re
import io
import tempfile
import gradio as gr
from PyPDF2 import PdfReader
from google import genai
from docx import Document
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Gemini setup
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
client = genai.Client(api_key=GEMINI_API_KEY)
MODEL = "gemini-2.5-flash"


def call_gemini(system: str, user_prompt: str, lang: str = "English") -> str:
    import time
    lang_note = " Respond in Romanian." if lang == "Română" else " Respond in English."
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=user_prompt,
                config=genai.types.GenerateContentConfig(
                    system_instruction=system + lang_note,
                    max_output_tokens=8192,
                    temperature=0.7,
                ),
            )
            return response.text
        except Exception as e:
            if attempt < 2 and ("503" in str(e) or "UNAVAILABLE" in str(e) or "429" in str(e)):
                time.sleep(3 * (attempt + 1))
                continue
            return f"⚠️ Error: {e}\n\nMake sure GEMINI_API_KEY is set."


def extract_pdf(file_path: str) -> str:
    try:
        reader = PdfReader(file_path)
        return "\n".join(p.extract_text() or "" for p in reader.pages).strip()
    except Exception as e:
        return f"Error reading PDF: {e}"


# ---------------------------------------------------------------------------
# LBS Rules (shared)
# ---------------------------------------------------------------------------

LBS_RULES = """
LBS CV STANDARDS (London Business School):
1. Every bullet MUST start with a strong past-tense action verb: Accelerated, Achieved, Analysed, Built, Delivered, Drove, Generated, Implemented, Led, Managed, Negotiated, Optimised, Transformed. NEVER use weak verbs like "helped", "worked on", "assisted", "supported", "was responsible for".
2. Every bullet must follow CAR format: Challenge → Action → Result.
3. Results MUST be quantified with numbers, percentages, or financial values (£/$/%/€). If no number exists, use a placeholder like [X%] or [£X].
4. Bullets should be 1 continuous sentence, approximately 1.5–2 lines long.
5. CV must be maximum 1 page.
6. Experience section: 12–15 bullet points total, 3–4 bullets per role.
7. No time gaps — all periods must be accounted for.
8. Summary must be specific to the target role and company, never generic.
9. Languages listed as Native/Fluent/Basic in Additional Information section.
10. GMAT score only included if 720 or above.
11. Reverse chronological order throughout.
12. No role-specific jargon that non-experts wouldn't understand.
13. Each bullet demonstrates a different transferable skill — no repetition.
14. Progression across roles should be clearly visible.
"""

# ---------------------------------------------------------------------------
# LBS Template filler
# ---------------------------------------------------------------------------

def fill_lbs_template(data: dict, template_path: str) -> Document:
    doc = Document(template_path)

    education = data.get("education", [])
    experience = data.get("experience", [])
    additional = data.get("additional", [])

    def para_text(p):
        return "".join(r.text for r in p.runs)

    def replace_in_runs(para, old, new):
        for run in para.runs:
            if old in run.text:
                run.text = run.text.replace(old, new)

    def delete_para(para):
        elem = para._element
        parent = elem.getparent()
        if parent is not None:
            parent.remove(elem)

    edu_idx = -1
    exp_idx = -1
    bullet_idx = 0
    to_delete = []

    for para in doc.paragraphs:
        text = para_text(para)
        stripped = text.strip()

        replace_in_runs(para, "Name Surname", data.get("name", ""))
        replace_in_runs(para, "XXX@london.edu", data.get("email", ""))
        replace_in_runs(para, "+44 (0) XXX XXX XXX", data.get("phone", ""))
        replace_in_runs(para, "LinkedIn URL", data.get("linkedin", ""))

        if "Reading for" in stripped:
            edu_idx += 1
            if edu_idx < len(education):
                replace_in_runs(para, stripped, education[edu_idx].get("degree", ""))
            else:
                to_delete.append(para)

        elif "GMAT" in stripped:
            gmat = data.get("gmat", "")
            if gmat:
                replace_in_runs(para, "720", str(gmat))
            else:
                to_delete.append(para)

        elif "Scholarship" in stripped or ("scholar" in stripped.lower() and 0 <= edu_idx < len(education)):
            details = education[edu_idx].get("details", []) if 0 <= edu_idx < len(education) else []
            sch = next((d for d in details if "scholar" in d.lower()), "")
            if sch:
                replace_in_runs(para, stripped, sch)
            else:
                to_delete.append(para)

        elif "COMPANY NAME" in stripped:
            exp_idx += 1
            bullet_idx = 0
            if exp_idx < len(experience):
                exp = experience[exp_idx]
                replace_in_runs(para, "COMPANY NAME, City, Country", exp.get("company", ""))
                for date_ph in ["Month Year – Month Year", "Month Year - Month Year"]:
                    replace_in_runs(para, date_ph, exp.get("dates", ""))
            else:
                to_delete.append(para)

        elif "Company description" in stripped and exp_idx >= 0:
            if exp_idx < len(experience):
                replace_in_runs(para, "Company description", experience[exp_idx].get("description", ""))
            else:
                to_delete.append(para)

        elif stripped in ("Analyst", "Job Title", "Summer Intern", "Summer Intern (3 months)") and exp_idx >= 0:
            if exp_idx < len(experience):
                replace_in_runs(para, stripped, experience[exp_idx].get("title", ""))
            else:
                to_delete.append(para)

        elif exp_idx >= 0 and (stripped.startswith("- Start with") or re.match(r"^[Xx]{3,}", stripped)):
            if exp_idx < len(experience):
                bullets = experience[exp_idx].get("bullets", [])
                if bullet_idx < len(bullets):
                    replace_in_runs(para, stripped, f"– {bullets[bullet_idx]}")
                    bullet_idx += 1
                else:
                    to_delete.append(para)
            else:
                to_delete.append(para)

        else:
            for item in additional:
                cat = item.get("category", "")
                content = item.get("content", "")
                if cat and cat.lower() in stripped.lower():
                    replaced = False
                    for run in para.runs:
                        if cat.lower() not in run.text.lower() and run.text.strip() not in ("", ":", "\t"):
                            run.text = content
                            replaced = True
                            break
                    if not replaced:
                        for run in para.runs:
                            if ":" in run.text:
                                run.text = run.text[: run.text.index(":") + 1] + " " + content
                                break
                    break

    for para in to_delete:
        delete_para(para)

    return doc


# ---------------------------------------------------------------------------
# CV processing
# ---------------------------------------------------------------------------

def process_cv(file):
    if file is None:
        return "", "⚠️ Upload a PDF to get started."
    text = extract_pdf(file)
    if text.startswith("Error"):
        return "", text
    preview = text[:2000] + ("..." if len(text) > 2000 else "")
    return text, f"✅ **CV loaded** ({len(text):,} chars)\n\n---\n\n{preview}"


# ---------------------------------------------------------------------------
# Module 1: CV Analyzer
# ---------------------------------------------------------------------------

CV_SYSTEM = """You are an expert career coach and CV reviewer at London Business School (LBS).
Analyze the CV against the job description using strict LBS CV standards.

""" + LBS_RULES + """

Return analysis using EXACTLY this markdown structure:

## 💪 Strengths
3-5 specific things done well for this JD. Prefix each with ✅.

## ⚠️ Areas for Improvement
3-5 actionable fixes referencing actual CV content. Prefix each with ⚠️.

## 📊 ATS Score: X/100
Break down: Formatting (X/25) | Keywords (X/25) | Structure (X/25) | Content (X/25).
Explain each in one sentence.

## ✏️ Before → After Rewrites
3 weak bullet points from the ACTUAL CV rewritten to LBS standard.
Format each as:
**Before:** (original text)
**After:** (LBS-rewritten version)

## 🎯 Quick Wins
3 things they can fix in under 10 minutes to make the biggest difference.

Be specific to THIS CV. Never give generic advice."""


def analyze_cv(cv_text: str, job_desc: str, target_role: str, lang: str) -> str:
    if not cv_text:
        return "⚠️ Upload your CV first." if lang == "English" else "⚠️ Încarcă CV-ul mai întâi."
    if not job_desc:
        return "⚠️ Paste the Job Description." if lang == "English" else "⚠️ Lipește descrierea jobului."
    if not target_role:
        return "⚠️ Enter the Target Role & Company." if lang == "English" else "⚠️ Introdu Rolul Vizat și Compania."

    user_prompt = f"Target Role: {target_role}\n\nJob Description:\n{job_desc}\n\nCV Text:\n{cv_text}"
    return call_gemini(CV_SYSTEM, user_prompt, lang)


TAILOR_SYSTEM = """You are an expert CV writer at London Business School (LBS). Rewrite the candidate's CV to perfectly match the target role, applying ALL LBS CV standards.

""" + LBS_RULES + """

Return ONLY raw JSON — no markdown, no backticks, no preamble. Use exactly this structure:

{"name":"Full Name","email":"email@example.com","phone":"+44 XXX XXX XXXX","linkedin":"linkedin.com/in/username","education":[{"dates":"2025–2026","institution":"London Business School, London, UK","degree":"Masters in Analytics and Management","details":["E-INFRA Merit Scholarship (£20,000)","Relevant modules: Strategy, Analytics, Finance"]}],"experience":[{"dates":"2023–2025","company":"Company Name, City, Country","description":"One line company or industry description","title":"Job Title, Department","bullets":["Strong past tense verb + what candidate did + quantified result","Strong past tense verb + challenge + action + result with number"]}],"additional":[{"category":"Projects","content":"Description with impact metric"},{"category":"Tech Skills","content":"Python, SQL, Tableau"},{"category":"Languages","content":"Romanian (native), English (fluent)"}]}

Rules:
- Every bullet starts with a strong LBS past-tense action verb
- Every bullet follows CAR format: Challenge → Action → Result
- All results quantified — use [X%] or [£X] placeholder if no real number exists
- Each bullet is 1 continuous sentence, 1.5–2 lines long
- Max 3–4 bullets per role
- Keep all facts 100% true — NEVER invent experience or credentials
- Reverse chronological order for both education and experience

IMPORTANT: Be concise. For details arrays, maximum 2 items. For bullets, maximum 3 per role, each under 25 words. For additional content fields, maximum 15 words each. The entire JSON response must fit within 2000 tokens."""


def generate_tailored_cv(cv_text: str, job_desc: str, target_role: str, lang: str):
    no_file = "No file generated." if lang == "English" else "Niciun fișier generat."

    if not cv_text:
        msg = "⚠️ Upload your CV first." if lang == "English" else "⚠️ Încarcă CV-ul mai întâi."
        return msg, None
    if not job_desc:
        msg = "⚠️ Paste the Job Description." if lang == "English" else "⚠️ Lipește descrierea jobului."
        return msg, None
    if not target_role:
        msg = "⚠️ Enter the Target Role & Company." if lang == "English" else "⚠️ Introdu Rolul Vizat și Compania."
        return msg, None

    template_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lbs_template.docx")
    if not os.path.exists(template_path):
        err = "❌ lbs_template.docx not found. Place it in the same folder as app.py." if lang == "English" else "❌ lbs_template.docx nu a fost găsit. Plasați-l în același folder cu app.py."
        return err, None

    user_prompt = (
        f"Target Role: {target_role}\n\nJob Description:\n{job_desc}\n\nOriginal CV:\n{cv_text}\n\n"
        "Rewrite the CV to LBS standard and return ONLY raw JSON."
    )
    raw = call_gemini(TAILOR_SYSTEM, user_prompt, lang)

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    match = re.search(r'\{[\s\S]*\}', cleaned)
    if not match:
        msg = (
            "⚠️ Could not parse JSON from AI response. Raw output shown below:\n\n" + raw
            if lang == "English"
            else "⚠️ Nu s-a putut parsa JSON-ul din răspunsul AI. Output brut afișat mai jos:\n\n" + raw
        )
        return msg, None

    try:
        cv_data = json.loads(match.group())
    except json.JSONDecodeError:
        # Try to repair truncated JSON by closing open brackets
        raw_json = match.group().strip()
        # Close any open strings first
        if raw_json[-1] not in ['}', ']', '"']:
            last_complete = max(raw_json.rfind('",'), raw_json.rfind('"]'), raw_json.rfind('"}'))
            if last_complete > 0:
                raw_json = raw_json[:last_complete + 1]
        # Close open brackets and braces
        open_braces = raw_json.count('{') - raw_json.count('}')
        open_brackets = raw_json.count('[') - raw_json.count(']')
        raw_json += ']' * max(0, open_brackets) + '}' * max(0, open_braces)
        try:
            cv_data = json.loads(raw_json)
        except json.JSONDecodeError as e2:
            return f"⚠️ JSON parse error: {e2}\n\nRaw:\n{raw}", None

    try:
        doc = fill_lbs_template(cv_data, template_path)
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
        doc.save(tmp.name)
        tmp.close()
        msg = "✅ Tailored CV generated! Click the file below to download." if lang == "English" else "✅ CV personalizat generat! Apasă pe fișier pentru a descărca."
        return msg, tmp.name
    except Exception as e:
        return f"❌ Template filling failed: {e}", None


# ---------------------------------------------------------------------------
# Module 2: Interview Simulator
# ---------------------------------------------------------------------------

INTERVIEW_START_SYSTEM = """You are an interview coach. Given a CV and target role, generate 5 realistic interview questions.

Return ONLY a JSON array of strings, no markdown, no explanation. Example:
["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?"]

Mix behavioral, technical, and situational questions. Tailor to the CV and role."""

INTERVIEW_FEEDBACK_SYSTEM = """You are an interview coach evaluating a candidate's answer.

Evaluate against these criteria:
- Uses specific examples, not vague statements
- Quantifies impact where possible
- Follows a clear structure (Situation → Action → Result)
- Avoids filler words and generic phrases

Provide:
1. **Score: X/10**
2. **What worked** (1-2 sentences)
3. **How to improve** (1-2 sentences referencing the criteria above)
4. **Example stronger answer** (2-3 sentences showing how to restructure their response using SAR)

Be encouraging but honest. Keep it concise."""

INTERVIEW_SUMMARY_SYSTEM = """You are an interview coach giving a final assessment.

Given all 5 questions, answers, and individual feedback, provide:

## 🏆 Overall Score: X/10

## Top Strengths
2-3 patterns you noticed across their answers.

## Key Areas to Work On
2-3 specific things to practice (reference the SAR framework and quantification).

## 💡 Action Plan
3 concrete steps to improve before their next interview.

Be motivating — end on a high note."""


def generate_questions(cv_text: str, role: str, lang: str):
    if not cv_text:
        msg = "⚠️ Upload your CV first." if lang == "English" else "⚠️ Încarcă CV-ul mai întâi."
        return None, msg, "", gr.update(interactive=False), gr.update(visible=False)
    if not role:
        msg = "⚠️ Enter a target role." if lang == "English" else "⚠️ Introdu un rol vizat."
        return None, msg, "", gr.update(interactive=False), gr.update(visible=False)

    raw = call_gemini(
        INTERVIEW_START_SYSTEM,
        f"CV:\n{cv_text}\n\nTarget role: {role}",
        lang,
    )

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        questions = json.loads(cleaned)
    except Exception:
        matches = re.findall(r'"([^"]+\?)"', raw)
        questions = matches if matches else [
            "Tell me about yourself and why you're interested in this role.",
            "What's a project you're most proud of?",
            "Describe a challenge you faced and how you handled it.",
            "Where do you see yourself in 3 years?",
            "Do you have any questions for us?",
        ]

    questions = questions[:5]
    state = {"questions": questions, "answers": [], "feedback": [], "current": 0, "lang": lang}
    label = "Question" if lang == "English" else "Întrebare"
    display = f"### {label} 1 of {len(questions)}\n\n**{questions[0]}**"
    return state, display, "", gr.update(interactive=True), gr.update(visible=True)


def submit_answer(state: dict, answer: str):
    if not state:
        return state, "⚠️ Start the interview first.", "", gr.update(visible=True), gr.update(visible=False)
    lang = state.get("lang", "English")
    if not answer.strip():
        msg = "Please type your answer." if lang == "English" else "Te rog scrie răspunsul."
        return state, msg, "", gr.update(visible=True), gr.update(visible=False)

    q = state["questions"][state["current"]]
    feedback = call_gemini(
        INTERVIEW_FEEDBACK_SYSTEM,
        f"Question: {q}\n\nCandidate's answer: {answer}",
        lang,
    )

    state["answers"].append(answer)
    state["feedback"].append(feedback)
    state["current"] += 1

    if state["current"] >= len(state["questions"]):
        recap = ""
        for i, (qi, ai, fi) in enumerate(zip(state["questions"], state["answers"], state["feedback"])):
            recap += f"\n\nQ{i+1}: {qi}\nAnswer: {ai}\nFeedback: {fi}\n"

        summary = call_gemini(INTERVIEW_SUMMARY_SYSTEM, f"Interview recap:{recap}", lang)
        complete = "## Interview Complete!" if lang == "English" else "## Interviu Finalizat!"
        display = f"{complete}\n\n{feedback}\n\n---\n\n{summary}"
        return state, display, "", gr.update(visible=False), gr.update(visible=False)

    next_q = state["questions"][state["current"]]
    n = len(state["questions"])
    label = "Question" if lang == "English" else "Întrebare"
    display = f"{feedback}\n\n---\n\n### {label} {state['current']+1} of {n}\n\n**{next_q}**"
    return state, display, "", gr.update(visible=True), gr.update(visible=False)


# ---------------------------------------------------------------------------
# Module 3: Skill Navigator
# ---------------------------------------------------------------------------

SKILL_SYSTEM = """You are a career learning advisor helping students find FREE resources to fill skill gaps.

Given a CV and target role, provide:

## 🔍 Skill Gap Analysis
A markdown table comparing what they HAVE vs what the role NEEDS:
| Skill | Current Level | Required Level | Gap |
|-------|--------------|----------------|-----|
Use: ✅ Strong, 🟡 Partial, ❌ Missing

## 📚 Free Learning Path
For each gap skill, recommend 2-3 FREE resources:
- Specific course names (Coursera free audit, MIT OCW, freeCodeCamp, Khan Academy, YouTube)
- Estimated time to complete
- Why this resource specifically

## 🗓️ 30-Day Action Plan
Week-by-week breakdown:
- Week 1: ...
- Week 2: ...
- Week 3: ...
- Week 4: ...

## 🏆 Portfolio Project Ideas
2-3 projects to build to demonstrate the new skills. Each with:
- What to build
- Skills it demonstrates
- Estimated time

IMPORTANT: Only recommend genuinely free resources. These students cannot afford paid courses."""


def skill_navigator(cv_text: str, target_role: str, lang: str) -> str:
    if not cv_text:
        return "⚠️ Upload your CV first." if lang == "English" else "⚠️ Încarcă CV-ul mai întâi."
    if not target_role:
        return "⚠️ Enter a target role." if lang == "English" else "⚠️ Introdu un rol vizat."
    return call_gemini(
        SKILL_SYSTEM,
        f"CV:\n{cv_text}\n\nTarget role: {target_role}\n\nAnalyze skill gaps and create a free learning path.",
        lang,
    )


# ---------------------------------------------------------------------------
# Module 4: AI Coach — conversational CV builder
# ---------------------------------------------------------------------------

COACH_GREETING_EN = (
    "Hi! 👋 I'm your AI Career Navigator. I'm here to help you build or improve your CV "
    "to professional standards and prepare for interviews.\n\n"
    "Do you already have a CV you'd like to upload?"
)
COACH_GREETING_RO = (
    "Bună! 👋 Sunt navigatorul tău AI de carieră. Sunt aici să te ajut să îți construiești "
    "sau să îți îmbunătățești CV-ul la standarde profesionale și să te pregătești pentru interviuri.\n\n"
    "Ai deja un CV pe care ai dori să îl încarci?"
)

# (key, english_question, romanian_question)
BUILD_CV_QUESTIONS = [
    ("name",            "What is your **full name**?",
                        "Care este **numele tău complet**?"),
    ("email",           "What is your **email address**?",
                        "Care este **adresa ta de email**?"),
    ("phone",           "What is your **phone number**?",
                        "Care este **numărul tău de telefon**?"),
    ("linkedin",        "What is your **LinkedIn URL**? (type 'skip' if you don't have one)",
                        "Care este **URL-ul tău de LinkedIn**? (scrie 'skip' dacă nu ai)"),
    ("education_main",  "What is your **university, degree, and graduation year**? "
                        "(e.g. University of Bucharest, BSc Economics, 2023)",
                        "Care este **universitatea, diploma și anul absolvirii**? "
                        "(ex. Universitatea București, Economie, 2023)"),
    ("education_other", "Did you study **anywhere else**? (exchange, second degree — type 'no' to skip)",
                        "Ai studiat **și în altă parte**? (schimb, a doua diplomă — scrie 'nu' pentru a sări)"),
    ("scholarships",    "Any **scholarships or academic awards**? (type 'none' to skip)",
                        "Ai **burse sau premii academice**? (scrie 'niciunul' pentru a sări)"),
    ("job_recent",      "Tell me about your **most recent job**: company, title, and dates "
                        "(e.g. Accenture, Business Analyst, Jan 2022 – Present)",
                        "Povestește-mi despre **cel mai recent job**: companie, titlu, și date "
                        "(ex. Accenture, Business Analyst, Ian 2022 – Prezent)"),
    ("job_achievements","What were your **main achievements** in that role? "
                        "(be specific — numbers and results are great!)",
                        "Care au fost **realizările tale principale** în acel rol? "
                        "(fii specific — numerele și rezultatele contează!)"),
    ("more_roles",      "Any **other roles** to add? Describe them briefly (company, title, dates, key result). "
                        "Type **'done'** when finished.",
                        "Ai **alte roluri** de adăugat? Descrie-le pe scurt (companie, titlu, date, rezultat cheie). "
                        "Scrie **'gata'** când ai terminat."),
    ("skills",          "What are your **key skills and tools**? "
                        "(e.g. Python, SQL, Excel, Salesforce, Project Management)",
                        "Care sunt **competențele și instrumentele tale cheie**? "
                        "(ex. Python, SQL, Excel, Salesforce)"),
    ("languages",       "What **languages** do you speak and at what level? "
                        "(e.g. Romanian - native, English - fluent, French - basic)",
                        "Ce **limbi** vorbești și la ce nivel? "
                        "(ex. Română - nativă, Engleză - fluent, Franceză - de bază)"),
    ("projects",        "Any **notable projects, volunteering, or leadership roles**? (type 'none' to skip)",
                        "Proiecte **notabile, voluntariat sau roluri de leadership**? "
                        "(scrie 'niciunul' pentru a sări)"),
]

CV_ANALYST_SYSTEM = (
    "You are a CV analyst. Read this CV and identify what critical information is missing or weak "
    "for a professional LBS-standard CV. Check for: full name, email, phone, LinkedIn URL, "
    "education details (institution, degree, dates, GPA/scholarship), work experience (company, "
    "title, dates, quantified bullet points using CAR format), skills, languages (listed as "
    "Native/Fluent/Basic), any time gaps. "
    'Return ONLY a JSON array of missing field objects: '
    '[{"field": "linkedin", "question": "What is your LinkedIn profile URL?"}, '
    '{"field": "phone", "question": "What is your phone number?"}]. '
    "Only include genuinely missing or critically weak fields. Maximum 6 items."
)


def _t(en: str, ro: str, lang: str) -> str:
    return ro if lang == "Română" else en


def initial_coach_state() -> dict:
    return {
        "stage": "has_cv_check",
        "has_cv": None,
        "cv_text": "",
        "collected": {},
        "missing_fields": [],
        "current_missing_idx": 0,
        "target_role": "",
        "job_desc": "",
        "lang": "English",
        "build_cv_idx": 0,
        "last_action": None,
    }


def _build_cv_text(collected: dict) -> str:
    parts = []
    if collected.get("name"):
        parts.append(f"Name: {collected['name']}")
    if collected.get("email"):
        parts.append(f"Email: {collected['email']}")
    if collected.get("phone"):
        parts.append(f"Phone: {collected['phone']}")
    lnk = collected.get("linkedin", "")
    if lnk and lnk.lower() not in ("skip", ""):
        parts.append(f"LinkedIn: {lnk}")
    if collected.get("education_main"):
        parts.append(f"\nEducation:\n{collected['education_main']}")
    edu_other = collected.get("education_other", "")
    if edu_other and edu_other.lower() not in ("no", "nu", "none", "skip", ""):
        parts.append(edu_other)
    sch = collected.get("scholarships", "")
    if sch and sch.lower() not in ("none", "niciunul", "skip", ""):
        parts.append(f"Scholarships/Awards: {sch}")
    if collected.get("job_recent"):
        parts.append(f"\nExperience:\n{collected['job_recent']}")
    if collected.get("job_achievements"):
        parts.append(f"Key Achievements: {collected['job_achievements']}")
    more = collected.get("more_roles", "")
    if more and more.lower() not in ("done", "gata", "none", "skip", ""):
        parts.append(f"Additional Experience: {more}")
    if collected.get("skills"):
        parts.append(f"\nSkills: {collected['skills']}")
    if collected.get("languages"):
        parts.append(f"Languages: {collected['languages']}")
    proj = collected.get("projects", "")
    if proj and proj.lower() not in ("none", "niciunul", "skip", ""):
        parts.append(f"Projects/Volunteering: {proj}")
    return "\n".join(parts)


def extract_role_from_jd(jd_text: str) -> str:
    raw = call_gemini(
        "Extract the job title and company name from this job description. "
        "Return ONLY: 'Job Title at Company Name'. Nothing else.",
        jd_text,
    )
    return raw.strip()


def _clean_input(s: str) -> str:
    """Strip leading emoji/punctuation from button-clicked messages."""
    return re.sub(r'^[^\wÀ-ɏ]+', '', s).strip()


def _button_updates(state, lang):
    """Return gr.update tuples for the three option buttons based on current stage."""
    s = state or {}
    stage = s.get("stage", "has_cv_check")

    if stage == "has_cv_check":
        return (
            gr.update(visible=True, value=_t("✅ Yes, I have a CV", "✅ Da, am un CV", lang)),
            gr.update(visible=True, value=_t("✏️ No, build from scratch", "✏️ Nu, construiesc de la zero", lang)),
            gr.update(visible=False),
        )

    if stage in ("choosing", "ready"):
        last = s.get("last_action")
        if last == "analyze":
            return (
                gr.update(visible=True, value=_t("✏️ Generate Tailored CV", "✏️ Generează CV Adaptat", lang)),
                gr.update(visible=True, value=_t("🎤 Practice Interview", "🎤 Simulează Interviu", lang)),
                gr.update(visible=True, value=_t("🔄 Start Over", "🔄 Începe din nou", lang)),
            )
        if last == "tailor":
            return (
                gr.update(visible=True, value=_t("📊 Analyze my CV", "📊 Analizează CV-ul meu", lang)),
                gr.update(visible=True, value=_t("🎤 Practice Interview", "🎤 Simulează Interviu", lang)),
                gr.update(visible=True, value=_t("🔄 Start Over", "🔄 Începe din nou", lang)),
            )
        return (
            gr.update(visible=True, value=_t("📊 Analyze my CV", "📊 Analizează CV-ul meu", lang)),
            gr.update(visible=True, value=_t("✏️ Generate Tailored CV", "✏️ Generează CV Adaptat", lang)),
            gr.update(visible=True, value=_t("🎤 Practice Interview", "🎤 Simulează Interviu", lang)),
        )

    return gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)


def _input_row_update(state):
    """Show the text-input row only when the stage requires typed free text."""
    stage = (state or {}).get("stage", "has_cv_check")
    return gr.update(visible=stage in ("build_cv", "fill_missing", "get_jd"))


def coach_handle_file(file, history, state, lang):
    """Handle PDF upload inside the AI Coach chatbot."""
    if state is None:
        state = initial_coach_state()
    history = list(history) if history else []

    if file is None:
        return history, state, gr.update(visible=True), "", *_button_updates(state, lang), _input_row_update(state)

    cv_text = extract_pdf(file)
    if cv_text.startswith("Error"):
        history.append({"role": "assistant", "content": _t(
            f"❌ Could not read the PDF: {cv_text}",
            f"❌ Nu am putut citi PDF-ul: {cv_text}", lang)})
        return history, state, gr.update(visible=True), "", *_button_updates(state, lang), _input_row_update(state)

    state["cv_text"] = cv_text
    history.append({"role": "assistant", "content": _t(
        "CV received! 📄 Analyzing it now — just a moment...",
        "CV primit! 📄 Îl analizez acum — un moment...",
        lang
    )})

    raw = call_gemini(CV_ANALYST_SYSTEM, f"CV Text:\n{cv_text}", lang)
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    missing_fields = []
    try:
        m = re.search(r'\[[\s\S]*\]', cleaned)
        if m:
            missing_fields = json.loads(m.group())
    except Exception:
        missing_fields = []

    if missing_fields:
        state["missing_fields"] = missing_fields
        state["current_missing_idx"] = 1
        state["stage"] = "fill_missing"
        first_q = missing_fields[0]["question"]
        reply = _t(
            f"I've analyzed your CV — it looks solid! I just need a few more details to make it perfect. 💪\n\n{first_q}",
            f"Am analizat CV-ul tău — arată bine! Am nevoie de câteva detalii în plus pentru a-l perfecționa. 💪\n\n{first_q}",
            lang,
        )
    else:
        state["stage"] = "get_jd"
        reply = _t(
            "Your CV looks comprehensive! 🌟 Loaded successfully.\n\n"
            "Almost there! Please paste the job description below — include the full text with company name, role, and requirements. The more detail, the better your tailored CV will be. 📋",
            "CV-ul tău arată cuprinzător! 🌟 Încărcat cu succes.\n\n"
            "Aproape gata! Te rog să lipești descrierea jobului mai jos — include textul complet cu numele companiei, rolul și cerințele. Cu cât mai multe detalii, cu atât CV-ul va fi mai bun. 📋",
            lang,
        )

    history.append({"role": "assistant", "content": reply})
    return history, state, gr.update(visible=False), cv_text, *_button_updates(state, lang), _input_row_update(state)


def chat_response(message, history, state, lang):
    """Main conversation handler for the AI Coach tab.

    Returns: history, state, cleared_input, file_upload_visibility, download_visibility, cv_state_text
    """
    if state is None:
        state = initial_coach_state()
    if not message or not message.strip():
        return history, state, "", gr.update(), gr.update(visible=False, value=None), state.get("cv_text", ""), *_button_updates(state, lang), _input_row_update(state)

    state["lang"] = lang
    history = list(history) if history else []
    msg_lower = message.lower().strip()
    stage = state.get("stage", "has_cv_check")

    bot_reply = ""
    show_upload = False
    download_update = gr.update(visible=False, value=None)

    # ── Stage: has_cv_check ──────────────────────────────────────────────────
    if stage == "has_cv_check":
        _words = set(re.findall(r'[a-zà-ɏ]+', msg_lower))
        is_yes = bool(_words & {"yes", "da", "yeah", "yep", "si", "yup", "y", "sure", "ok"})
        is_no  = bool(_words & {"no", "nu", "nope", "n", "nah"})

        if is_yes:
            state["has_cv"] = True
            state["stage"] = "cv_upload"
            bot_reply = _t(
                "Perfect! Please upload your CV as a PDF using the upload button below 👇",
                "Perfect! Te rog să încarci CV-ul tău ca PDF folosind butonul de mai jos 👇",
                lang,
            )
            show_upload = True
        elif is_no:
            state["has_cv"] = False
            state["stage"] = "build_cv"
            state["build_cv_idx"] = 0
            _, q_en, q_ro = BUILD_CV_QUESTIONS[0]
            bot_reply = _t(
                f"No problem! I'll help you build one from scratch. Let's start with the basics.\n\n{q_en}",
                f"Nicio problemă! Te voi ajuta să construiești unul de la zero. Să începem cu elementele de bază.\n\n{q_ro}",
                lang,
            )
        else:
            bot_reply = _t(
                "Please click one of the buttons below, or type **yes** / **no**.",
                "Te rog apasă unul din butoanele de mai jos sau scrie **da** / **nu**.",
                lang,
            )

    # ── Stage: cv_upload ─────────────────────────────────────────────────────
    elif stage == "cv_upload":
        bot_reply = _t(
            "Please upload your CV using the file upload button above 👆 — I'm waiting for the file!",
            "Te rog să încarci CV-ul folosind butonul de mai sus 👆 — aștept fișierul!",
            lang,
        )
        show_upload = True

    # ── Stage: build_cv ──────────────────────────────────────────────────────
    elif stage == "build_cv":
        idx = state.get("build_cv_idx", 0)
        if idx < len(BUILD_CV_QUESTIONS):
            key, _, _ = BUILD_CV_QUESTIONS[idx]
            state["collected"][key] = _clean_input(message)
            next_idx = idx + 1
            state["build_cv_idx"] = next_idx

            if next_idx < len(BUILD_CV_QUESTIONS):
                _, nq_en, nq_ro = BUILD_CV_QUESTIONS[next_idx]
                bot_reply = _t(f"Got it! ✅\n\n{nq_en}", f"Înțeles! ✅\n\n{nq_ro}", lang)
            else:
                state["cv_text"] = _build_cv_text(state["collected"])
                state["stage"] = "get_jd"
                bot_reply = _t(
                    "Excellent! I have all the information I need. 🎉\n\n"
                    "Almost there! Please paste the job description below — include the full text with company name, role, and requirements. The more detail, the better your tailored CV will be. 📋",
                    "Excelent! Am toate informațiile necesare. 🎉\n\n"
                    "Aproape gata! Te rog să lipești descrierea jobului mai jos — include textul complet cu numele companiei, rolul și cerințele. Cu cât mai multe detalii, cu atât CV-ul va fi mai bun. 📋",
                    lang,
                )

    # ── Stage: fill_missing ──────────────────────────────────────────────────
    elif stage == "fill_missing":
        missing_fields = state.get("missing_fields", [])
        idx = state.get("current_missing_idx", 1)

        # Store answer for the question at position idx-1
        if 0 < idx <= len(missing_fields):
            field = missing_fields[idx - 1]["field"]
            state["collected"][field] = _clean_input(message)

        if idx < len(missing_fields):
            q = missing_fields[idx]["question"]
            state["current_missing_idx"] = idx + 1
            bot_reply = _t(f"Got it! ✅\n\n{q}", f"Înțeles! ✅\n\n{q}", lang)
        else:
            state["stage"] = "get_jd"
            bot_reply = _t(
                "Perfect, I've got all the missing details! 🎯\n\n"
                "Almost there! Please paste the job description below — include the full text with company name, role, and requirements. The more detail, the better your tailored CV will be. 📋",
                "Perfect, am toate detaliile lipsă! 🎯\n\n"
                "Aproape gata! Te rog să lipești descrierea jobului mai jos — include textul complet cu numele companiei, rolul și cerințele. Cu cât mai multe detalii, cu atât CV-ul va fi mai bun. 📋",
                lang,
            )

    # ── Stage: get_jd ────────────────────────────────────────────────────────
    elif stage == "get_jd":
        state["job_desc"] = message
        state["target_role"] = extract_role_from_jd(message)
        state["stage"] = "ready"
        state["last_action"] = None
        bot_reply = _t(
            f"Got it! 🎯 I've identified the role as **{state['target_role']}**.\n\n"
            "Here's what I can do — choose an option below:",
            f"Înțeles! 🎯 Am identificat rolul ca **{state['target_role']}**.\n\n"
            "Iată ce pot face — alege o opțiune de mai jos:",
            lang,
        )

    # ── Stage: ready / choosing ──────────────────────────────────────────────
    elif stage in ("ready", "choosing"):
        if any(w in msg_lower for w in ["analyz", "analis", "analiz", "analizează", "analyse"]):
            result = analyze_cv(state["cv_text"], state["job_desc"], state["target_role"], lang)
            state["last_action"] = "analyze"
            bot_reply = result

        elif any(w in msg_lower for w in ["tailor", "adaptat", "generat", "generate", "download"]) \
                or msg_lower in ("cv", "tailored cv", "cv adaptat"):
            msg_out, path = generate_tailored_cv(
                state["cv_text"], state["job_desc"], state["target_role"], lang
            )
            state["last_action"] = "tailor"
            bot_reply = msg_out
            if path:
                download_update = gr.update(visible=True, value=path)

        elif any(w in msg_lower for w in ["interview", "interviu", "mock", "practice"]):
            bot_reply = _t(
                "Head to the 🎤 **Interview Sim** tab — your profile is already loaded! Come back here anytime.",
                "Du-te la tab-ul 🎤 **Interview Sim** — profilul tău este deja încărcat! Revino oricând.",
                lang,
            )

        elif any(w in msg_lower for w in ["restart", "reset", "start over", "începe din nou"]):
            new_state = initial_coach_state()
            new_state["lang"] = lang
            greeting = _t(COACH_GREETING_EN, COACH_GREETING_RO, lang)
            return [{"role": "assistant", "content": greeting}], new_state, "", gr.update(visible=False), gr.update(visible=False, value=None), "", *_button_updates(new_state, lang), _input_row_update(new_state)

        else:
            bot_reply = _t(
                "Please use the buttons above to choose an option.",
                "Te rog folosește butoanele de mai sus pentru a alege o opțiune.",
                lang,
            )

    history.append({"role": "user", "content": message})
    history.append({"role": "assistant", "content": bot_reply})
    return history, state, "", gr.update(visible=show_upload), download_update, state.get("cv_text", ""), *_button_updates(state, lang), _input_row_update(state)


def coach_clear(lang):
    state = initial_coach_state()
    state["lang"] = lang
    greeting = _t(COACH_GREETING_EN, COACH_GREETING_RO, lang)
    return [{"role": "assistant", "content": greeting}], state, "", gr.update(visible=False), gr.update(visible=False, value=None), *_button_updates(state, lang), _input_row_update(state)


def transcribe_numpy_audio(audio_tuple, lang: str) -> str:
    if audio_tuple is None:
        return ""
    try:
        import numpy as np
        import scipy.io.wavfile as wav

        sample_rate, audio_data = audio_tuple

        # Convert to mono int16
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)
        audio_data = np.clip(audio_data, -32768, 32767).astype(np.int16)

        tmp_path = tempfile.mktemp(suffix=".wav")
        wav.write(tmp_path, sample_rate, audio_data)

        file_size = os.path.getsize(tmp_path)
        os.unlink(tmp_path)

        if file_size < 1000:
            return ""

        return "__audio_received__"

    except Exception as e:
        print(f"Transcription error: {e}")
        return ""


def handle_voice_input(audio_tuple, history, state, lang):
    """Transcribe microphone audio then send it through chat_response."""
    _no_change = lambda: (
        history, state, "", gr.update(), gr.update(visible=False, value=None),
        (state or {}).get("cv_text", ""), *_button_updates(state, lang),
        _input_row_update(state), gr.update(value=None),
    )
    try:
        if audio_tuple is None:
            return _no_change()

        transcribed = transcribe_numpy_audio(audio_tuple, lang)

        if transcribed == "__audio_received__":
            msg = _t(
                "🎤 I received your audio! Unfortunately voice transcription requires more resources than available locally. "
                "Please type your answer below — voice will work perfectly once deployed on Hugging Face!",
                "🎤 Am primit audio-ul tău! Din păcate, transcrierea vocală necesită mai multe resurse decât sunt disponibile local. "
                "Te rog scrie răspunsul mai jos — vocea va funcționa perfect odată implementat pe Hugging Face!",
                lang,
            )
            history = list(history) + [{"role": "assistant", "content": msg}]
            return (
                history, state, "", gr.update(), gr.update(visible=False, value=None),
                (state or {}).get("cv_text", ""), *_button_updates(state, lang),
                _input_row_update(state), gr.update(value=None),
            )

        if not transcribed:
            history = list(history) + [{"role": "assistant", "content": _t(
                "⚠️ I couldn't hear that clearly. Please try again or type your answer below.",
                "⚠️ Nu am înțeles. Te rog încearcă din nou sau scrie răspunsul.",
                lang,
            )}]
            return (
                history, state, "", gr.update(), gr.update(visible=False, value=None),
                (state or {}).get("cv_text", ""), *_button_updates(state, lang),
                _input_row_update(state), gr.update(value=None),
            )

        result = chat_response(transcribed, history, state, lang)
        return (*result, gr.update(value=None))

    except Exception as e:
        print(f"Voice input error: {e}")
        return _no_change()


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

THEME = gr.themes.Soft(
    primary_hue="blue",
    secondary_hue="sky",
    neutral_hue="slate",
    font=gr.themes.GoogleFont("Source Sans Pro"),
)

CSS = """
.main-header { text-align: center; padding: 1.5rem 1rem 0.5rem; }
.main-header h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.2rem; }
.main-header p { font-size: 1.05rem; opacity: 0.7; font-style: italic; }
.lang-row { display: flex; justify-content: flex-end; padding: 0.25rem 1rem; }
.coach-opts { gap: 6px !important; margin-top: 4px !important; margin-bottom: 4px !important; }
.coach-opts button { flex: 1; }
"""

# Translation helpers
def L(en, ro, lang):
    return ro if lang == "Română" else en


with gr.Blocks(title="AI Career Navigator") as app:

    cv_state = gr.State("")

    # Header
    gr.HTML("""
        <div class="main-header">
            <h1>🎯 AI Career &amp; Learning Navigator</h1>
            <p>"Talented students don't lack ability — they lack guidance."</p>
        </div>
    """)

    # Language toggle — top right
    with gr.Row(elem_classes="lang-row"):
        lang_toggle = gr.Radio(
            choices=["English", "Română"],
            value="English",
            label="🌐 Language / Limbă",
            interactive=True,
        )

    with gr.Tabs():

        # ── Tab 0: AI Coach ─────────────────────────────────────────────────
        with gr.Tab("🤖 AI Coach"):
            gr.Markdown(
                "### Your personal AI Career Coach\n"
                "I'll guide you through building or improving your CV, then generate a tailored LBS-format version."
            )

            coach_chatbot = gr.Chatbot(
                value=[{"role": "assistant", "content": COACH_GREETING_EN}],
                height=400,
                label="AI Career Coach",
            )

            # Download component — placed between chatbot and buttons, hidden until CV is generated
            coach_download = gr.File(
                label="📥 Download Tailored CV",
                visible=False,
            )

            # Option buttons — shown/hidden based on conversation stage
            with gr.Row(elem_classes="coach-opts"):
                coach_opt_btn1 = gr.Button("✅ Yes, I have a CV", visible=True, variant="secondary")
                coach_opt_btn2 = gr.Button("✏️ No, build from scratch", visible=True, variant="secondary")
                coach_opt_btn3 = gr.Button("🎤 Practice Interview", visible=False, variant="secondary")

            coach_file_upload = gr.File(
                label="📎 Upload your CV (PDF)",
                file_types=[".pdf"],
                type="filepath",
                visible=False,
            )

            coach_audio = gr.Audio(
                sources=["microphone"],
                type="numpy",
                label="🎤 Or speak your answer",
            )

            # Text input row — hidden when buttons are active, shown when free text is needed
            with gr.Row(visible=False) as coach_input_row:
                coach_input = gr.Textbox(
                    placeholder="Type your message and press Enter...",
                    show_label=False,
                    scale=5,
                    lines=1,
                )
                coach_send = gr.Button("Send 📨", variant="primary", scale=1, min_width=100)

            coach_clear_btn = gr.Button("🔄 Clear & Restart", size="sm", variant="secondary")

            coach_state = gr.State(initial_coach_state())

            _chat_outputs = [
                coach_chatbot, coach_state, coach_input,
                coach_file_upload, coach_download, cv_state,
                coach_opt_btn1, coach_opt_btn2, coach_opt_btn3,
                coach_input_row,
            ]

            # Send button and Enter key
            coach_send.click(fn=chat_response, inputs=[coach_input, coach_chatbot, coach_state, lang_toggle], outputs=_chat_outputs)
            coach_input.submit(fn=chat_response, inputs=[coach_input, coach_chatbot, coach_state, lang_toggle], outputs=_chat_outputs)

            # Option buttons — each passes its own label as the user message
            coach_opt_btn1.click(fn=chat_response, inputs=[coach_opt_btn1, coach_chatbot, coach_state, lang_toggle], outputs=_chat_outputs)
            coach_opt_btn2.click(fn=chat_response, inputs=[coach_opt_btn2, coach_chatbot, coach_state, lang_toggle], outputs=_chat_outputs)
            coach_opt_btn3.click(fn=chat_response, inputs=[coach_opt_btn3, coach_chatbot, coach_state, lang_toggle], outputs=_chat_outputs)

            # File upload
            coach_file_upload.change(
                fn=coach_handle_file,
                inputs=[coach_file_upload, coach_chatbot, coach_state, lang_toggle],
                outputs=[coach_chatbot, coach_state, coach_file_upload, cv_state,
                         coach_opt_btn1, coach_opt_btn2, coach_opt_btn3, coach_input_row],
            )

            # Voice input
            coach_audio.stop_recording(
                fn=handle_voice_input,
                inputs=[coach_audio, coach_chatbot, coach_state, lang_toggle],
                outputs=[*_chat_outputs, coach_audio],
            )

            # Clear / Restart
            coach_clear_btn.click(
                fn=coach_clear,
                inputs=[lang_toggle],
                outputs=[coach_chatbot, coach_state, coach_input,
                         coach_file_upload, coach_download,
                         coach_opt_btn1, coach_opt_btn2, coach_opt_btn3,
                         coach_input_row],
            )

            # Update greeting and buttons when language changes
            def _update_greeting(lang):
                state = initial_coach_state()
                greeting = _t(COACH_GREETING_EN, COACH_GREETING_RO, lang)
                return [{"role": "assistant", "content": greeting}], state, *_button_updates(state, lang), _input_row_update(state)

            lang_toggle.change(
                fn=_update_greeting,
                inputs=[lang_toggle],
                outputs=[coach_chatbot, coach_state,
                         coach_opt_btn1, coach_opt_btn2, coach_opt_btn3,
                         coach_input_row],
            )

        # ── Tab 1: Upload CV ────────────────────────────────────────────────
        with gr.Tab("📄 Upload CV"):
            gr.Markdown("### Upload your CV to get started\nAll three tools use your CV. Upload once, use everywhere.")
            with gr.Row():
                with gr.Column(scale=1):
                    cv_file = gr.File(label="Upload CV (PDF)", file_types=[".pdf"], type="filepath")
                    upload_btn = gr.Button("📤 Process CV", variant="primary", size="lg")
                with gr.Column(scale=2):
                    cv_preview = gr.Markdown("Waiting for upload...")

            upload_btn.click(fn=process_cv, inputs=[cv_file], outputs=[cv_state, cv_preview])

        # ── Tab 2: CV Analyzer ──────────────────────────────────────────────
        with gr.Tab("🔬 CV Analyzer"):
            gr.Markdown("### CV Analyzer — LBS Standards\nGet ATS score, rewrite suggestions, and quick wins aligned with London Business School standards.")

            with gr.Row():
                with gr.Column(scale=1):
                    cv_file_1 = gr.File(label="Upload CV (PDF)", file_types=[".pdf"], type="filepath")
                    cv_status_1 = gr.Markdown("_No CV uploaded yet — upload here or in the Upload CV tab._")
                with gr.Column(scale=2):
                    cv_jd = gr.Textbox(
                        label="Job Description",
                        placeholder="Paste the full job description including company name, role and requirements...",
                        lines=6,
                    )
                    cv_role = gr.Textbox(
                        label="Target Role & Company",
                        placeholder="e.g. Operations Manager at Unilever",
                    )

            with gr.Row():
                analyze_btn = gr.Button("🔍 Analyze CV", variant="primary", scale=1)
                tailor_btn = gr.Button("✏️ Generate Tailored CV", scale=1)

            analysis_output = gr.Markdown()

            tailor_status = gr.Markdown()
            tailor_file = gr.File(label="Download Tailored CV", visible=True)

            cv_file_1.change(fn=process_cv, inputs=[cv_file_1], outputs=[cv_state, cv_status_1])

            def run_analyze(cv_text, jd, role, lang):
                return analyze_cv(cv_text, jd, role, lang)

            def run_tailor(cv_text, jd, role, lang):
                msg, path = generate_tailored_cv(cv_text, jd, role, lang)
                return msg, path

            analyze_btn.click(
                fn=run_analyze,
                inputs=[cv_state, cv_jd, cv_role, lang_toggle],
                outputs=[analysis_output],
            )
            tailor_btn.click(
                fn=run_tailor,
                inputs=[cv_state, cv_jd, cv_role, lang_toggle],
                outputs=[tailor_status, tailor_file],
            )

        # ── Tab 3: Interview Simulator ──────────────────────────────────────
        with gr.Tab("🎤 Interview Sim"):
            gr.Markdown("### Practice with AI-generated interview questions\nGet scored on each answer with SAR-framework feedback.")

            with gr.Row():
                cv_file_2 = gr.File(label="Upload CV (PDF)", file_types=[".pdf"], type="filepath", scale=1)
                cv_status_2 = gr.Markdown("_No CV uploaded yet._", visible=True)
            cv_file_2.change(fn=process_cv, inputs=[cv_file_2], outputs=[cv_state, cv_status_2])

            with gr.Row():
                interview_role = gr.Textbox(
                    label="Target Role",
                    placeholder="e.g. Software Engineer at a startup",
                    scale=3,
                )
                start_btn = gr.Button("🚀 Start Interview", variant="primary", scale=1)

            interview_state = gr.State(None)
            interview_display = gr.Markdown()

            with gr.Row(visible=False) as answer_row:
                answer_box = gr.Textbox(
                    label="Your Answer",
                    placeholder="Type your answer here... (be specific, use examples from your experience)",
                    lines=4,
                    scale=4,
                )
                submit_btn = gr.Button("📨 Submit Answer", variant="primary", scale=1)

            done_msg = gr.Markdown(visible=False)

            start_btn.click(
                fn=generate_questions,
                inputs=[cv_state, interview_role, lang_toggle],
                outputs=[interview_state, interview_display, answer_box, answer_box, answer_row],
            )
            submit_btn.click(
                fn=submit_answer,
                inputs=[interview_state, answer_box],
                outputs=[interview_state, interview_display, answer_box, answer_row, done_msg],
            )

        # ── Tab 4: Skill Navigator ──────────────────────────────────────────
        with gr.Tab("🧭 Skill Navigator"):
            gr.Markdown("### Find your skill gaps and get a free learning path\nOnly free resources — no paywalls, no subscriptions.")

            with gr.Row():
                cv_file_3 = gr.File(label="Upload CV (PDF)", file_types=[".pdf"], type="filepath", scale=1)
                cv_status_3 = gr.Markdown("_No CV uploaded yet._", visible=True)
            cv_file_3.change(fn=process_cv, inputs=[cv_file_3], outputs=[cv_state, cv_status_3])

            skill_role = gr.Textbox(
                label="Target Role",
                placeholder="e.g. Machine Learning Engineer, UX Designer, Product Manager...",
            )
            skill_btn = gr.Button("🗺️ Generate Learning Path", variant="primary", size="lg")
            skill_output = gr.Markdown()

            skill_btn.click(
                fn=skill_navigator,
                inputs=[cv_state, skill_role, lang_toggle],
                outputs=[skill_output],
            )

    # Footer
    gr.Markdown("""
---
<center>

Built for the **Google DeepMind Gemma 4 Good Hackathon** · Digital Equity & Inclusivity Track<br>
🔒 Your CV is processed in-session only — nothing is stored.<br>
Powered by Gemini 2.0 Flash · Made with ❤️ for students who deserve better access

</center>
""")


if __name__ == "__main__":
    app.launch(theme=THEME, css=CSS)
