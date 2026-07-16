import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";

/* ————————————————————————————————— Kronicler design tokens (ratified) */
const T = {
  paper: "#F5F3EC", surface: "#FFFFFF", inset: "#FAF9F4",
  ink: "#1F1D18", sub: "#6C6656", muted: "#A29B85", faint: "#C4BEA9",
  line: "#E7E3D6", lineStrong: "#D3CDBA",
  quill: "#3A5488", quillBg: "#EDF1F8", quillLine: "#B9C6DE",
  wax: "#A63A2E", waxBg: "#F9ECE9",
  amber: "#93630E", amberBg: "#F7EFDB",
  serif: "'Newsreader', Georgia, serif", sans: "'Inter', system-ui, sans-serif",
  shadow: "0 1px 2px rgba(31,29,24,.05)", pop: "0 10px 32px rgba(31,29,24,.16), 0 2px 6px rgba(31,29,24,.08)",
};
const VALENCE = {
  bond: { color: "#3A5488", label: "bond" },
  hostile: { color: "#A63A2E", label: "hostile" },
  obligation: { color: "#93630E", label: "obligation" },
  neutral: { color: "#6C6656", label: "neutral" },
  ambient: { color: "#A29B85", label: "ambient" },
};

/* ————————————————————————————————— seed data (dummy world) */
const ENTITIES = [
  { id: "maren", type: "Character", title: "Maren Vael", aliases: ["The Reedwife"], x: 340, y: 200, body: "Ferry-mistress of the crossing, keeper of debts she never wanted. Maren reads the river the way others read scripture — and lately the river has been lying to her." },
  { id: "odran", type: "Character", title: "Odran of the Reeds", aliases: ["Odran"], x: 180, y: 118, body: "Once Maren's closest ally on the water. Sworn to the Reed Court, though his oaths have begun to fray at the edges." },
  { id: "vicar", type: "Character", title: "The Pale Vicar", aliases: ["the Vicar"], x: 500, y: 108, body: "Collector of quiet obligations. Nobody remembers agreeing to owe him anything, and everybody does." },
  { id: "corven", type: "Character", title: "Corven Ashmark", aliases: ["Ash"], x: 522, y: 292, body: "A lantern-guild broker with a ledger for a heart, and — inconveniently — a conscience." },
  { id: "issa", type: "Character", title: "Issa Thornwake", aliases: ["Thornwake"], x: 158, y: 292, body: "Keeper of the silver locket, until she wasn't. Issa trusts exactly one person, which is one more than is safe." },
  { id: "reedcourt", type: "Faction", title: "The Reed Court", aliases: ["the Court"], x: 336, y: 56, body: "The old authority of the crossings. Their oaths bind tighter than rope and rot just as slowly." },
  { id: "lantern", type: "Faction", title: "The Lantern Guild", aliases: ["the Guild"], x: 624, y: 176, body: "Merchants of light and ledgers. Every favor is priced; every price is remembered." },
  { id: "duskmere", type: "Place", title: "Duskmere", aliases: [], x: 76, y: 196, body: "A drowned town that never quite finished drowning. Issa's home, for a generous definition of home." },
  { id: "reedwater", type: "Place", title: "Reedwater Crossing", aliases: ["the crossing"], x: 258, y: 344, body: "Where every road in the marches eventually apologizes and turns back. Maren's ferry runs here." },
  { id: "locket", type: "Item", title: "The Silver Locket", aliases: ["the locket"], x: 428, y: 352, body: "Holds the last portrait of a face three people would kill to forget. Currently ash — though only the reader knows it." },
  { id: "thicket", type: "Place", title: "Slumbering Thicket", aliases: [], x: 620, y: 344, body: "A stretch of woodland nobody has written a reason for yet." },
];
const SEED_TYPES = {
  allied: { label: "allied with", cat: "bond" }, rival: { label: "rival of", cat: "hostile" },
  betrayed: { label: "betrayed", cat: "hostile" }, indebted: { label: "indebted to", cat: "obligation" },
  repaid: { label: "debt repaid", cat: "obligation" }, entrusted: { label: "entrusted", cat: "bond" },
  concealed: { label: "concealed from", cat: "hostile" }, member: { label: "member of", cat: "ambient" },
  keeper: { label: "keeper of", cat: "ambient" }, lost: { label: "lost", cat: "neutral" },
};
const SEED_STATES = [
  { rel: "maren-odran", a: "maren", b: "odran", type: "allied", ch: 6, st: 12, except: [], note: "Two boats, one toll." },
  { rel: "maren-odran", a: "maren", b: "odran", type: "rival", ch: 21, st: 40, except: [], note: "The toll dispute turns cold." },
  { rel: "maren-odran", a: "maren", b: "odran", type: "betrayed", ch: 34, st: 61, except: ["odran"], note: "Odran sells the schedule. He does not know Maren saw." },
  { rel: "maren-vicar", a: "maren", b: "vicar", type: "indebted", ch: 9, st: 5, except: [], note: "Help before the bells; the debt rides with it." },
  { rel: "maren-corven", a: "maren", b: "corven", type: "indebted", ch: 15, st: 27, except: [], note: "Borrowed against next season's tolls." },
  { rel: "maren-corven", a: "maren", b: "corven", type: "repaid", ch: 31, st: 55, except: [], note: "Marked repaid on the overland road." },
  { rel: "issa-maren", a: "issa", b: "maren", type: "entrusted", ch: 12, st: 22, except: [], note: "Locket given as surety. Sworn unopened." },
  { rel: "maren-odran-x", a: "maren", b: "odran", type: "concealed", ch: 27, st: 48, except: ["odran"], note: "Odran does not know the locket burned." },
  { rel: "odran-court", a: "odran", b: "reedcourt", type: "member", ch: 3, st: 8, except: [], note: "Oath renewed beneath the banners." },
  { rel: "vicar-court", a: "vicar", b: "reedcourt", type: "member", ch: 3, st: 8, except: [], note: "Watches from the gallery." },
  { rel: "corven-guild", a: "corven", b: "lantern", type: "member", ch: 6, st: 12, except: [], note: "Broker in good standing." },
  { rel: "issa-duskmere", a: "issa", b: "duskmere", type: "keeper", ch: 3, st: 8, except: [], note: "Home, generously defined." },
  { rel: "locket-issa", a: "locket", b: "issa", type: "keeper", ch: 3, st: 8, except: [], note: "Kept beneath the floor at Duskmere." },
  { rel: "locket-maren", a: "locket", b: "maren", type: "keeper", ch: 12, st: 22, except: [], note: "Passed as surety." },
  { rel: "locket-maren", a: "locket", b: "maren", type: "lost", ch: 27, st: 48, except: ["odran"], note: "Taken by the fire at Koere." },
];
const SEED_CHAPTERS = [
  { id: "c3", num: 3, story: 8, title: "The Reed Oaths", cast: [["odran", "pov"], ["vicar", "present"], ["reedcourt", "mentioned"]], body: "Odran renewed his oath beneath the reed banners while the Vicar watched from the gallery, counting something no one else could see. The Court's hall smelled of wet rope and old candle smoke.\n\nWhen the words were done, Odran felt lighter, which should have worried him." },
  { id: "c6", num: 6, story: 12, title: "River Toll Rising", cast: [["maren", "pov"], ["odran", "present"]], body: "Maren and Odran ran the toll together that season and called it friendship. It was, for now. Two boats, one ledger, and the crossing never waited for either of them.\n\nDownriver, someone from the Guild had started asking about Ash by name." },
  { id: "c9", num: 9, story: 5, title: "Before the Bells", cast: [["maren", "pov"], ["vicar", "present"]], body: "Years earlier. A younger Maren accepted the Vicar's help without asking its price, which is the only way his help is ever offered.\n\nThe bells of Koere rang while she signed nothing at all. That was the trick of it — there was never anything to sign." },
  { id: "c12", num: 12, story: 22, title: "The Silver Surety", cast: [["issa", "pov"], ["maren", "present"], ["locket", "present"]], body: "Issa pressed the locket into Maren's palm as surety and made her swear not to open it. The metal was warmer than the room, which Maren chose not to think about.\n\n\"Thornwake,\" Maren said, \"if this is trouble, say so now.\" Issa said nothing, which was its own answer." },
  { id: "c15", num: 15, story: 27, title: "Lantern Debts", cast: [["maren", "pov"], ["corven", "present"]], body: "Maren borrowed against next season's tolls. Corven wrote it down twice, once in the Guild ledger and once somewhere Maren wasn't meant to see.\n\n\"You'll repay this one,\" he said. It wasn't a threat. From Ash, it was closer to a prayer." },
  { id: "c21", num: 21, story: 40, title: "Salt in the Wound", cast: [["maren", "pov"], ["odran", "present"]], body: "The toll dispute turned cold the way rivers freeze — from the edges in. Maren and Odran stopped rowing the same direction and pretended not to notice.\n\nThe Court sent no word, which meant the Court had already decided something." },
  { id: "c27", num: 27, story: 48, title: "Ashes at Koere", cast: [["maren", "pov"], ["odran", "present"], ["locket", "mentioned"]], body: "The fire took the strongbox and most of the east dock. The locket, or what remained of it, was never mentioned to Odran.\n\nMaren swept ash until her hands were the color of the thing she was hiding." },
  { id: "c31", num: 31, story: 55, title: "The Long Overland", cast: [["corven", "pov"], ["maren", "present"], ["issa", "mentioned"]], body: "Corven marked the debt repaid at a waystation table, and meant it. Someone on the road asked about the locket only once, and Maren answered with weather.\n\nThornwake's name came up near the border. Maren changed the subject twice." },
  { id: "c34", num: 34, story: 61, title: "Betrayal at Reedwater", cast: [["maren", "pov"], ["odran", "present"], ["vicar", "present"]], body: "Odran slid the crossing schedule across the table to the Court's clerk, and Maren watched him do it from the dark of the boathouse door.\n\nThe Vicar was there too, of course. He is always where debts change hands. Maren counted her breaths and let the door stay shut." },
  { id: "c38", num: 38, story: 66, title: "What the Vicar Knew", cast: [["vicar", "pov"], ["maren", "mentioned"]], body: "Drafting — select any sentence you write here and mark it as a state change. The Vicar knew about the locket before the fire did." },
];
const SEED_MENTIONS = [
  { id: "m1", entity: "locket", ch: 27, text: "…the locket, or what remained of it…" },
  { id: "m2", entity: "issa", ch: 31, text: "…Thornwake's name came up near the border…" },
];

