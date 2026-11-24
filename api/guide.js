// Word & Grammar Guide (Learn...Wow!) — server function (Vercel)
// Three tools in one: The Word Shop, Grammar Games, Wordplay Central.
// One endpoint. Actions:
//   report   — a full write-up for one section (or an open "Ask Mr. Paul" question)
//   round    — a guessing round
//   followup — answer a follow-up question about the last result
// Family-friendly, accurate, original wording (never copied from a dictionary or style guide).

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.WG_MODEL || 'claude-sonnet-5-5';
const DAILY_LIMIT = parseInt(process.env.WG_DAILY_LIMIT || '150', 10); // API calls per visitor per day
const ALLOWED = (process.env.WG_ALLOWED_HOSTS ||
  'nusparklearnwow.com,nusparkpublishing.com,nusparkmarketing.com,vercel.app,localhost,127.0.0.1')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// ---------- Tools ----------
const TOOL_INTRO = {
  shop: 'You are Mr. Paul, the friendly shopkeeper of "The Word Shop," where visitors discover the stories, meanings and surprises behind everyday words.',
  grammar: 'You are Mr. Paul, the friendly host of "Grammar Games," where visitors learn what is correct, what is common, and what does not really matter. You are encouraging, never scolding. You always show both "technically correct" and "what most people actually say."',
  play: 'You are Mr. Paul, the playful host of "Wordplay Central," full of words that make you think twice: double meanings, brain-trap sentences, misheard phrases and twist endings. This is thinking wordplay, not cheap puns.'
};

const BASE = [
  'This is part of the "Word & Grammar Guide," a learning experience from Learn...Wow! at NuSparkLearnWow.com.',
  'Audience: curious adults first, plus families with kids. Warm, clear, a little playful. Plain English, never stuffy.',
  'RULES:',
  '- Accuracy first. If you are not sure of a fact, date, rule or origin, say so plainly instead of guessing.',
  '- Write everything in your own words. Never copy wording from a dictionary or style guide.',
  '- Family-friendly always. No crude, sexual or hateful content. If someone asks about a crude word or phrase, give a short, polite note that it is not family-friendly and offer something cleaner.',
  '- Examples should be national and everyday (not tied to one city or local team). No real living private people.',
  '- Be generous with detail: these are "double-length" write-ups, so each paragraph should be full and interesting, not a one-liner.',
  '- If the request is unclear (a word with very different meanings, a misspelling, a phrase you cannot identify), put ONE short clarifying question in "clarify" and still give your best answer for the most likely meaning.',
  '- Grammar honesty: many famous "rules" are myths or old style preferences. Say so when that is true. Where major style guides differ, say that it depends.'
].join('\n');

const BADGES = {
  origin: { list: ['Proven', 'Likely', 'Legend'], rule: 'badge: how solid the origin story is. "Proven" = documented by language historians. "Likely" = the best-supported explanation. "Legend" = a popular story that is not supported (say what is actually known instead).' },
  verdict: { list: ['Correct', 'Both Work', 'Depends', 'Myth'], rule: 'badge: the answer label. "Correct" = a real rule or a word pair with set meanings. "Both Work" = both are fine. "Depends" = formal vs. casual, a style choice, or the meaning changes. "Myth" = a rule people believe that is not really one.' },
  none: { list: [], rule: 'badge: empty string.' }
};

const REPORT_SHAPE = '{"clarify":"one short clarifying question, or empty string","title":"the word, phrase or topic","tag":"short line under the title","badge":"see badge rule","sections":[{"h":"heading","p":"one or two full paragraphs (separate paragraphs with \\n\\n)","items":["optional list items"]}],"wow":"one Wow...Who Knew? fact, 1-2 sentences"}';

