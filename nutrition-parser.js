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
  const UI_WORDS = /^(?:edit|done|save|cancel|back|close|share|recipes?|nutrition(?:\s+facts)?|show\s+nutrition|ingredients?|directions?|instructions?|servings?|serving\s+size|per\s+serving|log|add(?:\s+meal)?|meal\s+items|calories|amount\s+per\s+serving|my\s+recipes)\b/i;

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

  // Text clean-up shared by both passes: OCR "O" for zero, a lone 9 after a number is a misread "g"
  // ("19.6 9" → "19.6 g"), and lines of stray symbols from icons and graphics are dropped.
  const cleanLines = text => String(text)
    .replace(/(?<=\d)[Oo](?=[\d.,]|\s*g\b)/g, '0')
    .replace(/(\d)[ \t]+9(?=[ \t]*$|[ \t]+[A-Za-z])/gm, '$1 g')
    .split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => /\d/.test(l) || (l.match(/[a-z]/gi) || []).length >= 2);

  // OCR often reads a bold "g" as 9: "12g" → "129", "73.4 g" → "73.49", or "7349" when the decimal point is
  // lost too. Try those readings and keep the combination that best matches what the screenshot itself says:
  // each macro's % of calories (MyFitnessPal shows these) and/or the calories (4 kcal/g carbs and protein,
  // 9 kcal/g fat). A real value ending in 9 stays, because then the numbers already agree.
  function resolveMisreads(r, pct) {
    if (['c', 'p', 'f'].some(k => r[k] === undefined) || (!r.kcal && !pct)) return;
    const readings = v => {
      const s = String(v), out = [{ v, cost: (s.split('.')[1] || '').length >= 2 ? 3 : 0 }]; // 2+ decimals: rare on labels
      if (/9$/.test(s) && s.replace('.', '').length >= 2) {
        const a = s.slice(0, -1).replace(/\.$/, '');
        out.push({ v: +a, cost: 2 });
        if (!a.includes('.') && a.length >= 2) out.push({ v: +(a.slice(0, -1) + '.' + a.slice(-1)), cost: 4 }); // decimal lost too
      }
      return out;
    };
    const error = (c, p, f) => {
      const kcal = 4 * c + 4 * p + 9 * f;
      let e = r.kcal ? 100 * Math.abs(kcal - r.kcal) / r.kcal : 0; // % off the calories
      if (pct) e += Math.abs(400 * c / kcal - pct.c) + Math.abs(900 * f / kcal - pct.f) + Math.abs(400 * p / kcal - pct.p); // points off the %s
      return e;
    };
    let best;
    for (const c of readings(r.c)) for (const p of readings(r.p)) for (const f of readings(r.f)) {
      const err = error(c.v, p.v, f.v), score = err + c.cost + p.cost + f.cost;
      if (!best || score < best.score) best = { c: c.v, p: p.v, f: f.v, err, score };
    }
    if (best.err <= (r.kcal && pct ? 20 : 15)) Object.assign(r, { c: best.c, p: best.p, f: best.f });
  }

  // Second pass helper: the calories beside a Calories/cal label that agree with an estimate (±15%).
  function caloriesNear(text, estimate) {
    const lines = cleanLines(text), found = [];
    lines.forEach((l, i) => {
      const m = labelAt(l, 'kcal');
      if (!m) return;
      found.push(...numbersIn(l, m.index + m[0].length));
      for (let j = i - 2; j <= i + 2; j++) if (j !== i && numberOnly(lines[j])) found.push(...numbersIn(lines[j]));
    });
    const near = found.filter(n => fits('kcal', n) && n.unit !== 'kj' && Math.abs(n.v - estimate) <= estimate * 0.15)
      .sort((a, b) => Math.abs(a.v - estimate) - Math.abs(b.v - estimate));
    return near[0]?.v;
  }

  function parseNutrition(text) {
    const lines = joinRuns(cleanLines(text));
    const result = {}, used = new Set(); // lines whose numbers already went to a label
    let pct;                             // each macro's % of calories, when the screenshot shows them

    // 1. Columns: a line with several labels and no numbers, next to a line of numbers, matched left to right.
    for (let i = 0; i < lines.length; i++) {
      const keys = labelsIn(lines[i]);
      if (keys.length < 2 || numbersIn(lines[i]).length) continue;
      keys.sort((a, b) => labelAt(lines[i], a).index - labelAt(lines[i], b).index);
      const j = [i + 1, i - 1].find(n => numberOnly(lines[n]) && numbersIn(lines[n]).filter(x => x.unit !== '%').length >= keys.length);
      if (j === undefined) continue;
      const nums = numbersIn(lines[j]).filter(n => n.unit !== '%'), pcts = numbersIn(lines[j]).filter(n => n.unit === '%');
      keys.forEach((k, n) => { if (result[k] === undefined && fits(k, nums[n])) result[k] = pick(k, [nums[n]]); });
      if (pcts.length === keys.length && ['c', 'p', 'f'].every(k => keys.includes(k))) pct = Object.fromEntries(keys.map((k, n) => [k, pcts[n].v]));
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
    resolveMisreads(result, pct);
    if (result.kcal === undefined && ['c', 'p', 'f'].every(k => result[k] !== undefined)) { // last resort: 4/4/9
      result.kcal = Math.round(4 * result.c + 4 * result.p + 9 * result.f);
      result.kcalEstimated = true;
    }

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
      && (l.replace(allLabels, '').match(/[a-z]/gi) || []).length >= 5 && /[a-z]/.test(l) // not OCR noise like "HNIC"
      && (l.match(/[a-z\s'&-]/gi) || []).length / l.length > 0.8) || '';

    for (const k of KEYS) if (result[k] === undefined || isNaN(result[k])) delete result[k];
    return result;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { parseNutrition, caloriesNear };
  else Object.assign(root, { parseNutrition, caloriesNear });
})(typeof window !== 'undefined' ? window : globalThis);
