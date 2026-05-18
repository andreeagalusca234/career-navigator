import type { CvAnalysis } from "@/lib/cv/schemas";
import { t, type Locale } from "@/lib/i18n";

type AnalysisScoreCardProps = {
  analysis: CvAnalysis;
  locale: Locale;
};

export function AnalysisScoreCard({ analysis, locale }: AnalysisScoreCardProps) {
  const text = t(locale).analysis;

  return (
    <section className="panel-block analysis-card">
      <div className="score-line">
        <span>{analysis.score}</span>
        <p>{analysis.verdict}</p>
      </div>

      <h3>{text.topFixes}</h3>
      <ul className="clean-list">
        {analysis.topFixes.map((fix) => (
          <li key={fix.title}>
            <strong>{fix.title}</strong>
            <p>{fix.detail}</p>
          </li>
        ))}
      </ul>

      {analysis.bulletRewrites.length ? (
        <>
          <h3>{text.rewrites}</h3>
          <ul className="clean-list rewrite-list">
            {analysis.bulletRewrites.slice(0, 3).map((rewrite) => (
              <li key={rewrite.original}>
                <strong>{rewrite.rewrite}</strong>
                <p>{rewrite.reason}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {analysis.missingEvidence.length ? (
        <>
          <h3>{text.checks}</h3>
          <ul className="compact-list">
            {analysis.missingEvidence.slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