const REPORTS = {
  // ----- The Word Shop -----
  'shop-ask': { tool: 'shop', badge: 'origin', need: 'question', brief: 'OPEN WORD QUESTION. The visitor asked their own question about words, meanings, spelling, pronunciation, origins, idioms or slang. Answer fully. Choose 3-5 sections with fitting headings, starting with "Short Answer". If it is not about language, answer briefly and kindly, then steer back to words with a related word fact. title: a short version of their question. Use the badge only if the question is about an origin, otherwise empty.' },
  lookup: { tool: 'shop', badge: 'none', need: 'word', brief: 'WORD LOOKUP. Sections in order: "What It Means" (plain-English meaning; cover the main meanings if several), "Used in a Sentence" (items: exactly 3 sentences labeled "Casual: ...", "Professional: ...", "Fun: ..."), "Word Family" (items: its other forms, each with a tiny example), "Stronger and Fancier Words" (items: a ladder of 4-6 similar words from everyday to formal, each with a 2-4 word note), "Opposites" (items: 2-4), "Watch Out For" (a common mix-up, misspelling or misuse, or a usage tip). tag: part of speech and simple pronunciation like ser-en-DIP-ih-tee.' },
  makeover: { tool: 'shop', badge: 'none', need: 'sentence', brief: 'WORD MAKEOVER. Rewrite the visitor\'s sentence in the requested direction, keeping the meaning. Sections in order: "Your Makeover" (the rewritten sentence, then an even bolder bonus version), "What Changed" (items: "old → new: why it works"), "Why It Lands Differently" (how the new vocabulary changes the feeling, tone or picture), "Try These Too" (items: 3 more versions in the other directions — exciting, professional, descriptive, funny — skipping the chosen one, each labeled). title: "Word Makeover". tag: the direction chosen.' },
  origins: { tool: 'shop', badge: 'origin', need: 'word', brief: 'WORD ORIGINS, told as a short lively story. Sections in order: "The Story", "The Journey" (items: 3-6 stops, e.g. "Latin: ... → Old French: ... → English, 1300s"), "Then and Now" (how its meaning shifted, if it did), "Word Cousins" (items: 3-5 related words from the same root).' },
  thennow: { tool: 'shop', badge: 'origin', need: 'word', brief: 'THEN vs. NOW: a word whose meaning changed. Sections in order: "What It Meant Then" (with roughly when), "What It Means Now", "How It Changed", "Then in a Sentence vs. Now in a Sentence" (items: "Then: ..." and "Now: ..."). If it has not really changed, say so kindly and suggest 3 words that did.' },
  idiom: { tool: 'shop', badge: 'origin', need: 'phrase', brief: 'IDIOMS EXPLAINED. Sections in order: "What It Means", "Where It Came From" (if the popular story is a legend, say so and give what is actually known), "Use It Like This" (items: everyday, at work, and a fun example), "Similar Sayings" (items: 3-5 with short meanings).' },
  slanglookup: { tool: 'shop', badge: 'none', need: 'phrase', brief: 'SLANG THROUGH THE DECADES lookup. Sections in order: "What It Meant" (meaning and the decade), "Who Said It" (the crowd, music, movies or TV that made it popular, in general terms), "In a Sentence" (items: 2 examples as people said it back then), "Does Anyone Still Say It?" (status today and any modern replacement). tag: the decade.' },
  decoder: { tool: 'shop', badge: 'none', need: 'phrase', brief: 'TODAY\'S SLANG DECODER for a parent or grandparent. Sections in order: "In Plain English", "How They Use It" (items: 2-3 examples the way young people say them, each followed by a plain-English translation in parentheses), "Where It Came From" (origin if known; describe communities respectfully), "Should You Use It?" (a friendly honest take). Slang changes fast: if the term is newer than you know well or could mean different things, say so. tag: e.g. "Slang, 2020s".' },
  opposite: { tool: 'shop', badge: 'none', need: 'word', brief: 'WORDS THAT MEAN THEIR OWN OPPOSITE (contronyms). Sections in order: "Meaning One", "Meaning Two (the Opposite)", "Both in a Sentence" (items: one sentence for each meaning), "How It Ended Up This Way". If the word does not really have opposite meanings, say so kindly and name 3 words that do.' },

  // ----- Grammar Games -----
  'grammar-ask': { tool: 'grammar', badge: 'verdict', need: 'question', brief: 'OPEN GRAMMAR QUESTION about grammar, usage, punctuation, spelling or style. Answer fully. Choose 3-5 sections with fitting headings, starting with "Short Answer", and include "Technically Correct vs. What Most People Say" when it applies, plus a "Memory Trick" when one helps. title: a short version of their question.' },
  g_which: { tool: 'grammar', badge: 'verdict', need: 'pair of words or two sentences', brief: 'WHICH IS RIGHT? The visitor typed a pair of words people mix up (or two sentences). Sections in order: "The Answer", "How Each One Works" (items: each word with its job and an example), "Technically Correct vs. What Most People Say", "Memory Trick".' },
  g_phrase: { tool: 'grammar', badge: 'verdict', need: 'phrase', brief: 'PHRASES PEOPLE GET WRONG. Sections in order: "The Right Way to Say It", "Why People Get It Wrong", "Technically Correct vs. What Most People Say", "Use It Right" (items: 2-3 example sentences).' },
  g_rule: { tool: 'grammar', badge: 'verdict', need: 'rule', brief: 'RULE OR MYTH? The visitor typed a grammar "rule" they were taught. Sections in order: "The Verdict" (Real Rule, Myth, or Depends, in plain words), "Where the Rule Came From", "What Good Writers Actually Do" (with examples), "When to Follow It Anyway" (formal settings, tests, picky readers).' },
  g_punct: { tool: 'grammar', badge: 'verdict', need: 'punctuation question', brief: 'PUNCTUATION CHECK. Answer the visitor\'s punctuation question. Sections in order: "The Short Answer", "How It Works" (items: the rule with examples), "Where Style Guides Disagree" (if they do), "Common Slip-Ups".' },
  g_formal: { tool: 'grammar', badge: 'none', need: 'sentence', brief: 'FORMAL vs. CASUAL. Rewrite the visitor\'s sentence. Sections in order: "To a Friend (Casual)", "In a Job Email (Formal)", "Somewhere in Between", "What Changed and Why" (items: the specific word and tone swaps). title: "Formal vs. Casual".' },
  g_better: { tool: 'grammar', badge: 'none', need: 'sentence, paragraph or email', brief: 'SAY IT BETTER. Improve the visitor\'s writing: fix errors, cut repetition, make it clear and natural, keep their meaning and voice. Sections in order: "Your Improved Version" (the full rewritten text), "What I Fixed" (items: each change as "before → after: why"), "Grammar Notes" (any real errors explained kindly; if there were none, say so), "One Tip for Next Time". title: "Say It Better".' },
  g_tricks: { tool: 'grammar', badge: 'verdict', need: 'tricky pair or rule', brief: 'MEMORY TRICKS. Give easy ways to remember the tricky one. Sections in order: "The Quick Difference", "Memory Tricks" (items: 2-4 tricks, like rhymes, letter clues or picture hooks), "Test Yourself" (items: 3 fill-in-the-blank sentences, with answers in parentheses at the end of each), "Why It Is Confusing".' },

  // ----- Wordplay Central -----
  'play-ask': { tool: 'play', badge: 'none', need: 'question', brief: 'OPEN WORDPLAY QUESTION about double meanings, ambiguous sentences, misheard phrases, homographs, twist endings or any word puzzle. Answer fully. Choose 3-5 sections with fitting headings, starting with "Short Answer". title: a short version of their question.' },
  p_double: { tool: 'play', badge: 'none', need: 'sentence', brief: 'READ IT TWICE checker. The visitor typed a sentence. Sections in order: "Reading One", "Reading Two" (if there is only one sensible reading, say so and show how a small change would create a second one), "Why It Happens" (the word or structure that causes it), "Fix It" (items: 2 rewrites that make each meaning clear).' },
  p_samespell: { tool: 'play', badge: 'none', need: 'word', brief: 'SAME SPELLING, DIFFERENT WORD (homographs). Sections in order: "Word One" (pronunciation and meaning), "Word Two" (pronunciation and meaning), "Both in One Sentence" (items: 2 sentences using both versions), "Why English Does This". If the word has no homograph, say so and suggest 3 that do.' },
  p_mixup: { tool: 'play', badge: 'origin', need: 'phrase', brief: 'THE GREAT WORD MIX-UP. The visitor typed a phrase they have heard (possibly misheard). Sections in order: "The Real Phrase", "What People Say Instead" (the mix-up and why it sounds right), "Where the Real Phrase Came From", "More Famous Mix-Ups" (items: 3-4, each "mix-up → real phrase"). Mention whether it is an eggcorn or a malapropism, and explain the term simply.' },
  p_twist: { tool: 'play', badge: 'none', need: 'sentence', brief: 'MAKE YOUR OWN TWIST. The visitor wrote a sentence meant to have a double meaning or twist. Sections in order: "Your Make-You-Think Score" (a score out of 10 with a warm, honest reason), "The Two Readings" (what each meaning is; if only one works, say so kindly), "Sharpen It" (items: 2 improved versions), "A Twist From Mr. Paul" (one original double-meaning sentence of your own on the same topic). title: "Make Your Own Twist". tag: "Make-you-think score: N/10".' }
};

