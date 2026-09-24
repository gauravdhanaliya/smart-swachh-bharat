import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import EcoIllustration from "../components/EcoIllustration";
import { CARD_BUTTON_FILLED, PILL_ACTIVE, PILL_INACTIVE } from "../components/buttonStyles";
import { ECO_TIPS, ECO_TOPICS } from "../data/ecoGuide";

// Static class strings so Tailwind can see them.
const GROUP_STYLE = {
  green: { card: "border-emerald-200 bg-emerald-50", dot: "bg-emerald-600", title: "text-emerald-900" },
  blue: { card: "border-sky-200 bg-sky-50", dot: "bg-sky-600", title: "text-sky-900" },
  slate: { card: "border-slate-300 bg-slate-100", dot: "bg-slate-700", title: "text-slate-900" },
};

function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

export default function CitizenEcoGuide() {
  const navigate = useNavigate();
  const [topicId, setTopicId] = useState(ECO_TOPICS[0].id);
  const topic = ECO_TOPICS.find((t) => t.id === topicId) ?? ECO_TOPICS[0];
  const tip = useMemo(() => ECO_TIPS[dayOfYear() % ECO_TIPS.length], []);

  return (
    <CitizenShell>
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button
          type="button"
          onClick={() => navigate("/citizen")}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-bold text-emerald-950">Eco Guide</h1>
          <p className="text-xs text-emerald-800/60">Small actions, big difference</p>
        </div>
      </div>

      <div className="px-5 pb-4">
        {/* Tip of the day */}
        <div className="mt-2 flex items-start gap-3 rounded-2xl bg-emerald-700 p-4 text-white shadow-sm">
          <span className="text-2xl" aria-hidden="true">🌿</span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Eco tip of the day</p>
            <p className="mt-0.5 text-sm font-semibold leading-snug">{tip}</p>
          </div>
        </div>

        {/* Topic chips */}
        <div
          className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1"
          role="tablist"
          aria-label="Eco guide topics"
        >
          {ECO_TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === topic.id}
              onClick={() => setTopicId(t.id)}
              className={`shrink-0 whitespace-nowrap ${t.id === topic.id ? PILL_ACTIVE : PILL_INACTIVE}`}
            >
              <span aria-hidden="true">{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Topic panel */}
        <article className="mt-3" role="tabpanel" aria-labelledby={`topic-${topic.id}`}>
          <EcoIllustration kind={topic.art} className="h-36" />
          <h2 id={`topic-${topic.id}`} className="mt-3 text-base font-bold text-emerald-950">
            {topic.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-emerald-800/80">{topic.summary}</p>

          {topic.groups && (
            <div className="mt-3 flex flex-col gap-2">
              {topic.groups.map((g) => {
                const style = GROUP_STYLE[g.color] ?? GROUP_STYLE.green;
                return (
                  <div key={g.name} className={`rounded-2xl border p-3 ${style.card}`}>
                    <p className={`flex items-center gap-2 text-sm font-semibold ${style.title}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
                      {g.name}
                    </p>
                    <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-emerald-950/80">
                      {g.examples.map((ex) => (
                        <li key={ex} className="leading-snug">• {ex}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          <h3 className="mt-4 text-sm font-semibold text-emerald-950">What you can do</h3>
          <ol className="mt-2 flex flex-col gap-2">
            {topic.steps.map((s, i) => (
              <li key={s} className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {i + 1}
                </span>
                <span className="text-sm leading-snug text-emerald-950/90">{s}</span>
              </li>
            ))}
          </ol>

          <div className="mt-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-semibold text-amber-800">💡 Did you know?</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">{topic.fact}</p>
          </div>
        </article>

        {/* Turn learning into action */}
        <button
          type="button"
          onClick={() => navigate("/citizen/report")}
          className={`mt-4 ${CARD_BUTTON_FILLED}`}
        >
          <span className="text-xl" aria-hidden="true">📣</span>
          <span className="flex-1 text-sm font-semibold">
            Spot an overflowing bin?
            <span className="block text-xs font-normal text-white/80">Report it so it gets cleared sooner</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </CitizenShell>
  );
}