const ent = (id) => ENTITIES.find((e) => e.id === id);

/* ————————————————————————————————— primitives */
const Chip = ({ children, on, warn, tone, onClick, style }) => (
  <span onClick={onClick} style={{
    fontSize: 11.5, lineHeight: 1, padding: "5px 11px", borderRadius: 999, whiteSpace: "nowrap",
    cursor: onClick ? "pointer" : "default", userSelect: "none", display: "inline-flex", alignItems: "center", gap: 5,
    border: `1px solid ${on ? T.quillLine : warn ? "#E0C89A" : T.line}`,
    background: on ? T.quillBg : warn ? T.amberBg : "#FFFFFF",
    color: on ? T.quill : warn ? T.amber : tone || T.sub, fontWeight: on ? 600 : 450, ...style,
  }}>{children}</span>
);
const Label = ({ children, style }) => (
  <p style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".09em", textTransform: "uppercase", color: T.muted, margin: "0 0 8px", ...style }}>{children}</p>
);
const Card = ({ children, style }) => (
  <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden", background: T.surface, boxShadow: T.shadow, ...style }}>{children}</div>
);
const Row = ({ children, onClick, last, pad = "10px 14px" }) => (
  <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: pad, borderBottom: last ? "none" : `1px solid ${T.line}`, fontSize: 13, cursor: onClick ? "pointer" : "default", transition: "background .12s" }}
    onMouseEnter={(e) => onClick && (e.currentTarget.style.background = T.inset)}
    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>{children}</div>
);
const Dot = ({ cat, r = 7 }) => <span style={{ width: r, height: r, borderRadius: "50%", background: VALENCE[cat].color, flexShrink: 0, display: "inline-block" }} />;
const Btn = ({ children, primary, small, onClick, style }) => (
  <button onClick={onClick} style={{
    fontFamily: T.sans, fontSize: small ? 12 : 12.5, fontWeight: 600, cursor: "pointer",
    padding: small ? "5px 12px" : "8px 16px", borderRadius: 8,
    border: primary ? "none" : `1px solid ${T.lineStrong}`,
    background: primary ? T.ink : "#FFF", color: primary ? "#F5F3EC" : T.ink, ...style,
  }}>{children}</button>
);

/* ————————————————————————————————— engine helpers (all views read these) */
function latestStates(states, relTypes, { asOf = 40, viewer = "all", type = "all", entitySet = null }) {
  const rows = states.filter((s) => s.ch <= asOf)
    .filter((s) => (viewer === "all" ? true : !(s.except || []).includes(viewer)))
    .filter((s) => (type === "all" ? true : s.type === type))
    .filter((s) => (entitySet ? entitySet.includes(s.a) && entitySet.includes(s.b) : true));
  const byRel = {};
  rows.forEach((s) => { if (!byRel[s.rel] || s.ch > byRel[s.rel].ch) byRel[s.rel] = s; });
  return Object.values(byRel);
}
const statesFor = (states, id, asOf = 40) => states.filter((s) => (s.a === id || s.b === id) && s.ch <= asOf);
const isDormant = (relTypes, s, now = 34) => now - s.ch >= 15 && !["ambient"].includes(relTypes[s.type]?.cat) && !["repaid", "lost"].includes(s.type);