// Special rounds (The Word Shop)
const SPECIAL_ROUNDS = {
  thennow: 'Create ONE "Then vs. Now" guessing round: an English word whose meaning changed a lot over time (the kind like nice, awful, silly, girl, meat, clue, nervous, bully, naughty, egregious; family-friendly only). The visitor sees the word and three possible OLD meanings. Shape: {"word":"...","question":"What did this word once mean?","options":["three plausible old meanings, similar length; one true"],"answer":0,"then":"the real older meaning and roughly when","now":"the modern meaning","story":"2-3 sentences on how the meaning drifted","badge":"Proven or Likely"}. answer = index of the true option.',
  slang: 'Create ONE "Slang Through the Decades" guessing round: a real, family-friendly American slang term clearly tied to one decade. Shape: {"term":"...","decade":"one of 1950s, 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s","options":["three possible meanings, similar length; one true"],"answer":0,"explain":"2-3 sentences: what it meant, who said it, whether anyone still says it","example":"one sentence using it the way people did back then"}. answer = index of the true meaning.',
  opposite: 'Create ONE "Words That Mean Their Own Opposite" round (contronyms), family-friendly (the kind like sanction, dust, cleave, left, oversight, seed, screen, fast, bolt, weather, clip, trim, bound, overlook, rent). Shape: {"word":"...","a":"meaning A, short","b":"meaning B (the opposite), short","sentence":"one sentence that clearly uses ONE of the meanings","answer":"a or b","explain":"2-3 sentences on why the word has opposite meanings","exampleA":"a sentence using meaning A","exampleB":"a sentence using meaning B"}.'
};

