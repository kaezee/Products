// Surface likely characters/places from raw prose, so importing a manuscript
// half-builds the world instead of dropping the writer into an empty Collection.
//
// Heuristic (deliberately biased to over-detect — the writer prunes a checklist,
// which is cheaper than missing their protagonist): recurring Title-Case proper
// nouns, merged into multi-word names, with a leading honorific stripped and the
// common capitalised-at-a-sentence-start words filtered out. Pure and DOM-free,
// so it runs in the browser and in a plain Node test.

export interface DetectedName {
  name: string;
  count: number;
}

// Words that are routinely capitalised at the start of a sentence (or are proper
// by accident of grammar) but are almost never a character or place.
const STOP = new Set([
  // articles / conjunctions / prepositions / common openers
  "the", "a", "an", "and", "but", "or", "so", "yet", "nor", "for", "if", "as", "at", "in", "on",
  "of", "to", "by", "with", "from", "then", "than", "that", "this", "these", "those", "there", "here",
  "now", "once", "after", "before", "because", "though", "although", "while", "when", "where", "what",
  "who", "whom", "whose", "why", "how", "still", "yes", "no", "not", "perhaps", "maybe", "indeed",
  "however", "meanwhile", "suddenly", "finally", "instead", "again", "soon", "later", "never", "always",
  "every", "each", "some", "any", "all", "one", "two", "three", "many", "much", "more", "most", "such",
  // pronouns
  "i", "he", "she", "it", "we", "you", "they", "his", "her", "hers", "him", "its", "their", "them",
  "our", "ours", "my", "mine", "your", "yours",
  // dialogue verbs that follow a quote and get capitalised oddly — rare, cheap to guard
  "said", "asked", "replied", "cried", "shouted",
  // days / months
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
]);

// Leading titles to drop so "Dr John Watson" → "John Watson", "Mrs Hudson" → "Hudson".
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "professor", "inspector", "sir",
  "lord", "lady", "detective", "sergeant", "sgt", "captain", "capt", "colonel", "major", "rev",
  "reverend", "madame", "madam", "count", "countess", "king", "queen", "st", "saint", "aunt", "uncle"]);

// A single Title-Case word: starts uppercase, has at least one lowercase letter
// (so ALL-CAPS acronyms and single initials are excluded).
const TITLE = /^[A-Z][A-Za-z'’.-]*[a-z][A-Za-z'’.-]*$/;

interface Tok { word: string; initial: boolean; breakAfter: boolean }

// Split into words while tracking whether each starts a sentence (previous
// meaningful char was . ! ? or a paragraph break) and whether the word carried
// trailing punctuation — a comma, dash, quote, etc. A name run must stop there,
// otherwise "Baker Street, Watson" wrongly merges into one three-word name and
// swallows Watson.
function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const parts = text.replace(/\r/g, "").split(/\n/);
  for (const line of parts) {
    let sentenceStart = true;
    const words = line.split(/\s+/);
    for (const raw of words) {
      const word = raw.replace(/^[^A-Za-z0-9'’]+|[^A-Za-z0-9'’]+$/g, ""); // strip surrounding punctuation
      if (!word) { if (/[.!?]/.test(raw)) sentenceStart = true; continue; }
      // Trailing punctuation (anything after the word's letters) ends a name run.
      // A trailing period is treated as a boundary only when it also ends the
      // sentence — "St." / initials keep the run going otherwise.
      const trailer = raw.slice(raw.lastIndexOf(word[word.length - 1]) + 1);
      const breakAfter = /[,;:—–)"'”’(]/.test(trailer) || /[.!?]["'”’)]*$/.test(raw);
      out.push({ word, initial: sentenceStart, breakAfter });
      sentenceStart = /[.!?]["'”’)]*$/.test(raw); // this token ended a sentence
    }
  }
  return out;
}

function stripPossessive(s: string): string {
  return s.replace(/['’]s$/, "");
}

export function detectEntities(text: string, opts?: { min?: number; limit?: number }): DetectedName[] {
  const min = opts?.min ?? 2;
  const limit = opts?.limit ?? 40;
  const toks = tokenize(text);

  // Build maximal runs of Title-Case tokens; record the run and whether its
  // first token was sentence-initial.
  const agg = new Map<string, { count: number; nonInitial: number; multi: number }>();
  let i = 0;
  while (i < toks.length) {
    if (!TITLE.test(toks[i].word)) { i++; continue; }
    const initial = toks[i].initial;
    const run: string[] = [];
    while (i < toks.length && TITLE.test(toks[i].word)) {
      run.push(stripPossessive(toks[i].word));
      const broke = toks[i].breakAfter;
      i++;
      if (broke) break; // punctuation after this word ends the name
    }
    // Drop a leading honorific ("Dr", "Mrs") or a Title-Case sentence-opener
    // ("At", "The", "Later") that got absorbed into the run — otherwise
    // "At Scotland Yard" splits off from "Scotland Yard".
    while (run.length > 1) {
      const head = run[0].toLowerCase().replace(/\.$/, "");
      if (HONORIFICS.has(head) || STOP.has(head)) run.shift();
      else break;
    }
    if (run.length === 0) continue;
    const name = run.join(" ");
    const key = name.toLowerCase();
    // single-word stopwords never qualify; a lone honorific isn't a name
    if (run.length === 1 && (STOP.has(key) || HONORIFICS.has(key.replace(/\.$/, "")))) continue;
    const e = agg.get(key) ?? { count: 0, nonInitial: 0, multi: 0 };
    e.count++;
    if (!initial) e.nonInitial++;
    if (run.length > 1) e.multi++;
    // keep the most common surface form (first seen wins as display)
    if (!agg.has(key)) (e as any).display = name;
    agg.set(key, e);
  }

  const out: DetectedName[] = [];
  for (const [, e] of agg) {
    // Qualify: appears mid-sentence at least once (strong proper-noun signal),
    // or is multi-word (almost always a proper noun). Filter by frequency.
    if (e.count < min) continue;
    if (e.nonInitial === 0 && e.multi === 0) continue;
    out.push({ name: (e as any).display as string, count: e.count });
  }
  out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}
