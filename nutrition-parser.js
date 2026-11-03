/*
 * Finds a recipe's name, servings and per-serving calories/protein/carbs/fat in text read from a screenshot
 * (MyFitnessPal and similar apps, or a Nutrition Facts label). Pure function, no DOM: used by app.js and by
 * test/nutrition-parser.test.js.
 *
 * Screenshots lay numbers out in three ways, all handled:
 *   same line   "Protein 29 g"                         (Nutrition Facts style)
 *   stacked     "Carbs" / "42g"  or  "42g" / "Carbs"   (macro summaries; direction is worked out per screenshot)
 *   columns     "Carbs Fat Protein" / "38g 14g 33g"    (a row of labels above or below a row of numbers)
 */
(function (root) {
  'use strict';

  const KEYS = ['kcal', 'f', 'c', 'p'];
  const LABEL = {
    kcal: /\b(?:calories|calorie|cals?|kcal|energy)\b/i,
    f: /\b(?:total\s+)?fats?\b/i,
    c: /\b(?:total\s+)?carb(?:ohydrate)?s?\b/i,
    p: /\bproteins?\b/i,
  };
  // Lines that mention a label but aren't the value we want.
  const NOT = {
    kcal: /\b(?:from\s+fat|burned|remaining|goal|exercise)\b/i,
    f: /\b(?:saturated|sat\.?|trans|mono\w*|poly\w*|unsaturated)\b/i,
    c: /\b(?:net|fib(?:er|re)|sugars?)\b/i,
    p: null,
  };
  const UI_WORDS = /^(?:edit|done|save|cancel|back|close|share|recipes?|nutrition(?:\s+facts)?|ingredients?|directions?|instructions?|servings?|serving\s+size|per\s+serving|log|add|calories|amount\s+per\s+serving|my\s+recipes)\b/i;

  const labelAt = (line, key) => {
    const m = LABEL[key].exec(line);
    return m && !(NOT[key] && NOT[key].test(line)) ? m : null;
  };
  const labelsIn = line => KEYS.filter(k => labelAt(line, k));

  // "1,250" is a thousands separator; "12,5" is a decimal comma.
  const toNumber = s => parseFloat(/^\d{1,3},\d{3}$/.test(s) ? s.replace(',', '') : s.replace(',', '.'));
  function numbersIn(line, from = 0) {
    const re = /(\d{1,5}(?:[.,]\d{1,3})?)\s*(kcal|cal|kj|mg|g|%)?(?![\d.,]*\d)/gi, out = [];
    for (let m; (m = re.exec(line));) if (m.index >= from) out.push({ v: toNumber(m[1]), unit: (m[2] || '').toLowerCase() });
    return out;
  }
  // Which numbers can belong to which label: macros are grams (or unitless), calories are never g/mg/%.
  const fits = (key, n) => key === 'kcal' ? !['g', 'mg', '%'].includes(n.unit) : n.unit === 'g' || n.unit === '';
  const pick = (key, nums) => {
    if (key === 'kcal') { // prefer kcal over kJ when a label shows both
      const kcal = nums.find(n => fits(key, n) && n.unit !== 'kj');
      if (kcal) return kcal.v;
      const kj = nums.find(n => n.unit === 'kj');
      return kj ? Math.round(kj.v / 4.184) : undefined;
    }
    const n = nums.find(n => fits(key, n));
    return n && n.v;
  };
  const numberOnly = line => line && numbersIn(line).length > 0 && !/[a-z]{3,}/i.test(line.replace(/\b(?:kcal|cal|kj|mg|g)\b/gi, ''));

  // Sparse OCR puts each word of a column layout on its own line ("349" "129" "369g" then "Carbs" "Fat"
  // "Protein"). Join runs of 2+ number-only lines, and runs of 2+ single-label lines, back into rows.
  function joinRuns(lines) {
    const kind = l => numberOnly(l) ? 'num' : labelsIn(l).length === 1 && !numbersIn(l).length && l.split(' ').length <= 2 ? 'label' : '';
    const out = [];
    for (let i = 0; i < lines.length;) {
      let j = i + 1;
      while (kind(lines[i]) && j < lines.length && kind(lines[j]) === kind(lines[i])) j++;
      out.push(j - i > 1 ? lines.slice(i, j).join(' ') : lines[i]);
      i = j;
    }
    return out;
  }

  // OCR often reads a bold "g" as 9 ("12g" → "129", "36g" → "369g"). When all three macros were found, try
  // dropping a trailing 9 and keep whichever version best matches the calories (4 kcal/g carbs and protein,
  // 9 kcal/g fat). A real value ending in 9 is kept, because then the calories already add up.
  function fixGReadAsNine(r) {
    if (!r.kcal || ['c', 'p', 'f'].some(k => r[k] === undefined)) return;
    const options = v => Number.isInteger(v) && v >= 19 && v % 10 === 9 ? [v, (v - 9) / 10] : [v];
    const energyError = (c, p, f) => Math.abs(4 * c + 4 * p + 9 * f - r.kcal);
    let best = { c: r.c, p: r.p, f: r.f, err: energyError(r.c, r.p, r.f) };
    for (const c of options(r.c)) for (const p of options(r.p)) for (const f of options(r.f)) {
      const err = energyError(c, p, f);
      if (err < best.err) best = { c, p, f, err };
    }
    if (best.err <= Math.max(30, r.kcal * 0.15)) Object.assign(r, { c: best.c, p: best.p, f: best.f });
  }

  function parseNutrition(text) {
    const lines = joinRuns(String(text)
      .replace(/(?<=\d)[Oo](?=[\d.,]|\s*g\b)/g, '0') // OCR reads 0 as O: "2O g" → "20 g", "2O.5" → "20.5"
      .split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean));
    const result = {}, used = new Set(); // lines whose numbers already went to a label

    // 1. Columns: a line with several labels and no numbers, next to a line of numbers, matched left to right.
    for (let i = 0; i < lines.length; i++) {
      const keys = labelsIn(lines[i]);
      if (keys.length < 2 || numbersIn(lines[i]).length) continue;
      keys.sort((a, b) => labelAt(lines[i], a).index - labelAt(lines[i], b).index);
      const j = [i + 1, i - 1].find(n => numberOnly(lines[n]) && numbersIn(lines[n]).filter(x => x.unit !== '%').length >= keys.length);
      if (j === undefined) continue;
      const nums = numbersIn(lines[j]).filter(n => n.unit !== '%');
      keys.forEach((k, n) => { if (result[k] === undefined && fits(k, nums[n])) result[k] = pick(k, [nums[n]]); });
      used.add(j);
    }

    // 2. Stacked labels: are values below their labels or above them? Decide once for the whole screenshot,
    //    looking past numbers that already belong to a column.
    const free = i => numberOnly(lines[i]) && !used.has(i);
    const labelLines = lines.map((l, i) => labelsIn(l).length === 1 && !numbersIn(l).length ? i : -1).filter(i => i >= 0);
    const valuesBelow = labelLines.length ? free(labelLines[labelLines.length - 1] + 1) : true;

    // 3. Each label: a number on its own line first, then the stacked neighbour (the other side if that's taken).
    for (const key of KEYS) {
      if (result[key] !== undefined) continue;
      for (let i = 0; i < lines.length && result[key] === undefined; i++) {
        const m = labelAt(lines[i], key);
        if (!m) continue;
        let v = pick(key, numbersIn(lines[i], m.index + m[0].length));
        if (v === undefined) {
          const near = (valuesBelow ? [i + 1, i - 1] : [i - 1, i + 1]).find(free);
          if (near !== undefined) { v = pick(key, numbersIn(lines[near])); used.add(near); }
        }
        result[key] = v;
      }
    }
    fixGReadAsNine(result);

    // Servings: "6 servings", "Servings: 6", "Serves 4", "Makes 8" — within one line, and never
    // "serving size" or "per serving" (whose number is something else).
    const serv = lines.map(l =>
      /(\d+(?:\.\d+)?)[ \t]*servings?\b/i.exec(l)
      || /(?<!per\s)\b(?:servings?|serves|makes|yields?)\b(?![ \t]+size)[ \t]*[:\-]?[ \t]*(\d+(?:\.\d+)?)/i.exec(l)).find(Boolean);
    if (serv) result.servings = parseFloat(serv[1]);

    // Name: the first line near the top that reads like a title. Nutrient words are allowed in a name
    // ("Protein Pancakes") as long as something else is left once they're removed.
    const allLabels = new RegExp(KEYS.map(k => LABEL[k].source).join('|'), 'gi');
    result.name = lines.slice(0, 8).find(l =>
      !UI_WORDS.test(l) && !/^\d{1,2}[:.]\d{2}/.test(l) && !numbersIn(l).length
      && (l.replace(allLabels, '').match(/[a-z]/gi) || []).length >= 3
      && (l.match(/[a-z\s'&-]/gi) || []).length / l.length > 0.8) || '';

    for (const k of KEYS) if (result[k] === undefined || isNaN(result[k])) delete result[k];
    return result;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { parseNutrition };
  else root.parseNutrition = parseNutrition;
})(typeof window !== 'undefined' ? window : globalThis);