// Multiple-choice rounds (Grammar Games + Wordplay Central)
const MC_SHAPE = '{"prompt":"the text shown big to the visitor","question":"the question","options":["choices"],"answer":0,"label":"see label rule","explain":"2-4 sentences explaining the answer","extra":"see extra rule"}';
const MC_ROUNDS = {
  g_which: { tool: 'grammar', labels: 'verdict', brief: 'WHICH IS RIGHT? round about a commonly swapped word pair (who/whom, good/well, affect/effect, lay/lie, fewer/less, further/farther, then/than, its/it\'s, your/you\'re, there/their/they\'re, accept/except, compliment/complement, imply/infer, principal/principle, loose/lose, and similar). prompt: a short scenario line. question: "Which sentence is right?". options: 2 or 3 sentences that differ only in the swapped word (if both genuinely work, include a "Both are fine" option and make it the answer). label: Correct, Both Work, or Depends. extra: a one-line memory trick.' },
  g_phrase: { tool: 'grammar', labels: 'verdict', brief: 'PHRASES PEOPLE GET WRONG round (could care less, between you and I, irregardless, me and him went, try and vs try to, literally, each other vs one another, and similar; do not use eggcorns like "for all intensive purposes," which belong to Wordplay Central). prompt: a sentence with a blank shown as ____. question: "Which phrase belongs in the blank?". options: 2-3 versions of the phrase. label: Correct, Both Work, or Depends. extra: what most people actually say vs. what is technically correct, one line.' },
  g_rule: { tool: 'grammar', labels: 'verdict', brief: 'RULE OR MYTH? round. prompt: a grammar "rule" people are taught, in quotes (mix real rules and myths across rounds: never end a sentence with a preposition, never split an infinitive, never start a sentence with and/but, none always takes a singular verb, never use they for one person, a sentence needs a subject and verb, use an apostrophe for possession, i before e except after c, and similar). question: "Real rule, myth, or does it depend?". options must be exactly ["Real Rule","Myth","Depends"]. label: Correct (for a real rule), Myth, or Depends, matching the answer. extra: one example sentence that shows the truth.' },
  g_punct: { tool: 'grammar', labels: 'verdict', brief: 'PUNCTUATION CHECK round (Oxford comma, apostrophes in plurals and possessives, its/it\'s, commas with introductory phrases, semicolons, quotation marks with periods in American English, one space or two after a period, hyphens in compound adjectives, and similar). prompt: a short scenario line. question: "Which one is punctuated correctly?" (or a direct question like "One space or two after a period?"). options: 2-3. label: Correct, Both Work, or Depends. extra: the rule in one line.' },
  g_spot: { tool: 'grammar', labels: 'verdict', brief: 'SPOT THE MISTAKE round. prompt: a short, natural paragraph (3-4 sentences, everyday topic) containing exactly ONE real grammar, word-choice or punctuation error. question: "Which part has the mistake?". options: 4 short quoted snippets copied exactly from the paragraph (one contains the error). label: Correct. extra: the corrected snippet, written as "Fix: ...".' },
  p_double: { tool: 'play', labels: 'none', brief: 'READ IT TWICE round. prompt: a genuinely ambiguous sentence (the kind like "I saw the man with the telescope" or "Visiting relatives can be boring"), original and family-friendly. question: "This sentence can be read two ways. Which reading is NOT possible?". options: 3 readings, two genuinely possible and one that is not. answer = the impossible one. extra: the two real readings, written as "Reading 1: ... Reading 2: ...".' },
  p_headline: { tool: 'play', labels: 'none', brief: 'HEADLINE TROUBLE round. prompt: an original newspaper-style headline with an accidental funny second meaning (the kind like "Kids Make Nutritious Snacks" or "Squad Helps Dog Bite Victim"), family-friendly. question: "What did the writer actually mean?". options: 3 (the intended meaning, the funny accidental meaning, and one other plausible misreading). answer = the intended meaning. extra: a rewrite that fixes the headline, written as "Better headline: ...".' },
  p_comma: { tool: 'play', labels: 'none', brief: 'COMMA RESCUE round, about how commas change MEANING. prompt: a goal like "The writer wants to invite Grandma to dinner." question: "Which version says that?". options: 3 versions of a sentence that differ only in comma placement (the kind like "Let\'s eat, Grandma." vs "Let\'s eat Grandma."). answer = the version matching the goal. extra: what each wrong version accidentally says, one line.' },
  p_trap: { tool: 'play', labels: 'none', brief: 'BRAIN TRAP SENTENCE round (garden-path sentences, the kind like "The old man the boat" or "The complex houses married and single soldiers"), original or classic, family-friendly. prompt: the sentence. question: "What does this sentence actually mean?". options: 3. extra: which word tricks your brain and how, one line.' },
  p_twist: { tool: 'play', labels: 'none', brief: 'TWIST ENDINGS round: a one-liner whose meaning flips at the last word or phrase (clever and family-friendly, the kind like "I asked the librarian if the library had books on paranoia. She whispered, \'They\'re right behind you.\'"). prompt: the setup of the line, ending with "...". question: "Which ending gives it the twist?". options: 3 endings (one real twist, two flat ones). extra: the full line, then why the meaning flips.' },
  p_samespell: { tool: 'play', labels: 'none', brief: 'SAME SPELLING, DIFFERENT WORD round (homographs: wound, lead, tear, bass, close, desert, minute, object, record, row, sow, wind, refuse, present, and similar). prompt: one sentence using the same spelling twice with two different meanings. question: a question about which meaning or pronunciation each one has. options: 3. extra: both pronunciations spelled out simply.' },
  p_mixup: { tool: 'play', labels: 'none', brief: 'THE GREAT WORD MIX-UP round (eggcorns and malapropisms, the kind like "for all intensive purposes," "doggy-dog world," "nip it in the butt," "on tender hooks," "escape goat"; avoid any about illness). prompt: the mixed-up phrase in quotes. question: "What is the real phrase?". options: 3. extra: why people mishear it, one line.' }
};