/* ————————————————————————————————— App */
export default function App() {
  const [states, setStates] = useState(SEED_STATES);
  const [relTypes, setRelTypes] = useState(SEED_TYPES);
  const [chapters, setChapters] = useState(SEED_CHAPTERS);
  const [mentions, setMentions] = useState(SEED_MENTIONS);
  const [views, setViews] = useState([{ id: "v1", name: "Reedwater arc", type: "Character", q: "reed" }]);

  const [nav, setNav] = useState({ view: "overview" });
  const [libType, setLibType] = useState("Character");
  const [libView, setLibView] = useState(null);
  const [entityTab, setEntityTab] = useState("doc");
  const [chapterTab, setChapterTab] = useState("doc");
  const [msOrder, setMsOrder] = useState("manuscript");
  const [lens, setLens] = useState("graph");
  const [fType, setFType] = useState("all");
  const [viewer, setViewer] = useState("all");
  const [asOf, setAsOf] = useState(34);
  const [egoId, setEgoId] = useState(null);
  const [entitySet, setEntitySet] = useState(null);
  const [selNode, setSelNode] = useState(null);
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); } if (e.key === "Escape") setPaletteOpen(false); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); } }, [toast]);

  const appendState = useCallback((row) => {
    setStates((prev) => {
      const existing = prev.find((s) => (s.a === row.a && s.b === row.b) || (s.a === row.b && s.b === row.a));
      return [...prev, { ...row, rel: existing ? existing.rel : `${row.a}-${row.b}-${Date.now()}` }];
    });
    setToast(`State appended — ${ent(row.a).title.split(" ")[0]} · ${relTypes[row.type]?.label || row.type} · ${ent(row.b).title.split(" ")[0]} · ch. ${row.ch}`);
  }, [relTypes]);
  const mintType = useCallback((label, cat) => {
    const id = label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || `t${Date.now()}`;
    setRelTypes((p) => ({ ...p, [id]: { label, cat } }));
    return id;
  }, []);

  const goEntity = (id, tab = "doc") => { setQuery(""); setEntityTab(tab); setNav({ view: "library", entityId: id }); };
  const goChapter = (num, tab = "doc") => { setQuery(""); setChapterTab(tab); setNav({ view: "manuscript", chapterNum: num }); };
  const searching = query.trim().length >= 2;
  const rail = [["overview", "Overview", "◫"], ["library", "Library", "❖"], ["manuscript", "Manuscript", "▤"], ["relationships", "Relationships", "✳"]];

  const ctx = { states, setStates, relTypes, setRelTypes, chapters, setChapters, mentions, setMentions, views, setViews, appendState, mintType, goEntity, goChapter, setToast };

  return (
    <div style={{ fontFamily: T.sans, background: T.paper, minHeight: "100vh", color: T.ink, padding: "22px 18px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Inter:wght@400;450;500;600;650&display=swap');
        *{box-sizing:border-box} input,select,button{font-family:${T.sans}}
        input:focus,select:focus{outline:none;border-color:${T.quill}!important;box-shadow:0 0 0 3px ${T.quillBg}}
        ::selection{background:#DCE4F2}
        .fi{animation:fi .22s ease}@keyframes fi{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
        .pop{animation:pop .18s cubic-bezier(.3,1.2,.5,1)}@keyframes pop{from{opacity:0;transform:scale(.96) translateY(4px)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.fi,.pop{animation:none}}
        input[type=range]{accent-color:${T.quill};height:4px}
      `}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 10px rgba(31,29,24,.06)" }}>
          {/* chrome */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: `1px solid ${T.line}`, background: "#FDFCF9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, padding: "7px 13px", border: `1px solid ${T.lineStrong}`, borderRadius: 9, whiteSpace: "nowrap", background: "#FFF", cursor: "pointer" }}>
              <span style={{ fontFamily: T.serif, fontStyle: "italic", fontWeight: 600, fontSize: 16, color: T.quill }}>K</span> Zoonya <span style={{ color: T.faint, fontSize: 10 }}>▾</span>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: 13 }}>⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search world content — try “locket”" style={{ width: "100%", fontSize: 13, padding: "9px 12px 9px 32px", border: `1px solid ${T.line}`, borderRadius: 9, background: "#FFF", color: T.ink, transition: "border-color .15s, box-shadow .15s" }} />
            </div>
            <button onClick={() => setPaletteOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.sub, padding: "8px 12px", border: `1px solid ${T.line}`, borderRadius: 9, background: "#FFF", cursor: "pointer", whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: "monospace", fontSize: 10.5, border: `1px solid ${T.lineStrong}`, borderRadius: 5, padding: "2px 6px", background: T.inset }}>⌘K</span> Jump or create
            </button>
          </div>
          <div style={{ display: "flex", minHeight: 620 }}>
            {/* rail */}
            <div style={{ width: 176, flexShrink: 0, borderRight: `1px solid ${T.line}`, padding: "14px 10px 10px", display: "flex", flexDirection: "column", gap: 2, background: "#FDFCF9" }}>
              {rail.map(([id, label, g]) => {
                const on = !searching && nav.view === id;
                return (
                  <div key={id} onClick={() => { setQuery(""); setNav({ view: id }); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: on ? 650 : 450, background: on ? T.quillBg : "transparent", color: on ? T.quill : T.sub }}>
                    <span style={{ width: 15, textAlign: "center", fontSize: 12.5, opacity: on ? 1 : 0.75 }}>{g}</span>{label}
                  </div>
                );
              })}
              <div style={{ flex: 1 }} />
              <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                <div onClick={() => { setQuery(""); setNav({ view: "settings" }); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13, color: nav.view === "settings" && !searching ? T.quill : T.muted, fontWeight: nav.view === "settings" && !searching ? 650 : 450, background: nav.view === "settings" && !searching ? T.quillBg : "transparent", cursor: "pointer" }}><span style={{ width: 15, textAlign: "center" }}>⚙</span>Settings</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", fontSize: 13, color: T.muted }}>
                  <span style={{ width: 19, height: 19, borderRadius: "50%", background: T.quillBg, color: T.quill, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 650, border: `1px solid ${T.quillLine}` }}>K</span>Account
                </div>
              </div>
            </div>
            {/* main */}
            <div style={{ flex: 1, minWidth: 0, padding: "20px 24px", overflow: "hidden" }}>
              {searching ? <SearchResults ctx={ctx} query={query} onGraph={(set) => { setEntitySet(set); setEgoId(null); setQuery(""); setLens("graph"); setNav({ view: "relationships" }); }} />
                : nav.view === "overview" ? <Overview ctx={ctx} goRel={() => setNav({ view: "relationships" })} />
                : nav.view === "library" ? (nav.entityId ? <EntityPage ctx={ctx} id={nav.entityId} tab={entityTab} setTab={setEntityTab} back={() => setNav({ view: "library" })} /> : <Library ctx={ctx} libType={libType} setLibType={setLibType} libView={libView} setLibView={setLibView} />)
                : nav.view === "manuscript" ? (nav.chapterNum ? <ChapterPage ctx={ctx} num={nav.chapterNum} tab={chapterTab} setTab={setChapterTab} back={() => setNav({ view: "manuscript" })} /> : <Manuscript ctx={ctx} order={msOrder} setOrder={setMsOrder} />)
                : nav.view === "settings" ? <Settings ctx={ctx} />
                : <Relationships ctx={ctx} lens={lens} setLens={setLens} fType={fType} setFType={setFType} viewer={viewer} setViewer={setViewer} asOf={asOf} setAsOf={setAsOf} egoId={egoId} setEgoId={setEgoId} entitySet={entitySet} setEntitySet={setEntitySet} selNode={selNode} setSelNode={setSelNode} />}
            </div>
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: 11.5, color: T.muted, margin: "16px 0 0" }}>Kronicler — interaction prototype · dummy data · open a chapter and select a sentence to record a state · everything recomputes live</p>
      </div>
      {paletteOpen && <Palette ctx={ctx} close={() => setPaletteOpen(false)} />}
      {toast && <div className="pop" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: T.ink, color: "#F5F3EC", fontSize: 12.5, fontWeight: 500, padding: "10px 18px", borderRadius: 10, boxShadow: T.pop, zIndex: 80, maxWidth: 520 }}>✳ {toast}</div>}
    </div>
  );
}

/* ————————————————————————————————— Overview */
function Overview({ ctx, goRel }) {
  const { states, relTypes, mentions, goEntity, goChapter } = ctx;
  const recent = [...states].sort((a, b) => b.ch - a.ch).slice(0, 5);
  const orphans = ENTITIES.filter((e) => !states.some((s) => s.a === e.id || s.b === e.id));
  const dormant = latestStates(states, relTypes, { asOf: 34 }).filter((s) => isDormant(relTypes, s));
  return (
    <div className="fi">
      <h2 style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 24, margin: "0 0 3px" }}>Overview</h2>
      <p style={{ fontSize: 12.5, color: T.sub, margin: "0 0 20px" }}>What changed and what needs attention. Everything here lives somewhere else.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 }}>
        <div>
          <Label>Recent state changes</Label>
          <Card>
            {recent.map((s, i) => (
              <Row key={i} last={i === recent.length - 1} onClick={goRel}>
                <Dot cat={relTypes[s.type]?.cat || "neutral"} />
                <span style={{ fontWeight: 550 }}>{ent(s.a).title.split(" ")[0]} <span style={{ color: VALENCE[relTypes[s.type]?.cat || "neutral"].color, fontWeight: 600 }}>{relTypes[s.type]?.label}</span> {ent(s.b).title.split(" ")[0]}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: T.muted }}>ch. {s.ch}</span>
              </Row>
            ))}
          </Card>
        </div>
        <div>
          <Label>Unlinked mentions · {mentions.length}</Label>
          <Card style={{ marginBottom: 18 }}>
            {mentions.length === 0 && <Row last><span style={{ color: T.muted, fontSize: 12.5 }}>Queue clear — every mention in the draft is linked.</span></Row>}
            {mentions.map((m, i) => (
              <Row key={m.id} last={i === mentions.length - 1} onClick={() => goChapter(m.ch)}>
                <span style={{ fontWeight: 550 }}>{ent(m.entity).title}</span>
                <span style={{ flex: 1, color: T.muted, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: T.serif, fontStyle: "italic" }}>{m.text}</span>
                <span style={{ fontSize: 11.5, color: T.muted }}>ch. {m.ch}</span>
              </Row>
            ))}
          </Card>
          <Label>Needs attention</Label>
          <Card>
            {dormant.map((s, i) => (
              <Row key={"d" + i} onClick={() => goEntity(s.a, "thread")}>
                <Chip warn>dormant</Chip>
                <span style={{ fontSize: 12.5 }}>{ent(s.a).title.split(" ")[0]} · {relTypes[s.type]?.label} · {ent(s.b).title.split(" ")[0]}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: T.muted }}>quiet {34 - s.ch} ch. → thread</span>
              </Row>
            ))}
            {orphans.map((e, i) => (
              <Row key={e.id} last={i === orphans.length - 1} onClick={() => goEntity(e.id)}>
                <Chip warn>orphaned</Chip>
                <span style={{ fontSize: 12.5 }}>{e.title}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: T.muted }}>no relationships yet</span>
              </Row>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ————————————————————————————————— Library + saved views */
function Library({ ctx, libType, setLibType, libView, setLibView }) {
  const { states, views, setViews, goEntity } = ctx;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const types = ["Character", "Place", "Faction", "Item"];
  const activeView = views.find((v) => v.id === libView);
  const effType = activeView ? activeView.type : libType;
  const effQ = activeView ? activeView.q : q;
  const list = ENTITIES.filter((e) => e.type === effType).filter((e) => !effQ || (e.title + " " + e.aliases.join(" ") + " " + (e.body || "")).toLowerCase().includes(effQ.toLowerCase()));
  return (
    <div className="fi">
      <h2 style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 24, margin: "0 0 14px" }}>Library</h2>
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.line}`, marginBottom: 14, alignItems: "center" }}>
        {types.map((t) => {
          const n = ENTITIES.filter((e) => e.type === t).length;
          const on = !activeView && t === libType;
          return (
            <div key={t} onClick={() => { setLibType(t); setLibView(null); }} style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: on ? 650 : 450, color: on ? T.ink : T.sub, borderBottom: on ? `2px solid ${T.ink}` : "2px solid transparent", marginBottom: -1 }}>
              {t}s <span style={{ color: T.faint, fontWeight: 450 }}>{n}</span>
            </div>
          );
        })}
        <span style={{ width: 1, height: 18, background: T.line, margin: "0 6px" }} />
        {views.map((v) => {
          const on = libView === v.id;
          return (
            <div key={v.id} onClick={() => setLibView(on ? null : v.id)} style={{ padding: "8px 12px", fontSize: 12.5, cursor: "pointer", fontWeight: on ? 650 : 450, color: on ? T.quill : T.sub, borderBottom: on ? `2px solid ${T.quill}` : "2px solid transparent", marginBottom: -1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10 }}>◈</span>{v.name}
            </div>
          );
        })}
        {adding ? (
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { setViews([...views, { id: "v" + Date.now(), name: newName.trim(), type: libType, q }]); setNewName(""); setAdding(false); } if (e.key === "Escape") setAdding(false); }} placeholder="Name this view ↵" style={{ fontSize: 12, padding: "5px 10px", border: `1px solid ${T.quillLine}`, borderRadius: 7, width: 140, margin: "0 0 3px 4px" }} />
        ) : (
          <span onClick={() => setAdding(true)} style={{ fontSize: 12, color: T.muted, cursor: "pointer", padding: "8px 10px" }}>+ New view</span>
        )}
        <span style={{ flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input value={activeView ? activeView.q : q} onChange={(e) => activeView ? setViews(views.map((v) => v.id === activeView.id ? { ...v, q: e.target.value } : v)) : setQ(e.target.value)} placeholder={`Filter ${effType.toLowerCase()}s — a saved view remembers this`} style={{ flex: 1, fontSize: 12.5, padding: "7px 12px", border: `1px solid ${T.line}`, borderRadius: 8, background: "#FFF" }} />
        {activeView && <Chip on onClick={() => { setViews(views.filter((v) => v.id !== activeView.id)); setLibView(null); }}>saved view · delete ✕</Chip>}
      </div>
      <Card>
        {list.map((e, i) => {
          const rels = new Set(statesFor(states, e.id).map((s) => s.rel));
          const last = statesFor(states, e.id).sort((a, b) => b.ch - a.ch)[0];
          return (
            <Row key={e.id} last={i === list.length - 1} onClick={() => goEntity(e.id)}>
              <span style={{ fontFamily: T.serif, fontSize: 15.5, fontWeight: 500, flex: 1 }}>{e.title}</span>
              <span onClick={(ev) => { ev.stopPropagation(); goEntity(e.id, "thread"); }} title="Open thread view" style={{ color: T.muted, fontSize: 13, padding: "2px 6px", cursor: "pointer" }}>≋</span>
              {rels.size > 0 ? <Chip>{rels.size} relationship{rels.size > 1 ? "s" : ""}</Chip> : <Chip warn>orphaned</Chip>}
              <span style={{ fontSize: 11.5, color: T.muted, width: 116, textAlign: "right" }}>{last ? `last state · ch. ${last.ch}` : "no states yet"}</span>
            </Row>
          );
        })}
        {list.length === 0 && <Row last><span style={{ color: T.muted, fontSize: 12.5 }}>Nothing matches. Clear the filter, or create the entity from ⌘K — it takes one line.</span></Row>}
      </Card>
    </div>
  );
}

