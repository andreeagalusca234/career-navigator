export const locales = ["ro", "en"] as const;
export type Locale = (typeof locales)[number];

export function normalizeLocale(value?: string | null): Locale {
  return value === "en" ? "en" : "ro";
}

export function voiceLanguage(locale: Locale): "ro-RO" | "en-GB" {
  return locale === "en" ? "en-GB" : "ro-RO";
}

export const copy = {
  ro: {
    common: {
      loading: "Pregatim coach-ul tau de CV...",
      genericError: "A aparut o eroare. Te rog incearca din nou.",
      sessionError: "Nu am putut porni sesiunea.",
      chatError: "A aparut o eroare la chat.",
      uploadError: "Nu am putut procesa PDF-ul.",
      analyzeError: "Nu am putut genera analiza.",
      generateError: "Nu am putut genera CV-ul."
    },
    landing: {
      eyebrow: "Coach CV in romana",
      title: "Hai sa construim un CV care chiar te ajuta sa obtii interviuri.",
      copy: "Vorbim natural, extragem ce exista deja si adaptam CV-ul pentru jobul tinta.",
      aria: "Alege cum incepem",
      upload: "Am deja un CV",
      scratch: "Vreau sa il construim de la zero",
      privacy: "Fara cont. PDF-ul este procesat pentru extragere si nu este pastrat."
    },
    chat: {
      kicker: "Conversatie",
      title: "Coach-ul tau de CV",
      modelBadge: "Gemma 4",
      languageAria: "Limba platformei si a CV-ului",
      stopDictation: "Opreste dictarea",
      dictate: "Dicteaza raspunsul",
      dictateTitle: "Dicteaza raspunsul",
      dictateUnsupported: "Dictarea vocala necesita Chrome",
      stopReading: "Opreste citirea raspunsurilor",
      listen: "Asculta raspunsurile",
      listenTitle: "Asculta raspunsurile",
      reset: "Start de la zero",
      resetTitle: "Sterge conversatia si incepe din nou",
      resetConfirm: "Stergem conversatia, CV-ul incarcat, descrierea jobului si CV-urile generate pentru aceasta sesiune?",
      busy: "Lucrez...",
      ready: "Gata",
      empty: "Alege cum vrei sa incepem.",
      listeningPlaceholder: "Ascult... vorbeste natural.",
      placeholder: "Scrie raspunsul sau lipeste descrierea jobului...",
      send: "Trimite",
      listeningPrefix: "Ascult",
      browserCannotSpeak: "Browserul nu poate reda raspunsurile vocal.",
      missingRomanianVoice:
        "Nu exista voce romana instalata. Redau cu voce EN; pentru pronuntie clara in romana, instaleaza o voce romana in Windows.",
      cannotSpeak: "Nu am putut reda raspunsul vocal.",
      recognitionUnsupported: "Dictarea vocala functioneaza in Chrome pe localhost. Browserul curent nu o suporta.",
      micPermission: "Chrome are nevoie de permisiune pentru microfon.",
      cannotListen: "Nu am putut asculta microfonul. Incearca din nou.",
      micBusy: "Microfonul este deja pornit sau nu poate fi accesat."
    },
    quickActions: {
      analyze: "Analizeaza CV-ul meu",
      generate: "Genereaza CV adaptat"
    },
    upload: {
      kicker: "CV existent",
      title: "Incarca CV-ul tau",
      compactTitle: "Schimba CV-ul",
      intro: "Extragem structura CV-ului si apoi iti cer doar informatia care lipseste.",
      busy: "Analizam...",
      choose: "Alege PDF sau DOCX",
      privacy: "CV-ul este folosit pentru extragere si este sters dupa procesare in MVP-ul local."
    },
    profile: {
      title: "Completare profil",
      ready: "Avem suficient material pentru adaptare.",
      collecting: "Mai strangem dovezi ca CV-ul sa sune concret."
    },
    preview: {
      title: "Preview CV",
      fallbackName: "Nume Prenume",
      contact: "Contact",
      education: "Educatie",
      experience: "Experienta",
      skills: "Competente",
      languages: "Limbi",
      pending: "In lucru"
    },
    analysis: {
      topFixes: "Top imbunatatiri",
      rewrites: "Rescrieri CAR",
      checks: "De verificat LBS"
    },
    download: {
      title: "CV-ul este gata",
      button: "Descarca DOCX"
    },
    cv: {
      adapted: "cv-adaptat",
      fallbackName: "Nume Prenume",
      education: "Educatie",
      businessExperience: "Experienta profesionala",
      projectsLeadership: "Proiecte si liderat",
      additionalInformation: "Informatii suplimentare",
      skills: "Competente",
      languages: "Limbi",
      awards: "Premii",
      clarifyImpact: "Clarifica impactul si rezultatele pentru acest rol inainte de trimitere.",
      native: "Nativ",
      fluent: "Avansat",
      basic: "Baza",
      adaptedHeadline: "CV adaptat",
      earlyCareer: "candidat early-career",
      relevantExperience: "cu experienta practica relevanta",
      relevantProjects: "cu proiecte si educatie relevante",
      summaryPrefix: "Profil",
      summarySuffix: "CV adaptat pe cerintele rolului, fara rezultate inventate."
    }
  },
  en: {
    common: {
      loading: "Preparing your CV coach...",
      genericError: "Something went wrong. Please try again.",
      sessionError: "I could not start the session.",
      chatError: "Something went wrong in the chat.",
      uploadError: "I could not process the PDF.",
      analyzeError: "I could not generate the analysis.",
      generateError: "I could not generate the CV."
    },
    landing: {
      eyebrow: "CV coach in English",
      title: "Let’s build a CV that actually helps you win interviews.",
      copy: "We talk naturally, extract what already exists, and tailor the CV to the target role.",
      aria: "Choose how to start",
      upload: "I already have a CV",
      scratch: "I want to build it from scratch",
      privacy: "No account needed. The PDF is processed for extraction and not kept."
    },
    chat: {
      kicker: "Conversation",
      title: "Your CV coach",
      modelBadge: "Gemma 4",
      languageAria: "Platform and CV language",
      stopDictation: "Stop dictation",
      dictate: "Dictate your answer",
      dictateTitle: "Dictate your answer",
      dictateUnsupported: "Voice dictation requires Chrome",
      stopReading: "Stop reading answers",
      listen: "Listen to answers",
      listenTitle: "Listen to answers",
      reset: "Start over",
      resetTitle: "Clear the conversation and start again",
      resetConfirm: "Clear the conversation, uploaded CV, job description, and generated CVs for this session?",
      busy: "Working...",
      ready: "Ready",
      empty: "Choose how you want to start.",
      listeningPlaceholder: "Listening... speak naturally.",
      placeholder: "Write your answer or paste the job description...",
      send: "Send",
      listeningPrefix: "Listening",
      browserCannotSpeak: "The browser cannot read answers aloud.",
      missingRomanianVoice:
        "Romanian voice is not installed. I am using an English voice; install a Romanian voice in Windows for clear Romanian pronunciation.",
      cannotSpeak: "I could not read the answer aloud.",
      recognitionUnsupported: "Voice dictation works in Chrome on localhost. This browser does not support it.",
      micPermission: "Chrome needs microphone permission.",
      cannotListen: "I could not listen to the microphone. Try again.",
      micBusy: "The microphone is already on or cannot be accessed."
    },
    quickActions: {
      analyze: "Analyze my CV",
      generate: "Generate tailored CV"
    },
    upload: {
      kicker: "Existing CV",
      title: "Upload your CV",
      compactTitle: "Change CV",
      intro: "We extract the CV structure first, then ask only for information that is missing.",
      busy: "Analyzing...",
      choose: "Choose PDF or DOCX",
      privacy: "The CV is used for extraction and deleted after processing in the local MVP."
    },
    profile: {
      title: "Profile completion",
      ready: "We have enough material for tailoring.",
      collecting: "We are still collecting evidence so the CV sounds concrete."
    },
    preview: {
      title: "CV Preview",
      fallbackName: "Name Surname",
      contact: "Contact",
      education: "Education",
      experience: "Experience",
      skills: "Skills",
      languages: "Languages",
      pending: "In progress"
    },
    analysis: {
      topFixes: "Top improvements",
      rewrites: "CAR rewrites",
      checks: "LBS checks"
    },
    download: {
      title: "Your CV is ready",
      button: "Download DOCX"
    },
    cv: {
      adapted: "tailored-cv",
      fallbackName: "Name Surname",
      education: "Education",
      businessExperience: "Business Experience",
      projectsLeadership: "Projects and Leadership",
      additionalInformation: "Additional Information",
      skills: "Skills",
      languages: "Languages",
      awards: "Awards",
      clarifyImpact: "Clarify impact and results for this role before sending.",
      native: "Native",
      fluent: "Fluent",
      basic: "Basic",
      adaptedHeadline: "Tailored CV",
      earlyCareer: "early-career candidate",
      relevantExperience: "with relevant practical experience",
      relevantProjects: "with relevant projects and education",
      summaryPrefix: "Profile",
      summarySuffix: "CV tailored to the role requirements without invented results."
    }
  }
} as const;

export function t(locale: Locale) {
  return copy[locale];
}