// ---------- Helpers ----------
function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }
function parseJSON(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('No JSON in reply');
  return JSON.parse(text.slice(s, e + 1));
}
async function callClaude(payload) {
  if (!API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ model: MODEL }, payload))
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'AI service error');
  return j;
}
async function claudeJSON(system, user, maxTokens) {
  const j = await callClaude({
    max_tokens: maxTokens + 6000,
    system: system + '\n\nIMPORTANT: Always answer by calling the respond tool. Do not reply with plain text.',
    tools: [{ name: 'respond', description: 'Return your answer as a JSON object in the exact shape described.', input_schema: { type: 'object', additionalProperties: true } }],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }]
  });
  const blocks = j.content || [];
  const tool = blocks.find(b => b.type === 'tool_use');
  if (tool && tool.input && typeof tool.input === 'object') return tool.input;
  return parseJSON(blocks.map(b => b.text || '').join(''));
}
async function claudeText(system, messages, maxTokens) {
  const j = await callClaude({ max_tokens: maxTokens + 6000, system, messages });
  return (j.content || []).map(c => c.text || '').join('').trim();
}
function hostAllowed(req) {
  const src = req.headers.origin || req.headers.referer || '';
  if (!src) return false;
  let host = '';
  try { host = new URL(src).hostname.toLowerCase(); } catch (e) { return false; }
  return ALLOWED.some(a => host === a || host.endsWith('.' + a));
}
async function underLimit(req) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return true; // no database connected = no per-visitor cap (Anthropic spend limit still applies)
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const key = 'wg:' + new Date().toISOString().slice(0, 10) + ':' + ip;
  try {
    const r = await fetch(url + '/pipeline', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 90000]])
    });
    const j = await r.json();
    const count = j && j[0] && j[0].result;
    return !(count > DAILY_LIMIT);
  } catch (e) { return true; }
}
function seenText(body, n) {
  return (Array.isArray(body.seen) ? body.seen : []).slice(-n).map(s => clip(s, 80));
}