/* ————————————————————————————————— Entity page: Document + Thread */
function EntityPage({ ctx, id, tab, setTab, back }) {
  const { states, relTypes, goChapter } = ctx;
  const e = ent(id);
  const my = statesFor(states, id).sort((a, b) => a.ch - b.ch);
  const rels = [...new Set(my.map((s) => s.rel))];
  const appears = ctx.chapters.filter((c) => c.cast.some(([cid]) => cid === id));
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="fi">
      <p onClick={back} style={{ fontSize: 12, color: T.muted, margin: "0 0 8px", cursor: "pointer" }}>← Library / {e.type}s</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 2 }}>
        <h2 style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 26, margin: 0 }}>{e.title}</h2>
        <Chip>{e.type}</Chip>
        {e.aliases.length > 0 && <span style={{ fontSize: 12, color: T.muted, fontFamily: T.serif, fontStyle: "italic" }}>also "{e.aliases.join('", "')}"</span>}
      </div>
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.line}`, margin: "12px 0 18px" }}>
        {[["doc", "Document"], ["thread", "Thread view"]].map(([t, l]) => (
          <div key={t} onClick={() => setTab(t)} style={{ padding: "7px 15px", fontSize: 13, cursor: "pointer", fontWeight: tab === t ? 650 : 450, color: tab === t ? T.ink : T.sub, borderBottom: tab === t ? `2px solid ${T.ink}` : "2px solid transparent", marginBottom: -1 }}>{l}</div>
        ))}
      </div>
      {tab === "doc" ? (
        <div>
          <p style={{ fontFamily: T.serif, fontSize: 16, lineHeight: 1.7, margin: "0 0 22px", maxWidth: 620 }}>{e.body}</p>
          <Label>Connections</Label>
          <Card style={{ marginBottom: 20, maxWidth: 720 }}>
            {rels.map((rel) => {
              const hist = my.filter((s) => s.rel === rel);
              const latest = hist[hist.length - 1];
              const other = latest.a === id ? latest.b : latest.a;
              const cat = relTypes[latest.type]?.cat || "neutral";
              const open = expanded === rel;
              return (
                <div key={rel} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <Row last onClick={() => setExpanded(open ? null : rel)}>
                    <span style={{ color: T.faint, fontSize: 10, width: 10 }}>{open ? "▾" : "▸"}</span>
                    <Dot cat={cat} />
                    <span style={{ fontWeight: 550, color: VALENCE[cat].color, fontSize: 12.5 }}>{relTypes[latest.type]?.label}</span>
                    <span style={{ fontFamily: T.serif, fontSize: 15, fontWeight: 500, flex: 1 }}>{ent(other).title}</span>
                    <span style={{ fontSize: 11.5, color: T.muted }}>ch. {latest.ch} · t {latest.st}</span>
                  </Row>
                  {open && (
                    <div style={{ margin: "0 0 12px 40px", borderLeft: `2px solid ${T.lineStrong}`, paddingLeft: 14, fontSize: 12.5 }}>
                      {hist.map((h, i) => (
                        <div key={i} style={{ marginBottom: 7, color: i === hist.length - 1 ? T.ink : T.sub }}>
                          <span style={{ color: VALENCE[relTypes[h.type]?.cat || "neutral"].color, fontWeight: 600 }}>{relTypes[h.type]?.label}</span>
                          {" · "}<span onClick={() => goChapter(h.ch)} style={{ color: T.quill, cursor: "pointer" }}>ch. {h.ch}</span>
                          {(h.except || []).length > 0 && <span style={{ color: T.wax, fontSize: 11.5 }}> · {h.except.map((x) => ent(x).title.split(" ")[0]).join(", ")} doesn't know</span>}
                          <span style={{ color: T.muted, fontFamily: T.serif, fontStyle: "italic" }}> — {h.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {rels.length === 0 && <Row last><span style={{ color: T.muted, fontSize: 12.5 }}>No typed relationships yet — this entity is flagged as orphaned in Overview until it has one. Record the first from any chapter draft, or from ⌘K.</span></Row>}
          </Card>
          <Label>Appears in</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {appears.map((c) => <Chip key={c.id} onClick={() => goChapter(c.num)}>ch. {c.num} · {c.cast.find(([cid]) => cid === id)[1]}</Chip>)}
            {appears.length === 0 && <span style={{ fontSize: 12.5, color: T.muted }}>Not yet placed in any chapter.</span>}
          </div>
        </div>
      ) : (
        <ThreadView ctx={ctx} id={id} />
      )}
    </div>
  );
}

function ThreadView({ ctx, id }) {
  const { states, relTypes, chapters, goChapter } = ctx;
  const [axis, setAxis] = useState("manuscript");
  const my = statesFor(states, id);
  const rels = [...new Set(my.map((s) => s.rel))];
  const appears = chapters.filter((c) => c.cast.some(([cid]) => cid === id));
  const X = (ch, st) => 132 + ((axis === "manuscript" ? ch : st) / (axis === "manuscript" ? 40 : 70)) * 476;
  const laneY = (i) => 100 + i * 54;
  const H = Math.max(100 + rels.length * 54 + 36, 210);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: T.sub }}>Axis</span>
        <Chip on={axis === "manuscript"} onClick={() => setAxis("manuscript")}>manuscript order</Chip>
        <Chip on={axis === "story"} onClick={() => setAxis("story")}>story time</Chip>
        {axis === "story" && <span style={{ fontSize: 11.5, color: T.amber }}>ch. 9 jumps left — it's a flashback</span>}
      </div>
      <Card>
        <svg width="100%" viewBox={`0 0 660 ${H}`} style={{ display: "block" }}>
          <line x1="132" y1="36" x2="616" y2="36" stroke={T.lineStrong} strokeWidth="1" />
          {[1, 10, 20, 30, 40].map((n) => (
            <text key={n} x={X(n, Math.round(n * 1.7))} y="25" fontSize="10.5" fill={T.muted} textAnchor="middle" fontFamily={T.sans}>{axis === "manuscript" ? `ch. ${n}` : `t ${Math.round(n * 1.7)}`}</text>
          ))}
          <text x="122" y="62" fontSize="11" fill={T.sub} textAnchor="end" fontWeight="600" fontFamily={T.sans}>appears in</text>
          {appears.map((c) => <rect key={c.id} x={X(c.num, c.story) - 2.5} y="50" width="5" height="13" rx="1.5" fill={T.lineStrong} style={{ cursor: "pointer" }} onClick={() => goChapter(c.num)} />)}
          {rels.map((rel, i) => {
            const hist = my.filter((s) => s.rel === rel).sort((a, b) => a.ch - b.ch);
            const other = hist[0].a === id ? hist[0].b : hist[0].a;
            const y = laneY(i);
            const lastS = hist[hist.length - 1];
            const dormant = isDormant(relTypes, lastS);
            return (
              <g key={rel}>
                <text x="122" y={y + 4} fontSize="11.5" fill={T.ink} textAnchor="end" fontWeight="600" fontFamily={T.sans}>{ent(other).title.split(" ")[0] === "The" ? ent(other).title.split(" ")[1] : ent(other).title.split(" ")[0]}</text>
                <line x1={X(hist[0].ch, hist[0].st)} y1={y} x2={Math.max(X(lastS.ch, lastS.st), 600)} y2={y} stroke={T.lineStrong} strokeWidth="1.5" strokeDasharray={dormant ? "1 4" : "none"} />
                {hist.map((h, j) => {
                  const cat = relTypes[h.type]?.cat || "neutral";
                  return (
                    <g key={j} style={{ cursor: "pointer" }} onClick={() => goChapter(h.ch)}>
                      <circle cx={X(h.ch, h.st)} cy={y} r={cat === "hostile" ? 6 : 5} fill={VALENCE[cat].color} />
                      <text x={X(h.ch, h.st)} y={y - 12} fontSize="10.5" fill={cat === "hostile" ? T.wax : T.sub} textAnchor="middle" fontWeight={cat === "hostile" ? 650 : 450} fontFamily={T.sans}>{relTypes[h.type]?.label} · {h.ch}</text>
                    </g>
                  );
                })}
                {dormant && <text x={600} y={y - 8} fontSize="10.5" fill={T.amber} textAnchor="end" fontFamily={T.sans}>no change in {34 - lastS.ch} ch.</text>}
              </g>
            );
          })}
          <line x1={X(34, 61)} y1="36" x2={X(34, 61)} y2={H - 28} stroke={T.quill} strokeWidth="1" strokeDasharray="3 3" opacity=".5" />
          <text x={X(34, 61)} y={H - 12} fontSize="10.5" fill={T.quill} textAnchor="middle" fontFamily={T.sans}>now writing · ch. 34</text>
        </svg>
      </Card>
      <p style={{ fontSize: 11.5, color: T.muted, margin: "8px 2px 0" }}>Every mark is a relationship_states row. Dots open their chapter. Dashed lanes are dormant threads.</p>
    </div>
  );
}

/* ————————————————————————————————— Manuscript */
function Manuscript({ ctx, order, setOrder }) {
  const { chapters, goChapter } = ctx;
  const list = [...chapters].sort((a, b) => (order === "manuscript" ? a.num - b.num : a.story - b.story));
  return (
    <div className="fi">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h2 style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 24, margin: 0 }}>Manuscript</h2>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.sub }}>Order</span>
        <Chip on={order === "manuscript"} onClick={() => setOrder("manuscript")}>manuscript</Chip>
        <Chip on={order === "story"} onClick={() => setOrder("story")}>story time</Chip>
      </div>
      {order === "story" && <p style={{ fontSize: 12, color: T.amber, margin: "0 0 10px" }}>Reordered by story time — the flashback surfaces first. The nonlinear structure, made visible.</p>}
      <Card>
        {list.map((c, i) => (
          <Row key={c.id} last={i === list.length - 1} onClick={() => goChapter(c.num)}>
            <span style={{ fontSize: 11.5, color: T.muted, width: 44, fontVariantNumeric: "tabular-nums" }}>ch. {c.num}</span>
            <span style={{ fontFamily: T.serif, fontSize: 15.5, fontWeight: 500, flex: 1 }}>{c.title}</span>
            <span style={{ fontSize: 11.5, color: T.muted }}>t {c.story}</span>
            <Chip>{c.cast.length} in cast</Chip>
            <span style={{ fontSize: 11.5, color: T.faint }}>{c.body.split(" ").length} words</span>
          </Row>
        ))}
      </Card>
    </div>
  );
}

/* ————————————————————————————————— Chapter page: Editor + Brief drawer */
function ChapterPage({ ctx, num, tab, setTab, back }) {
  const { chapters, states, relTypes, goEntity } = ctx;
  const c = chapters.find((x) => x.num === num);
  const [briefOpen, setBriefOpen] = useState(true);
  return (
    <div className="fi">
      <p onClick={back} style={{ fontSize: 12, color: T.muted, margin: "0 0 8px", cursor: "pointer" }}>← Manuscript</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 2 }}>
        <h2 style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 26, margin: 0 }}>Ch. {c.num} — {c.title}</h2>
        <span style={{ fontSize: 12, color: T.muted }}>story-time {c.story}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: T.muted }}>autosaved · version history</span>
      </div>
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.line}`, margin: "12px 0 0", alignItems: "center" }}>
        {[["doc", "Draft"], ["brief", "Brief — before you write"]].map(([t, l]) => (
          <div key={t} onClick={() => setTab(t)} style={{ padding: "7px 15px", fontSize: 13, cursor: "pointer", fontWeight: tab === t ? 650 : 450, color: tab === t ? T.ink : T.sub, borderBottom: tab === t ? `2px solid ${T.ink}` : "2px solid transparent", marginBottom: -1 }}>{l}</div>
        ))}
        <span style={{ flex: 1 }} />
        {tab === "doc" && <Chip on={briefOpen} onClick={() => setBriefOpen(!briefOpen)}>brief drawer {briefOpen ? "◨" : "◧"}</Chip>}
      </div>
      {tab === "doc" ? (
        <div style={{ display: "flex", gap: 20, paddingTop: 18 }}>
          <Editor ctx={ctx} chapter={c} />
          {briefOpen && <div style={{ width: 252, flexShrink: 0 }}><BriefPanel ctx={ctx} chapter={c} compact /></div>}
        </div>
      ) : (
        <div style={{ paddingTop: 18, maxWidth: 700 }}>
          <BriefPanel ctx={ctx} chapter={c} />
          <div style={{ marginTop: 16 }}>
            <Label>Cast</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {c.cast.map(([id, role]) => <Chip key={id} on={role === "pov"} onClick={() => goEntity(id)}>{ent(id).title} · {role}</Chip>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* — the editor: prose + live mention scan + in-prose composer */
function Editor({ ctx, chapter }) {
  const { states, relTypes, chapters, setChapters, mentions, setMentions, appendState, mintType, goEntity, setToast } = ctx;
  const wrapRef = useRef(null);
  const [selPos, setSelPos] = useState(null); // {x,y,text}
  const [composer, setComposer] = useState(null); // {x,y,note}

  const onMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !wrapRef.current) { setSelPos(null); return; }
    const text = sel.toString().trim();
    if (text.length < 3 || !wrapRef.current.contains(sel.anchorNode)) { setSelPos(null); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const w = wrapRef.current.getBoundingClientRect();
    setSelPos({ x: Math.min(Math.max(r.left - w.left + r.width / 2, 120), w.width - 120), y: r.top - w.top, text });
  };

  // mention-scan renderer: entity titles + aliases → linked (in cast) or unlinked (amber)
  const patterns = useMemo(() => {
    const list = [];
    ENTITIES.forEach((e) => { [e.title, ...e.aliases].forEach((n) => n && list.push({ n, id: e.id })); });
    return list.sort((a, b) => b.n.length - a.n.length);
  }, []);
  const renderProse = (text) => {
    const castIds = chapter.cast.map(([id]) => id);
    let parts = [{ t: text }];
    patterns.forEach(({ n, id }) => {
      const rx = new RegExp(`(${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      parts = parts.flatMap((p) => {
        if (p.id) return [p];
        const segs = p.t.split(rx);
        return segs.map((s, i) => (i % 2 === 1 ? { t: s, id } : { t: s })).filter((s) => s.t !== "");
      });
    });
    return parts.map((p, i) => {
      if (!p.id) return <span key={i}>{p.t}</span>;
      const inCast = castIds.includes(p.id);
      return (
        <span key={i}
          onClick={(e) => {
            e.stopPropagation();
            if (inCast) goEntity(p.id);
            else {
              setChapters(chapters.map((c) => c.id === chapter.id ? { ...c, cast: [...c.cast, [p.id, "mentioned"]] } : c));
              setMentions(mentions.filter((m) => !(m.entity === p.id && m.ch === chapter.num)));
              setToast(`Linked — ${ent(p.id).title} added to ch. ${chapter.num} cast as “mentioned”`);
            }
          }}
          title={inCast ? `Open ${ent(p.id).title}` : `Unlinked mention of ${ent(p.id).title} — click to link`}
          style={{ cursor: "pointer", color: inCast ? T.quill : T.amber, borderBottom: inCast ? "none" : `1.5px dotted ${T.amber}`, fontWeight: inCast ? 500 : 400 }}>
          {p.t}
        </span>
      );
    });
  };

  return (
    <div ref={wrapRef} onMouseUp={onMouseUp} style={{ flex: 1, minWidth: 0, position: "relative" }}>
      <div style={{ fontFamily: T.serif, fontSize: 16.5, lineHeight: 1.85, maxWidth: 600, color: T.ink }}>
        {chapter.body.split("\n\n").map((para, i) => <p key={i} style={{ margin: "0 0 18px" }}>{renderProse(para)}</p>)}
      </div>
      <p style={{ fontSize: 11.5, color: T.faint, maxWidth: 600, borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
        Select any passage to record what just happened. <span style={{ color: T.quill }}>Blue names</span> are linked cast · <span style={{ color: T.amber }}>amber dotted</span> are unlinked mentions, one click to link.
      </p>
      {selPos && !composer && (
        <div className="pop" onMouseDown={(e) => e.preventDefault()} onClick={() => { setComposer({ x: selPos.x, y: selPos.y, note: selPos.text }); setSelPos(null); }}
          style={{ position: "absolute", left: selPos.x, top: selPos.y - 40, transform: "translateX(-50%)", background: T.ink, color: "#F5F3EC", fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 999, cursor: "pointer", boxShadow: T.pop, whiteSpace: "nowrap", zIndex: 20 }}>
          ✳ Mark state change
        </div>
      )}
      {composer && <Composer ctx={ctx} chapter={chapter} anchor={composer} close={() => setComposer(null)} />}
    </div>
  );
}

/* — the composer: sentence-shaped, zero-knowledge-input default */
function Composer({ ctx, chapter, anchor, close }) {
  const { relTypes, appendState, mintType } = ctx;
  const castChars = chapter.cast.map(([id]) => id);
  const [a, setA] = useState(castChars[0] || ENTITIES[0].id);
  const [b, setB] = useState(castChars[1] || ENTITIES[1].id);
  const [typeQ, setTypeQ] = useState("");
  const [typeId, setTypeId] = useState(null);
  const [minting, setMinting] = useState(false);
  const [exceptOpen, setExceptOpen] = useState(false);
  const [except, setExcept] = useState([]);
  const matches = Object.entries(relTypes).filter(([, v]) => v.label.includes(typeQ.toLowerCase())).slice(0, 4);
  const exactMatch = Object.entries(relTypes).find(([, v]) => v.label === typeQ.toLowerCase());
  const chosen = typeId || (exactMatch && exactMatch[0]);
  const commit = (cat) => {
    let tid = chosen;
    if (!tid && typeQ.trim()) tid = mintType(typeQ.trim(), cat || "neutral");
    if (!tid) return;
    appendState({ a, b, type: tid, ch: chapter.num, st: chapter.story, except, note: anchor.note.length > 90 ? anchor.note.slice(0, 90) + "…" : anchor.note });
    close();
  };
  const Sel = ({ v, set, exclude }) => (
    <select value={v} onChange={(e) => set(e.target.value)} style={{ fontSize: 12.5, fontWeight: 600, padding: "4px 6px", border: "none", borderBottom: `2px solid ${T.quillLine}`, background: "transparent", color: T.quill, fontFamily: T.serif, cursor: "pointer" }}>
      {ENTITIES.filter((e) => e.id !== exclude).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
    </select>
  );
  return (
    <div className="pop" style={{ position: "absolute", left: Math.min(anchor.x, 320), top: anchor.y + 26, width: 400, background: T.surface, border: `1px solid ${T.lineStrong}`, borderRadius: 14, padding: "16px 18px", boxShadow: T.pop, zIndex: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted }}>New state · ch. {chapter.num} · auto</span>
        <span style={{ flex: 1 }} />
        <span onClick={close} style={{ color: T.muted, cursor: "pointer", fontSize: 13 }}>✕</span>
      </div>
      {/* the sentence */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 14, marginBottom: 10, fontFamily: T.serif }}>
        <Sel v={a} set={setA} exclude={b} />
        <span style={{ position: "relative" }}>
          <input autoFocus value={typeId ? relTypes[typeId].label : typeQ} onChange={(e) => { setTypeQ(e.target.value); setTypeId(null); setMinting(false); }} placeholder="did what…" style={{ fontSize: 13, fontStyle: typeId ? "normal" : "italic", padding: "4px 8px", border: "none", borderBottom: `2px solid ${typeId ? VALENCE[relTypes[typeId].cat].color : T.lineStrong}`, width: 130, background: "transparent", fontFamily: T.serif, color: typeId ? VALENCE[relTypes[typeId].cat].color : T.ink, fontWeight: typeId ? 600 : 400 }} />
          {typeQ && !typeId && (
            <div style={{ position: "absolute", top: "110%", left: 0, width: 210, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: T.pop, zIndex: 5, fontFamily: T.sans }}>
              {matches.map(([id, v]) => (
                <div key={id} onClick={() => { setTypeId(id); setTypeQ(""); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 12.5, cursor: "pointer", borderBottom: `1px solid ${T.line}` }}>
                  <Dot cat={v.cat} r={6} />{v.label}
                </div>
              ))}
              {!exactMatch && (
                minting ? (
                  <div style={{ padding: "8px 12px", fontSize: 12 }}>
                    <span style={{ color: T.sub }}>valence of “{typeQ}”: </span>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {["bond", "neutral", "obligation", "hostile", "ambient"].map((cat) => (
                        <span key={cat} onClick={() => commit(cat)} title={cat} style={{ width: 16, height: 16, borderRadius: "50%", background: VALENCE[cat].color, cursor: "pointer", border: "2px solid #fff", boxShadow: `0 0 0 1px ${T.line}` }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div onClick={() => setMinting(true)} style={{ padding: "8px 12px", fontSize: 12.5, color: T.quill, fontWeight: 600, cursor: "pointer" }}>+ mint “{typeQ}” as a new type</div>
                )
              )}
            </div>
          )}
        </span>
        <Sel v={b} set={setB} exclude={a} />
      </div>
      {/* zero-knowledge default; exception opt-in */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 11.5, color: T.muted, flexWrap: "wrap" }}>
        <span>known by everyone involved + the reader</span>
        <span onClick={() => setExceptOpen(!exceptOpen)} style={{ color: T.quill, cursor: "pointer", fontWeight: 600 }}>{exceptOpen ? "…" : "…except ▾"}</span>
        {exceptOpen && ENTITIES.filter((e) => e.type === "Character" && e.id !== a).map((e) => (
          <Chip key={e.id} on={except.includes(e.id)} onClick={() => setExcept(except.includes(e.id) ? except.filter((x) => x !== e.id) : [...except, e.id])} style={{ padding: "3px 9px" }}>{e.title.split(" ")[0]}</Chip>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: T.muted, fontFamily: T.serif, fontStyle: "italic", margin: "0 0 12px", borderLeft: `2px solid ${T.line}`, paddingLeft: 10 }}>"{anchor.note.length > 110 ? anchor.note.slice(0, 110) + "…" : anchor.note}"</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Btn primary small onClick={() => (chosen ? commit() : typeQ.trim() ? setMinting(true) : null)}>Append state ↵</Btn>
        <span style={{ fontSize: 11, color: T.faint }}>appends a row — history is never overwritten</span>
      </div>
    </div>
  );
}

/* — the brief: computed, live */
function BriefPanel({ ctx, chapter, compact }) {
  const { states, relTypes } = ctx;
  const castIds = chapter.cast.map(([id]) => id);
  const entering = latestStates(states, relTypes, { asOf: chapter.num - 1 }).filter((s) => castIds.includes(s.a) && castIds.includes(s.b));
  const secrets = latestStates(states, relTypes, { asOf: chapter.num - 1 }).filter((s) => (s.except || []).length > 0 && (castIds.includes(s.a) || castIds.includes(s.b) || s.except.some((x) => castIds.includes(x))));
  const open = latestStates(states, relTypes, { asOf: chapter.num - 1 }).filter((s) => (castIds.includes(s.a) || castIds.includes(s.b)) && isDormant(relTypes, s, chapter.num));
  const S = compact ? { fs: 11.5, pad: "8px 10px" } : { fs: 12.5, pad: "10px 14px" };
  return (
    <div>
      {!compact && <p style={{ fontSize: 12.5, color: T.sub, margin: "0 0 14px", maxWidth: 560 }}>Everything true as this chapter opens, computed from relationship_states for everyone present.</p>}
      <Label>True entering ch. {chapter.num}</Label>
      <Card style={{ marginBottom: 14 }}>
        {entering.map((s, i) => (
          <Row key={i} last={i === entering.length - 1} pad={S.pad}>
            <Dot cat={relTypes[s.type]?.cat || "neutral"} r={6} />
            <span style={{ fontSize: S.fs, fontWeight: 550 }}>{ent(s.a).title.split(" ")[0]} <span style={{ color: VALENCE[relTypes[s.type]?.cat || "neutral"].color }}>{relTypes[s.type]?.label}</span> {ent(s.b).title.split(" ")[0]}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: T.muted }}>ch. {s.ch}</span>
          </Row>
        ))}
        {entering.length === 0 && <Row last pad={S.pad}><span style={{ color: T.muted, fontSize: S.fs }}>No prior states among this cast — a first meeting, relationally.</span></Row>}
      </Card>
      <Label>Knowledge lines</Label>
      <Card style={{ marginBottom: 14, borderColor: secrets.length ? "#E8CFC9" : T.line }}>
        {secrets.map((s, i) => (
          <Row key={i} last={i === secrets.length - 1} pad={S.pad}>
            <span style={{ fontSize: S.fs, color: T.sub }}><span style={{ color: T.wax, fontWeight: 650 }}>{s.except.map((x) => ent(x).title.split(" ")[0]).join(", ")} must not reference:</span> {s.note}</span>
          </Row>
        ))}
        {secrets.length === 0 && <Row last pad={S.pad}><span style={{ color: T.muted, fontSize: S.fs }}>No concealments active among this cast.</span></Row>}
      </Card>
      {open.length > 0 && (
        <div>
          <Label>Threads you could touch here</Label>
          <Card>
            {open.map((s, i) => (
              <Row key={i} last={i === open.length - 1} pad={S.pad}>
                <Chip warn style={{ padding: "3px 8px", fontSize: 10.5 }}>quiet {chapter.num - s.ch} ch.</Chip>
                <span style={{ fontSize: S.fs }}>{ent(s.a).title.split(" ")[0]} · {relTypes[s.type]?.label} · {ent(s.b).title.split(" ")[0]}</span>
              </Row>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

/* ————————————————————————————————— Relationships: Stream + Graph */
function Relationships(p) {
  const { ctx, lens, setLens, fType, setFType, viewer, setViewer, asOf, setAsOf, egoId, setEgoId, entitySet, setEntitySet, selNode, setSelNode } = p;
  const { states, relTypes, goEntity, goChapter } = ctx;
  const filtered = latestStates(states, relTypes, { asOf, viewer, type: fType, entitySet });
  return (
    <div className="fi">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 24, margin: 0 }}>Relationships</h2>
        <div style={{ display: "flex", border: `1px solid ${T.lineStrong}`, borderRadius: 9, overflow: "hidden", fontSize: 12.5 }}>
          {["stream", "graph"].map((l) => (
            <span key={l} onClick={() => setLens(l)} style={{ padding: "6px 18px", cursor: "pointer", fontWeight: lens === l ? 650 : 450, background: lens === l ? T.ink : "#FFF", color: lens === l ? "#F5F3EC" : T.sub, textTransform: "capitalize" }}>{l}</span>
          ))}
        </div>
        <span style={{ fontSize: 11, color: T.faint }}>filters persist across lenses</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={fType} onChange={(e) => setFType(e.target.value)} style={{ fontSize: 12, padding: "5px 9px", border: `1px solid ${fType !== "all" ? T.quillLine : T.line}`, borderRadius: 999, background: fType !== "all" ? T.quillBg : "#FFF", color: fType !== "all" ? T.quill : T.sub, fontWeight: fType !== "all" ? 600 : 450 }}>
          <option value="all">Type: all</option>
          {Object.entries(relTypes).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
        </select>
        <select value={viewer} onChange={(e) => setViewer(e.target.value)} style={{ fontSize: 12, padding: "5px 9px", border: `1px solid ${viewer !== "all" ? T.quillLine : T.line}`, borderRadius: 999, background: viewer !== "all" ? T.quillBg : "#FFF", color: viewer !== "all" ? T.quill : T.sub, fontWeight: viewer !== "all" ? 600 : 450 }}>
          <option value="all">Knowledge: writer view (everything)</option>
          {ENTITIES.filter((e) => e.type === "Character").map((e) => <option key={e.id} value={e.id}>As {e.title.split(" ")[0]} believes</option>)}
        </select>
        {egoId && <Chip on onClick={() => setEgoId(null)}>ego · {ent(egoId).title.split(" ")[0]} ✕</Chip>}
        {entitySet && <Chip on onClick={() => setEntitySet(null)}>from search · {entitySet.length} entities ✕</Chip>}
        {viewer === "odran" && <span style={{ fontSize: 11.5, color: T.wax }}>the betrayal and the burned locket vanish — Odran doesn't know</span>}
      </div>
      {lens === "stream" ? (
        <Card>
          {[...filtered].sort((a, b) => b.ch - a.ch).map((s, i, arr) => (
            <Row key={i} last={i === arr.length - 1} onClick={() => goChapter(s.ch)}>
              <Dot cat={relTypes[s.type]?.cat || "neutral"} />
              <span style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 14.5 }} onClick={(e) => { e.stopPropagation(); goEntity(s.a); }}>{ent(s.a).title}</span>
              <span style={{ color: VALENCE[relTypes[s.type]?.cat || "neutral"].color, fontSize: 12.5, fontWeight: 650 }}>{relTypes[s.type]?.label}</span>
              <span style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 14.5 }} onClick={(e) => { e.stopPropagation(); goEntity(s.b); }}>{ent(s.b).title}</span>
              <span style={{ flex: 1, fontSize: 11.5, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: T.serif, fontStyle: "italic" }}>{s.note}</span>
              <span style={{ fontSize: 11.5, color: T.muted, whiteSpace: "nowrap" }}>ch. {s.ch} · t {s.st}</span>
            </Row>
          ))}
          {filtered.length === 0 && <Row last><span style={{ color: T.muted, fontSize: 12.5 }}>Nothing matches these lenses at this point in the story.</span></Row>}
        </Card>
      ) : (
        <Graph ctx={ctx} filtered={filtered} egoId={egoId} setEgoId={setEgoId} entitySet={entitySet} selNode={selNode} setSelNode={setSelNode} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, fontSize: 12, color: T.sub }}>
        <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>As of</span>
        <input type="range" min="1" max="40" value={asOf} onChange={(e) => setAsOf(+e.target.value)} style={{ flex: 1 }} />
        <span style={{ fontWeight: 650, color: T.ink, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>ch. {asOf}</span>
        <span style={{ color: T.faint, whiteSpace: "nowrap" }}>scrub the world back to any chapter</span>
      </div>
    </div>
  );
}

function Graph({ ctx, filtered, egoId, setEgoId, entitySet, selNode, setSelNode }) {
  const { states, relTypes, goEntity } = ctx;
  const W = 720, H = 400;
  const visible = useMemo(() => {
    let ids = new Set();
    filtered.forEach((s) => { ids.add(s.a); ids.add(s.b); });
    if (entitySet) entitySet.forEach((id) => ids.add(id));
    if (!entitySet && !egoId) ENTITIES.forEach((e) => { if (!states.some((s) => s.a === e.id || s.b === e.id)) ids.add(e.id); });
    if (egoId) {
      const keep = new Set([egoId]);
      filtered.forEach((s) => { if (s.a === egoId) keep.add(s.b); if (s.b === egoId) keep.add(s.a); });
      ids = new Set([...ids].filter((id) => keep.has(id)));
    }
    return ids;
  }, [filtered, egoId, entitySet, states]);
  const edges = filtered.filter((s) => visible.has(s.a) && visible.has(s.b));
  const cam = useMemo(() => {
    const pts = ENTITIES.filter((e) => visible.has(e.id));
    if (!pts.length) return { k: 1, tx: 0, ty: 0 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const [x0, x1] = [Math.min(...xs) - 75, Math.max(...xs) + 75];
    const [y0, y1] = [Math.min(...ys) - 58, Math.max(...ys) + 58];
    const k = Math.min(W / (x1 - x0), H / (y1 - y0), 1.8);
    return { k, tx: W / 2 - k * (x0 + x1) / 2, ty: H / 2 - k * (y0 + y1) / 2 };
  }, [visible]);
  const sel = selNode && visible.has(selNode) ? ent(selNode) : null;
  const selStates = sel ? edges.filter((s) => s.a === sel.id || s.b === sel.id) : [];
  return (
    <Card style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: "#FCFBF7" }} onClick={() => setSelNode(null)}>
        <g style={{ transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})`, transition: "transform .55s cubic-bezier(.4,0,.2,1)" }}>
          {edges.map((s, i) => {
            const A = ent(s.a), B = ent(s.b), cat = relTypes[s.type]?.cat || "neutral";
            return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={VALENCE[cat].color} strokeWidth={cat === "hostile" ? 2.2 : cat === "ambient" ? 1 : 1.5} opacity={cat === "ambient" ? 0.4 : 0.8} strokeDasharray={s.type === "concealed" ? "4 4" : "none"} />;
          })}
          {ENTITIES.filter((e) => visible.has(e.id)).map((e) => {
            const deg = edges.filter((s) => s.a === e.id || s.b === e.id).length;
            const r = 8 + Math.min(deg * 2.2, 12);
            const isSel = selNode === e.id;
            const orphan = deg === 0;
            return (
              <g key={e.id} style={{ cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); setSelNode(e.id); }} onDoubleClick={(ev) => { ev.stopPropagation(); setEgoId(egoId === e.id ? null : e.id); setSelNode(null); }}>
                <circle cx={e.x} cy={e.y} r={r} fill={isSel ? T.quillBg : orphan ? "#FFF" : "#EDEAE0"} stroke={isSel ? T.quill : orphan ? T.amber : T.lineStrong} strokeWidth={isSel ? 2.5 : 1.4} strokeDasharray={orphan ? "3 3" : "none"} />
                <text x={e.x} y={e.y + r + 14} fontSize={cam.k < 0.9 ? 12.5 : 11} textAnchor="middle" fill={isSel ? T.quill : T.sub} fontWeight={isSel || deg >= 3 ? 600 : 450} fontFamily={T.sans}>
                  {cam.k < 0.9 && deg < 3 && !isSel ? "" : e.title.startsWith("The ") ? e.title.split(" ").slice(0, 2).join(" ") : e.title.split(" ")[0]}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div style={{ position: "absolute", top: 10, left: 12, fontSize: 10.5, color: T.muted, background: "rgba(252,251,247,.92)", padding: "4px 9px", borderRadius: 6, border: `1px solid ${T.line}` }}>
        click to peek · double-click for ego view · the camera frames every change for you
      </div>
      {sel && (
        <div className="pop" style={{ position: "absolute", top: 14, right: 14, width: 240, background: T.surface, border: `1px solid ${T.lineStrong}`, borderRadius: 13, padding: "13px 15px", boxShadow: T.pop }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
            <span style={{ fontFamily: T.serif, fontWeight: 600, fontSize: 15.5, flex: 1 }}>{sel.title}</span>
            <span onClick={() => setSelNode(null)} style={{ color: T.muted, cursor: "pointer", fontSize: 13 }}>✕</span>
          </div>
          <div style={{ fontSize: 12, color: T.sub, display: "flex", flexDirection: "column", gap: 5, marginBottom: 11 }}>
            {selStates.slice(0, 4).map((s, i) => {
              const other = s.a === sel.id ? s.b : s.a;
              const cat = relTypes[s.type]?.cat || "neutral";
              return <div key={i}><span style={{ color: VALENCE[cat].color, fontWeight: 650 }}>{relTypes[s.type]?.label}</span> · {ent(other).title.split(" ")[0]} <span style={{ color: T.faint }}>ch. {s.ch}</span></div>;
            })}
            {selStates.length === 0 && <div style={{ color: T.amber }}>orphaned at this point in the story</div>}
            {selStates.length > 4 && <div style={{ color: T.faint }}>+ {selStates.length - 4} more</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn small onClick={() => goEntity(sel.id)} style={{ flex: 1 }}>Document</Btn>
            <Btn small onClick={() => goEntity(sel.id, "thread")} style={{ flex: 1 }}>Thread</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ————————————————————————————————— Settings: the dictionary */
function Settings({ ctx }) {
  const { relTypes, setRelTypes, states } = ctx;
  return (
    <div className="fi">
      <h2 style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 24, margin: "0 0 3px" }}>Settings</h2>
      <p style={{ fontSize: 12.5, color: T.sub, margin: "0 0 20px", maxWidth: 620 }}>The relationship dictionary. Every label is yours — starter types are seed data, not system data. Valence drives color everywhere; ambient types are excluded from dormant-thread detection.</p>
      <Label>Relationship types · {Object.keys(relTypes).length}</Label>
      <Card style={{ maxWidth: 680 }}>
        {Object.entries(relTypes).map(([id, v], i, arr) => {
          const uses = states.filter((s) => s.type === id).length;
          return (
            <Row key={id} last={i === arr.length - 1}>
              <input value={v.label} onChange={(e) => setRelTypes({ ...relTypes, [id]: { ...v, label: e.target.value } })} style={{ fontFamily: T.serif, fontSize: 14.5, fontWeight: 500, border: "none", background: "transparent", width: 170, color: T.ink }} />
              <span style={{ display: "flex", gap: 5 }}>
                {Object.keys(VALENCE).map((cat) => (
                  <span key={cat} onClick={() => setRelTypes({ ...relTypes, [id]: { ...v, cat } })} title={cat} style={{ width: 15, height: 15, borderRadius: "50%", background: VALENCE[cat].color, cursor: "pointer", opacity: v.cat === cat ? 1 : 0.22, border: v.cat === cat ? "2px solid #fff" : "2px solid transparent", boxShadow: v.cat === cat ? `0 0 0 1.5px ${VALENCE[cat].color}` : "none" }} />
                ))}
              </span>
              <Chip style={{ padding: "3px 9px", fontSize: 10.5 }}>{VALENCE[v.cat].label}</Chip>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: uses ? T.sub : T.faint }}>{uses ? `${uses} state${uses > 1 ? "s" : ""}` : "unused"}</span>
              <span onClick={() => { if (!uses) { const n = { ...relTypes }; delete n[id]; setRelTypes(n); } }} title={uses ? "In use — merge before deleting" : "Delete"} style={{ color: uses ? T.faint : T.wax, cursor: uses ? "not-allowed" : "pointer", fontSize: 12 }}>✕</span>
            </Row>
          );
        })}
      </Card>
      <p style={{ fontSize: 11.5, color: T.muted, margin: "10px 2px 0", maxWidth: 640 }}>Rename inline. Click a dot to change valence — the graph, threads, and stream recolor instantly. Types in use can't be deleted here; they'd need merge-with-reassignment (v1, not in this prototype). New types are minted where you write, not here.</p>
    </div>
  );
}

/* ————————————————————————————————— Search */
function SearchResults({ ctx, query, onGraph }) {
  const { states, relTypes, chapters, mentions, goEntity, goChapter } = ctx;
  const q = query.toLowerCase();
  const eHits = ENTITIES.filter((e) => (e.title + " " + e.aliases.join(" ") + " " + e.body).toLowerCase().includes(q));
  const cHits = chapters.filter((c) => (c.title + " " + c.body).toLowerCase().includes(q));
  const sHits = states.filter((s) => s.note.toLowerCase().includes(q));
  const graphSet = [...new Set([...eHits.map((e) => e.id), ...sHits.flatMap((s) => [s.a, s.b])])];
  const total = eHits.length + cHits.length + sHits.length;
  return (
    <div className="fi">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T.sub }}>{total} result{total !== 1 ? "s" : ""} for <span style={{ fontFamily: T.serif, fontStyle: "italic", color: T.ink }}>"{query}"</span></span>
        <span style={{ flex: 1 }} />
        {graphSet.length > 1 && <Btn primary small onClick={() => onGraph(graphSet)}>✳ Show {graphSet.length} entities in graph</Btn>}
      </div>
      {eHits.length > 0 && (<><Label>Entities · {eHits.length}</Label>
        <Card style={{ marginBottom: 16 }}>{eHits.map((e, i) => (
          <Row key={e.id} last={i === eHits.length - 1} onClick={() => goEntity(e.id)}>
            <span style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 14.5 }}>{e.title}</span><Chip>{e.type}</Chip>
            <span style={{ flex: 1, fontSize: 11.5, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.body.slice(0, 76)}…</span><span style={{ color: T.faint }}>→</span>
          </Row>))}</Card></>)}
      {cHits.length > 0 && (<><Label>Chapters · {cHits.length}</Label>
        <Card style={{ marginBottom: 16 }}>{cHits.map((c, i) => (
          <Row key={c.id} last={i === cHits.length - 1} onClick={() => goChapter(c.num)}>
            <span style={{ fontWeight: 550 }}>Ch. {c.num} — {c.title}</span>
            <span style={{ flex: 1, fontSize: 11.5, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: T.serif, fontStyle: "italic" }}>{c.body.slice(0, 80)}…</span>
            {mentions.some((m) => m.ch === c.num) && <Chip warn>unlinked mention</Chip>}
            <span style={{ color: T.faint }}>→</span>
          </Row>))}</Card></>)}
      {sHits.length > 0 && (<><Label>State notes · {sHits.length} <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 450 }}>— the result category no other tool can return</span></Label>
        <Card>{sHits.map((s, i) => (
          <Row key={i} last={i === sHits.length - 1} onClick={() => goChapter(s.ch)}>
            <Dot cat={relTypes[s.type]?.cat || "neutral"} r={6} />
            <span style={{ fontWeight: 550, fontSize: 12.5 }}>{ent(s.a).title.split(" ")[0]} · {relTypes[s.type]?.label} · {ent(s.b).title.split(" ")[0]}</span>
            <span style={{ fontSize: 11, color: T.muted }}>ch. {s.ch}</span>
            <span style={{ flex: 1, fontSize: 11.5, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: T.serif, fontStyle: "italic" }}>{s.note}</span><span style={{ color: T.faint }}>→</span>
          </Row>))}</Card></>)}
      {total === 0 && <p style={{ fontSize: 13, color: T.muted }}>Nothing matches. Search covers entity docs, aliases, chapter prose, and state notes — narrowing a lens is a different verb and lives with the lens.</p>}
    </div>
  );
}

/* ————————————————————————————————— ⌘K palette */
function Palette({ ctx, close }) {
  const { chapters, goEntity, goChapter } = ctx;
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  const eHits = q ? ENTITIES.filter((e) => (e.title + " " + e.aliases.join(" ")).toLowerCase().includes(q.toLowerCase())) : ENTITIES.slice(0, 5);
  const cHits = q ? chapters.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())).slice(0, 3) : [];
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(31,29,24,.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120, zIndex: 60 }}>
      <div className="pop" onClick={(e) => e.stopPropagation()} style={{ width: 460, background: T.surface, borderRadius: 15, border: `1px solid ${T.lineStrong}`, boxShadow: T.pop, overflow: "hidden" }}>
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to anything by name — or create it" style={{ width: "100%", fontSize: 14, padding: "14px 18px", border: "none", borderBottom: `1px solid ${T.line}`, background: "transparent", color: T.ink }} />
        <div style={{ maxHeight: 270, overflowY: "auto" }}>
          {eHits.map((e) => (
            <Row key={e.id} onClick={() => { close(); goEntity(e.id); }}>
              <span style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 14 }}>{e.title}</span><Chip>{e.type}</Chip>
              {e.aliases.length > 0 && <span style={{ fontSize: 11.5, color: T.muted, fontFamily: T.serif, fontStyle: "italic" }}>"{e.aliases[0]}"</span>}
            </Row>
          ))}
          {cHits.map((c) => <Row key={c.id} onClick={() => { close(); goChapter(c.num); }}><span style={{ fontWeight: 550, fontSize: 13 }}>Ch. {c.num} — {c.title}</span><Chip>Chapter</Chip></Row>)}
          {q.length > 1 && <Row last onClick={close}><span style={{ color: T.quill, fontWeight: 650, fontSize: 13 }}>+ Create "{q}"</span><span style={{ fontSize: 11.5, color: T.muted }}>one line, no form</span></Row>}
        </div>
        <div style={{ padding: "9px 18px", borderTop: `1px solid ${T.line}`, fontSize: 11, color: T.muted, display: "flex", gap: 16, background: T.inset }}>
          <span>↵ open</span><span>esc dismiss</span><span>matches names and aliases — content search lives in the top bar</span>
        </div>
      </div>
    </div>
  );
}