// ---------- Actions ----------
async function report(body) {
  const def = REPORTS[body.section];
  if (!def) throw new Error('Unknown section');
  const input = clip(body.input, 2000).trim();
  const surprise = !input && body.surprise;
  if (!input && !surprise) throw new Error('Type something first');
  const seen = seenText(body, 25);
  let user;
  if (surprise) {
    user = 'Surprise the visitor: pick an interesting, family-friendly ' + def.need + ' that makes people say "Wow...Who Knew?" and write it up.' + (seen.length ? ' Do NOT use any of these (already shown): ' + seen.join(', ') + '.' : '');
  } else if (body.section === 'makeover') {
    const dir = ['exciting', 'professional', 'descriptive', 'funny'].includes(body.direction) ? body.direction : 'exciting';
    user = 'Direction: make it more ' + dir + '.\nVisitor\'s sentence: ' + input;
  } else {
    user = 'Visitor\'s ' + def.need + ':\n' + input;
  }
  const b = BADGES[def.badge];
  const system = TOOL_INTRO[def.tool] + '\n' + BASE + '\n\nTASK: ' + def.brief + '\n' + b.rule + '\n\nCall the respond tool with an object in this exact shape:\n' + REPORT_SHAPE;
  const d = await claudeJSON(system, user, 3000);
  const sections = (Array.isArray(d.sections) ? d.sections : []).slice(0, 8).map(s => ({
    h: clip(s && s.h, 120), p: clip(s && s.p, 3000),
    items: (Array.isArray(s && s.items) ? s.items : []).slice(0, 10).map(x => clip(x, 500))
  })).filter(s => s.h || s.p || s.items.length);
  return {
    clarify: clip(d.clarify, 300), title: clip(d.title, 140), tag: clip(d.tag, 160),
    badge: b.list.includes(d.badge) ? d.badge : '', sections, wow: clip(d.wow, 500)
  };
}

async function round(body) {
  const kind = String(body.kind || '');
  const seen = seenText(body, 30);
  const avoid = seen.length ? ' Do NOT reuse any of these (already played): ' + seen.join(' | ') + '.' : '';

  if (SPECIAL_ROUNDS[kind]) {
    let extra = '';
    if (kind === 'slang' && /^(19[5-9]0s|20[0-2]0s)$/.test(String(body.decade || ''))) extra = ' Use a term from the ' + body.decade + '.';
    const system = TOOL_INTRO.shop + '\n' + BASE + '\n\nTASK: ' + SPECIAL_ROUNDS[kind] + '\nCall the respond tool with that exact shape.';
    let d;
    for (let i = 0; i < 2; i++) {
      try {
        d = await claudeJSON(system, 'Make a new round.' + extra + avoid, 1200);
        if (kind === 'opposite' ? (d.word && d.sentence) : (Array.isArray(d.options) && d.options.length >= 2)) break;
      } catch (e) { if (i === 1) throw e; }
    }
    if (!d || (kind !== 'opposite' && !(Array.isArray(d.options) && d.options.length >= 2))) throw new Error('No round');
    const out = { kind };
    if (kind === 'thennow') {
      out.word = clip(d.word, 60); out.question = clip(d.question || 'What did this word once mean?', 160);
      out.options = d.options.slice(0, 3).map(o => clip(o, 200));
      out.answer = Math.max(0, Math.min(out.options.length - 1, parseInt(d.answer, 10) || 0));
      out.then = clip(d.then, 400); out.now = clip(d.now, 400); out.story = clip(d.story, 900);
      out.badge = ['Proven', 'Likely', 'Legend'].includes(d.badge) ? d.badge : 'Likely';
    } else if (kind === 'slang') {
      out.term = clip(d.term, 60);
      out.decades = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
      out.decade = out.decades.includes(d.decade) ? d.decade : (body.decade || '1980s');
      out.options = d.options.slice(0, 3).map(o => clip(o, 200));
      out.answer = Math.max(0, Math.min(out.options.length - 1, parseInt(d.answer, 10) || 0));
      out.explain = clip(d.explain, 900); out.example = clip(d.example, 300);
    } else {
      out.word = clip(d.word, 60); out.a = clip(d.a, 200); out.b = clip(d.b, 200);
      out.sentence = clip(d.sentence, 300); out.answer = String(d.answer).toLowerCase() === 'b' ? 'b' : 'a';
      out.explain = clip(d.explain, 900); out.exampleA = clip(d.exampleA, 300); out.exampleB = clip(d.exampleB, 300);
    }
    return out;
  }

  const def = MC_ROUNDS[kind];
  if (!def) throw new Error('Unknown round');
  const b = BADGES[def.labels];
  const labelRule = def.labels === 'none' ? 'label: empty string.' : 'label: one of ' + b.list.join(', ') + '.';
  const system = TOOL_INTRO[def.tool] + '\n' + BASE + '\n\nTASK: Create ONE ' + def.brief + '\nThe options must be similar in length and all sound plausible. Shuffle where the right answer sits.\n' + labelRule + '\nCall the respond tool with an object in this exact shape:\n' + MC_SHAPE + '\nanswer = the index of the correct option.';
  let d;
  for (let i = 0; i < 2; i++) {
    try {
      d = await claudeJSON(system, 'Make a new round.' + avoid, 1400);
      if (d.prompt && Array.isArray(d.options) && d.options.length >= 2) break;
    } catch (e) { if (i === 1) throw e; }
  }
  if (!d || !(d.prompt && Array.isArray(d.options) && d.options.length >= 2)) throw new Error('No round');
  let options = d.options.slice(0, 4).map(o => clip(o, 400));
  if (kind === 'g_rule') {
    const fixed = ['Real Rule', 'Myth', 'Depends'];
    const picked = clip(options[parseInt(d.answer, 10) || 0] || d.label, 40).toLowerCase();
    options = fixed;
    d.answer = picked.indexOf('myth') >= 0 ? 1 : picked.indexOf('depend') >= 0 ? 2 : 0;
  }
  return {
    kind, mc: true,
    prompt: clip(d.prompt, 900), question: clip(d.question, 300), options,
    answer: Math.max(0, Math.min(options.length - 1, parseInt(d.answer, 10) || 0)),
    label: b.list.includes(d.label) ? d.label : '',
    explain: clip(d.explain, 1200), extra: clip(d.extra, 600)
  };
}

async function followup(body) {
  const q = clip(body.question, 800).trim();
  if (!q) throw new Error('Type a question first');
  const tool = TOOL_INTRO[body.tool] ? body.tool : 'shop';
  const context = clip(body.context, 6000);
  const history = (Array.isArray(body.history) ? body.history : []).slice(-8)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, 2500) }))
    .filter(m => m.content);
  const system = TOOL_INTRO[tool] + '\n' + BASE + '\n\nTASK: The visitor is asking a follow-up question about something they just saw. Answer conversationally in plain text (no markdown symbols like # or **). Be complete but readable: usually 2-4 short paragraphs, with examples where they help. If you need more information to answer correctly, ask one short clarifying question.\n\nWHAT THE VISITOR WAS LOOKING AT:\n' + context;
  const messages = history.concat([{ role: 'user', content: q }]);
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return { answer: clip(await claudeText(system, messages, 1200), 5000) };
}

// ---------- Handler ----------
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!hostAllowed(req)) return res.status(403).json({ error: 'This tool only runs on NuSpark sites.' });
  if (!(await require('./_lwgate')(req, res, 'word-grammar-guide'))) return;
  if (!(await underLimit(req))) return res.status(429).json({ error: "You've reached today's limit. Come back tomorrow!" });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  try {
    let out;
    if (body.action === 'report') out = await report(body);
    else if (body.action === 'round') out = await round(body);
    else if (body.action === 'followup') out = await followup(body);
    else return res.status(400).json({ error: 'Unknown action' });
    return res.status(200).json(out);
  } catch (e) {
    console.error('word-grammar-guide error:', e.message);
    const friendly = /Type something|Type a question/.test(e.message) ? e.message : 'Something went wrong. Please try again.';
    return res.status(500).json({ error: friendly });
  }
};

module.exports._test = { REPORTS, SPECIAL_ROUNDS, MC_ROUNDS };
