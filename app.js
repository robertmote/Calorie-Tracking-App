'use strict';
/*
 * Macro Tracker: a calorie, macro and water diary.
 * Everything is stored in this browser's localStorage under KEY; nothing is sent to a server
 * except food searches (USDA FoodData Central, Open Food Facts).
 */

// ---------- Helpers ----------
const $ = sel => document.querySelector(sel);
const r = Math.round;
const num = n => r(n).toLocaleString();
const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const signed = n => (n > 0 ? '+' : '') + n.toFixed(1);

// Dates are local "YYYY-MM-DD" keys. Noon avoids daylight-saving edge cases.
// Built by hand: toLocaleDateString output varies between browsers and is much slower.
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const toDate = k => new Date(k + 'T12:00');
const addDays = (k, n) => { const d = toDate(k); d.setDate(d.getDate() + n); return iso(d); };
const weekday = k => toDate(k).getDay(); // 0 = Sunday
const fmtDate = (k, opts = { month: 'short', day: 'numeric' }) => toDate(k).toLocaleDateString(undefined, opts);

// ---------- State ----------
const KEY = 'macro-tracker'; // also read by the theme snippet in index.html
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const NUT = ['kcal', 'p', 'c', 'f'];
const LB = 2.20462;  // lbs per kg
const IN = 2.54;     // cm per inch
const OZ = 29.5735;  // ml per fl oz
const RECIPE_UNIT = 'serving (recipe)';

// Fills in anything missing so older saves and hand-edited backups can't crash the app.
function migrate(s) {
  s.goals = { kcal: 2000, p: 150, c: 200, f: 65, ...s.goals };
  s.foods = Array.isArray(s.foods) ? s.foods : [];
  s.days = s.days && typeof s.days === 'object' ? s.days : {};
  for (const [k, d] of Object.entries(s.days)) {
    if (!Array.isArray(d.entries)) d.entries = [];
    if (!d.entries.length && !d.water && !d.weight) delete s.days[k]; // days that were only viewed
  }
  // Weights are stored in kg. Data saved before the units setting existed stored what was typed (lbs).
  if (!s.profile) {
    for (const d of Object.values(s.days)) if (d.weight) d.weight /= LB;
    s.profile = { units: 'imperial' };
  }
  return s;
}

function load() {
  let raw;
  try { raw = localStorage.getItem(KEY); }
  catch { return migrate({}); } // storage blocked entirely: run in memory, and save() will say so
  try {
    return migrate(JSON.parse(raw) || {});
  } catch {
    try { localStorage.setItem(KEY + '-unreadable', raw); } catch {} // keep the damaged copy rather than overwriting it
    return migrate({});
  }
}

let S = load();
let dirty = true;     // data changed since achievements were last checked
let unsaved = false; // the last save failed, so some changes exist only in memory

// Returns whether the data was stored. On failure a warning bar stays up (on every screen) until a
// save succeeds, offering Try again and Export, so changes never look saved when they aren't.
function save() {
  dirty = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    unsaved = false;
  } catch {
    unsaved = true;
  }
  $('#saveProblem').hidden = !unsaved;
  document.body.style.paddingTop = unsaved ? $('#saveProblem').offsetHeight + 'px' : ''; // don't cover the header
  return !unsaved;
}

$('#retrySave').onclick = () => toast(save() ? '<b>Saved</b>' : '<b>Still couldn’t save</b><small>Export a backup so nothing is lost.</small>');
// Try again whenever the app goes to the background, and warn before closing with changes not stored.
document.addEventListener('visibilitychange', () => { if (document.hidden && unsaved) save(); });
addEventListener('beforeunload', e => { if (unsaved) e.preventDefault(); });
navigator.storage?.persist?.(); // ask the browser not to evict our data

let date = today(); // the diary day being viewed
const day = (k = date) => S.days[k] ??= { entries: [] }; // creates the day; only call when writing to it
const viewDay = () => S.days[date] ?? { entries: [] };   // read-only, so browsing days doesn't save empty ones

// How a dialog was closed ('ok' or 'cancel'). Cleared after reading: Esc or the phone's Back
// gesture closes a dialog without setting it, which would otherwise repeat the last 'ok'.
function closedWith(dlg) {
  const v = dlg.returnValue;
  dlg.returnValue = '';
  return v;
}
const logged = k => S.days[k]?.entries.length > 0;
const totals = entries => entries.reduce((t, e) => (NUT.forEach(k => t[k] += e[k] * e.qty), t), { kcal: 0, p: 0, c: 0, f: 0 });

// ---------- Units ----------
const imperial = () => S.profile.units === 'imperial';
const wUnit = () => imperial() ? 'lbs' : 'kg';
const showW = kg => +(imperial() ? kg * LB : kg).toFixed(1); // kg → display units
const latestKg = () => Object.keys(S.days).sort().reverse().map(k => S.days[k].weight).find(Boolean);

const waterUnit = () => imperial() ? 'oz' : 'ml';
const cupMl = () => imperial() ? 8 * OZ : 250;
const showWater = ml => r(imperial() ? ml / OZ : ml).toLocaleString();
const waterGoal = () => S.goals.waterMl ?? 128 * OZ;

// ---------- Diary screen ----------
function render() {
  checkAchievements();
  const d = viewDay();
  renderHeader();
  renderStatus();
  renderLabel(d);
  renderMeals(d);
}

function dayLabel(k) {
  const diff = r((Date.parse(k) - Date.parse(today())) / 864e5);
  return { 0: 'Today', '-1': 'Yesterday', 1: 'Tomorrow' }[diff]
    ?? fmtDate(k, { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderHeader() {
  $('#date').value = date;
  $('#dateLabel').textContent = dayLabel(date);
  document.querySelectorAll('.wUnit').forEach(el => el.textContent = wUnit());

  const sunday = addDays(date, -weekday(date)), now = today();
  $('#week').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const k = addDays(sunday, i), cls = [k === date && 'on', k === now && 'today'].filter(Boolean).join(' ');
    const label = fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric' }) + (logged(k) ? ', food logged' : '');
    return `<button data-day="${k}" class="${cls}" aria-pressed="${k === date}" aria-label="${label}">
      <small>${fmtDate(k, { weekday: 'short' })}</small><b>${toDate(k).getDate()}</b>${logged(k) ? '<i></i>' : ''}</button>`;
  }).join('');
}

function renderStatus() {
  const st = streak();
  $('#streak').innerHTML = !st.n ? 'Log a meal to start a streak.'
    : `<b>${st.n}-day streak</b>${st.today ? '' : '<span>Log something today to keep it going.</span>'}`;

  // Nudge to set up a profile, or to recalculate goals after a ~5 lb change.
  const now = latestKg(), was = S.profile.calcKg;
  $('#notice').innerHTML = !S.profile.age
    ? 'Create your profile to get calorie and macro goals made for you. <button class="link" data-go="profileBtn">Create profile</button>'
    : now && was && Math.abs(now - was) >= 5 / LB
      ? `Your weight has changed ${showW(Math.abs(now - was))} ${wUnit()} since your goals were calculated. <button class="link" data-go="goalsBtn">Recalculate</button>`
      : '';
}

// Today's summary, styled as a Nutrition Facts label.
function renderLabel(d) {
  const t = totals(d.entries), g = S.goals, rem = r(g.kcal - t.kcal), over = rem < 0;
  const pct = k => g[k] ? r(t[k] / g[k] * 100) : 0;
  const rows = [['f', 'Total Fat'], ['c', 'Total Carbohydrate'], ['p', 'Protein']];
  $('#summary').innerHTML = `<div class="facts">
    <h1>Nutrition Facts</h1>
    <p class="sub">${fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <div class="cal${over ? ' bad' : ''}"><span>Calories ${over ? 'over' : 'left'}</span><b>${num(Math.abs(rem))}</b></div>
    <p class="math">Goal ${num(g.kcal)} − food ${num(t.kcal)}</p>
    <div class="dv">% of goal</div>
    ${rows.map(([k, name]) => `<div class="nut"><span><b>${name}</b> ${r(t[k])}g</span><b class="${t[k] > g[k] ? 'bad' : ''}">${pct(k)}%</b></div>`).join('')}
  </div>`;
}

const entryRow = (e, attr) => `<div class="row">
  <div>${esc(e.name)}<small>${+e.qty} × ${esc(e.unit)}<span class="mac">P ${r(e.p * e.qty)} C ${r(e.c * e.qty)} F ${r(e.f * e.qty)}</span></small></div>
  <span>${r(e.kcal * e.qty)}</span>
  <button class="link del" ${attr} aria-label="Delete ${esc(e.name)}">✕</button>
</div>`;

function renderMeals(d) {
  $('#meals').innerHTML = MEALS.map(m => {
    const items = d.entries.map((e, i) => [e, i]).filter(([e]) => e.meal === m);
    return `<section class="meal">
      <h2>${m}<span>${r(totals(items.map(([e]) => e)).kcal)}</span></h2>
      ${items.map(([e, i]) => entryRow(e, `data-del="${i}"`)).join('')}
      <div class="meal-actions"><button class="link" data-add="${m}">+ Add food</button><button class="link" data-copy="${m}">Copy yesterday</button></div>
    </section>`;
  }).join('') + waterSection(d);
}

$('#week').onclick = e => {
  const b = e.target.closest('[data-day]');
  if (b) { date = b.dataset.day; render(); }
};
$('#prev').onclick = () => { date = addDays(date, -1); render(); };
$('#next').onclick = () => { date = addDays(date, 1); render(); };
$('#date').onclick = e => { try { e.target.showPicker(); } catch {} }; // the input sits invisibly over the date label
$('#date').onchange = e => { if (e.target.value) { date = e.target.value; render(); } };

$('#meals').onclick = e => {
  const water = e.target.closest('[data-cup],[data-water]');
  if (water) return onWater(water);
  const { del, add, copy } = e.target.dataset;
  if (del != null) { day().entries.splice(+del, 1); save(); render(); }
  if (add) openAdd(add);
  if (copy) {
    const prev = S.days[addDays(date, -1)]?.entries.filter(x => x.meal === copy) || [];
    if (!prev.length) return alert(`Nothing logged for ${copy} the day before.`);
    day().entries.push(...prev.map(x => ({ ...x, at: Date.now() })));
    save(); render();
  }
};

// ---------- Light / dark mode: sun/moon button in the header ----------
// Until the button is first tapped, S.profile.theme is empty and the app follows the phone's setting.
const phoneDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (S.profile.theme || (phoneDark.matches ? 'dark' : 'light')) === 'dark';

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = isDark(), btn = $('#themeBtn');
  btn.classList.toggle('dark', dark);
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

$('#themeBtn').onclick = () => {
  S.profile.theme = isDark() ? 'light' : 'dark';
  applyTheme(S.profile.theme);
  save();
};
phoneDark.addEventListener('change', () => applyTheme(S.profile.theme)); // keep the icon right while following the phone

document.addEventListener('click', e => {
  // Buttons rendered inside messages that open another screen, e.g. data-go="profileBtn".
  const go = e.target.closest('[data-go]');
  if (go) $('#' + go.dataset.go).click();
  // Cancel buttons are type="button" so the keyboard's Go/Enter key presses the form's Save/Add instead.
  const cancel = e.target.closest('[data-cancel]');
  if (cancel) cancel.closest('dialog').close('cancel');
});
// Since Cancel never submits, any form submission means OK, even one with no button (some keyboards' Go key).
for (const f of document.querySelectorAll('dialog form')) f.addEventListener('submit', () => f.closest('dialog').returnValue = 'ok');

// If the app is reopened on a new day (e.g. left open overnight), move "Today" forward.
let shownToday = today();
document.addEventListener('visibilitychange', () => {
  const now = today();
  if (document.hidden || now === shownToday) return;
  if (date === shownToday) date = now;
  shownToday = now;
  render();
});

// ---------- Water: stored per day in ml; cups are 8 oz (imperial) or 250 ml (metric) ----------
const CUP_SVG = '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M5 3h14l-1.6 21a1.2 1.2 0 0 1-1.2 1H7.8a1.2 1.2 0 0 1-1.2-1z"/></svg>';
const fullCups = ml => Math.floor(ml / cupMl() + 1e-6);

function waterSection(d) {
  const ml = d.water || 0, filled = fullCups(ml);
  const cups = Math.min(24, Math.max(filled, r(waterGoal() / cupMl()), 1));
  const cupButtons = Array.from({ length: cups }, (_, i) =>
    `<button class="${i < filled ? 'full' : ''}" data-cup="${i}" aria-pressed="${i < filled}" aria-label="Cup ${i + 1} of ${cups}">${CUP_SVG}</button>`).join('');
  return `<section class="meal water">
    <h2>Water<span>${showWater(ml)} / ${showWater(waterGoal())} ${waterUnit()}</span></h2>
    <div class="cups">${cupButtons}</div>
    <div class="meal-actions"><button class="link" data-water="cup">+ Add ${showWater(cupMl())} ${waterUnit()}</button><button class="link" data-water="other">Add other amount</button></div>
  </section>`;
}

function onWater(b) {
  const d = day(), cup = cupMl(), filled = fullCups(d.water || 0);
  if (b.dataset.cup != null) {
    const i = +b.dataset.cup;
    d.water = (filled === i + 1 ? i : i + 1) * cup; // tapping the last full cup empties it
  } else if (b.dataset.water === 'cup') {
    d.water = (d.water || 0) + cup;
  } else {
    const v = parseFloat(prompt(`How much water (${waterUnit()})?`));
    if (!(v > 0)) return;
    d.water = (d.water || 0) + (imperial() ? v * OZ : v);
  }
  save(); render();
}

// ---------- Streaks: consecutive days with at least one food logged ----------
function streak() { // counts back from today, or from yesterday if today isn't logged yet
  const now = today();
  let k = logged(now) ? now : addDays(now, -1), n = 0;
  while (logged(k)) { n++; k = addDays(k, -1); }
  return { n, today: logged(now) };
}

function longestRun(keys, step = 1) { // longest chain of sorted date keys that are `step` days apart
  let best = 0, run = 0, prev;
  for (const k of keys) {
    run = prev && addDays(prev, step) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}
const bestStreak = () => longestRun(Object.keys(S.days).filter(logged).sort());

function comeback(keys) { // a 3-day run that began after 3+ missed days
  let run = 0, prev, afterGap = false;
  for (const k of keys) {
    if (prev && addDays(prev, 1) === k) run++;
    else { afterGap = !!prev && Date.parse(k) - Date.parse(prev) >= 4 * 864e5; run = 1; }
    if (afterGap && run >= 3) return true;
    prev = k;
  }
  return false;
}

// ---------- Achievements: computed from the diary; unlock dates are saved the first time each is earned ----------
function achStats() {
  const all = Object.keys(S.days).sort(), keys = all.filter(logged), g = S.goals, p = S.profile, now = today();
  const cache = {}, tot = k => cache[k] ??= totals(S.days[k].entries); // each day's totals computed once
  const entries = keys.flatMap(k => S.days[k].entries.map(e => ({ ...e, k })));
  const near = (v, goal) => goal > 0 && Math.abs(v - goal) <= goal * 0.1;
  const onTarget = k => logged(k) && Math.abs(tot(k).kcal - g.kcal) <= 100;
  const hitProtein = k => g.p > 0 && tot(k).p >= g.p;
  const hydrated = k => S.days[k].water >= waterGoal() - 1;
  const hour = e => e.at && new Date(e.at).getHours();

  const wKeys = all.filter(k => S.days[k].weight), kgs = wKeys.map(k => S.days[k].weight);
  const moved = kgs.length > 1 ? Math.sign(p.rate || 0) * (kgs.at(-1) - kgs[0]) : 0; // kg toward the chosen lose/gain direction
  const span = g.weightKg && kgs.length ? g.weightKg - kgs[0] : 0;

  const recipeLogs = {};
  for (const e of entries) if (e.unit === RECIPE_UNIT) recipeLogs[e.name] = (recipeLogs[e.name] || 0) + 1;

  return {
    days: keys.length,
    best: bestStreak(),
    threeMeals: keys.some(k => ['Breakfast', 'Lunch', 'Dinner'].every(m => S.days[k].entries.some(e => e.meal === m))),
    fullPlate: keys.some(k => MEALS.every(m => S.days[k].entries.some(e => e.meal === m))),
    weekend: keys.some(k => weekday(k) === 6 && logged(addDays(k, 1))),
    comeback: comeback(keys),
    planner: keys.some(k => k > now),
    onTarget: keys.filter(onTarget).length,
    perfectWeek: keys.some(k => weekday(k) === 0 && [0, 1, 2, 3, 4, 5, 6].every(i => onTarget(addDays(k, i)))),
    protein: keys.some(hitProtein),
    proteinRun: longestRun(keys.filter(hitProtein)),
    macros: keys.some(k => ['p', 'c', 'f'].every(m => near(tot(k)[m], g[m]))),
    hydrated: all.filter(hydrated).length,
    waterRun: longestRun(all.filter(hydrated)),
    overflow: all.some(k => S.days[k].water >= 2 * waterGoal() - 1),
    recipes: S.foods.filter(f => f.ingredients).length,
    foods: S.foods.length,
    scans: S.scans || 0,
    scanned: (S.scanned || []).length,
    variety: new Set(entries.map(e => e.name.toLowerCase())).size,
    houseSpecial: Math.max(0, ...Object.values(recipeLogs)),
    earlyBird: entries.some(e => e.meal === 'Breakfast' && e.at && iso(new Date(e.at)) === e.k && hour(e) < 8),
    nightOwl: entries.some(e => hour(e) >= 23),
    profile: !!(p.age && p.calcKg),
    exported: !!S.exported,
    weighIns: kgs.length,
    moved: imperial() ? moved * LB : moved,
    weeklyWeighIn: longestRun([...new Set(wKeys.map(k => addDays(k, -weekday(k))))].sort(), 7),
    halfway: Math.abs(span) > 0.5 && (kgs.at(-1) - kgs[0]) / span >= 0.5,
    goalWeight: !!(g.weightKg && kgs.length && Math.abs(kgs.at(-1) - g.weightKg) < 0.25),
  };
}

const ACH = [ // [id, name, description, value from stats, target, secret]
  ['profile', 'Know Thyself', 'Fill in your profile and calculate your goals.', s => +s.profile, 1],
  ['first', 'First Bite', 'Log your first food.', s => s.days, 1],
  ['meals3', 'Three Square Meals', 'Log breakfast, lunch and dinner in one day.', s => +s.threeMeals, 1],
  ['meals4', 'Full Plate', 'Log all four meals, snacks included, in one day.', s => +s.fullPlate, 1],
  ['early', 'Early Bird', 'Log breakfast before 8 AM.', s => +s.earlyBird, 1],
  ['planner', 'Meal Planner', 'Log food on a future day.', s => +s.planner, 1],
  ['streak3', 'Warming Up', 'Reach a 3-day streak.', s => s.best, 3],
  ['streak7', 'Week Warrior', 'Reach a 7-day streak.', s => s.best, 7],
  ['streak30', 'Monthly Grind', 'Reach a 30-day streak.', s => s.best, 30],
  ['streak100', 'Centurion', 'Reach a 100-day streak.', s => s.best, 100],
  ['streak365', 'Iron Will', 'Reach a 365-day streak.', s => s.best, 365],
  ['comeback', 'Comeback Kid', 'Start a new 3-day streak after missing 3 or more days.', s => +s.comeback, 1],
  ['weekend', 'Weekend Warrior', 'Log both Saturday and Sunday of the same weekend.', s => +s.weekend, 1],
  ['days10', 'Regular', 'Log food on 10 different days.', s => s.days, 10],
  ['days50', 'Devoted', 'Log food on 50 different days.', s => s.days, 50],
  ['target1', 'Bullseye', 'Finish a day within 100 calories of your goal.', s => s.onTarget, 1],
  ['target7', 'Sharpshooter', 'Finish 7 days within 100 calories of your goal.', s => s.onTarget, 7],
  ['perfectweek', 'Perfect Week', 'Finish every day of a Sunday–Saturday week within 100 calories of your goal.', s => +s.perfectWeek, 1],
  ['protein', 'Protein Packed', 'Hit your protein goal in a day.', s => +s.protein, 1],
  ['protein7', 'Protein Streak', 'Hit your protein goal 7 days in a row.', s => s.proteinRun, 7],
  ['macros', 'Macro Master', 'Land all three macros within 10% of goal in one day.', s => +s.macros, 1],
  ['water1', 'Hydrated', 'Reach your water goal.', s => s.hydrated, 1],
  ['water7', 'Well Watered', 'Reach your water goal on 7 days.', s => s.hydrated, 7],
  ['waterrun', 'Hydration Streak', 'Reach your water goal 7 days in a row.', s => s.waterRun, 7],
  ['variety', 'Variety Pack', 'Log 50 different foods.', s => s.variety, 50],
  ['recipe1', 'Home Chef', 'Create a recipe.', s => s.recipes, 1],
  ['recipe5', 'Cookbook', 'Create 5 recipes.', s => s.recipes, 5],
  ['house', 'House Special', 'Log the same recipe 5 times.', s => s.houseSpecial, 5],
  ['scan', 'Scanner', 'Scan a barcode.', s => s.scans, 1],
  ['scan10', 'Barcode Hunter', 'Scan 10 different products.', s => s.scanned, 10],
  ['pantry', 'Stocked Pantry', 'Save 25 foods to My Foods.', s => s.foods, 25],
  ['backup', 'Safe Keeper', 'Export a backup of your diary.', s => +s.exported, 1],
  ['weigh1', 'On the Scale', 'Log your weight.', s => s.weighIns, 1],
  ['weighweekly', 'Weekly Weigh-in', 'Log your weight 4 weeks in a row.', s => s.weeklyWeighIn, 4],
  ['moved', 'Moving the Needle', 'Move 5 lbs (2.5 kg) toward your goal.', s => s.moved, () => imperial() ? 5 : 2.5],
  ['moved10', 'Moving the Needle II', 'Move 10 lbs (5 kg) toward your goal.', s => s.moved, () => imperial() ? 10 : 5],
  ['moved25', 'Moving the Needle III', 'Move 25 lbs (12 kg) toward your goal.', s => s.moved, () => imperial() ? 25 : 12],
  ['halfway', 'Halfway There', 'Get halfway from your starting weight to your goal weight.', s => +s.halfway, 1],
  ['goalwt', 'Goal Getter', 'Reach your goal weight.', s => +s.goalWeight, 1],
  ['nightowl', 'Night Owl', 'Log something after 11 PM.', s => +s.nightOwl, 1, true],
  ['overflow', 'Overflowing', 'Drink double your water goal in one day.', s => +s.overflow, 1, true],
].map(([id, name, desc, val, target, secret]) =>
  ({ id, name, desc, val, secret, target: typeof target === 'function' ? target : () => target }));

let booted = false; // achievements already earned when the app opens unlock quietly
function checkAchievements() {
  if (!dirty) return; // nothing saved since the last check (e.g. just switching days)
  dirty = false;
  const got = S.achievements ??= {}, s = achStats();
  const fresh = ACH.filter(a => !got[a.id] && a.val(s) >= a.target());
  if (!fresh.length) return;
  for (const a of fresh) got[a.id] = today();
  save();
  if (booted) toast(`<small>Achievement unlocked</small><b>${fresh[0].name}</b>${fresh.length > 1 ? ` <small>and ${fresh.length - 1} more</small>` : ''}`);
}

let toastTimer;
function toast(html) {
  const t = $('#toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

const HEX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="hex" d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><path class="mark" d="M8 12.5l2.7 2.7L16.2 9.6"/></svg>';
$('#achBtn').onclick = () => {
  const got = S.achievements || {}, s = achStats(), n = ACH.filter(a => got[a.id]).length;
  $('#achCount').textContent = `${n} / ${ACH.length}`;
  $('#achFill').style.width = `${n / ACH.length * 100}%`;
  $('#achList').innerHTML = ACH.map(a => {
    const on = !!got[a.id], hidden = a.secret && !on, t = a.target();
    const progress = on ? fmtDate(got[a.id]) : t > 1 ? `${Math.max(0, Math.min(Math.floor(a.val(s)), t))} / ${t}` : 'Locked';
    return `<div class="ach${on ? ' on' : ''}">${HEX}
      <div><b>${hidden ? '???' : a.name}</b><small>${hidden ? 'Secret achievement. Keep exploring.' : a.desc}</small></div>
      <small class="when">${progress}</small></div>`;
  }).join('');
  $('#achDlg').showModal();
};

// ---------- Add food (also used to add recipe ingredients) ----------
const form = $('#foodForm');
form.meal.innerHTML = MEALS.map(m => `<option>${m}</option>`).join('');
let hits = [];          // foods currently listed in the results
let target = 'diary';   // 'diary' or 'recipe': where the Add button puts the food

const NO_SAVED_MATCH = 'Nothing saved matches. Tap Search to look it up online, or enter it below.';
function showHits(list, empty = NO_SAVED_MATCH) {
  hits = list;
  $('#results').innerHTML = list.map((f, i) => `<li data-i="${i}">${esc(f.name)}
    <small>${r(f.kcal)} kcal per ${esc(f.unit)}<span class="mac">P ${r(f.p)} C ${r(f.c)} F ${r(f.f)}</span></small>
    ${f.ingredients && target === 'diary' ? `<button type="button" class="link" data-edit="${i}">Edit recipe</button>` : ''}</li>`).join('')
    || `<li><small>${empty}</small></li>`;
}
const localHits = q => S.foods.filter(f => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30);

function openAdd(meal) { // meal = null → adding a recipe ingredient
  target = meal ? 'diary' : 'recipe';
  form.reset();
  form.meal.value = meal || MEALS[0];
  form.meal.hidden = !meal;
  $('#addTitle').textContent = meal ? 'Add to' : 'Add ingredient';
  $('#q').value = '';
  searchId++;
  showHits(localHits(''));
  $('#addDlg').showModal();
  $('#q').focus();
}

$('#q').oninput = e => { searchId++; showHits(localHits(e.target.value)); }; // typing cancels a pending search
$('#q').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); searchOnline(); } };
$('#searchBtn').onclick = searchOnline;
$('#results').onclick = e => {
  const edit = e.target.dataset.edit;
  if (edit != null) { $('#addDlg').close('cancel'); return openRecipe(hits[edit]); }
  const f = hits[e.target.closest('li')?.dataset.i];
  if (f) for (const k of ['name', 'unit', ...NUT]) form[k].value = typeof f[k] === 'number' ? +f[k].toFixed(1) : f[k];
};

const sameFood = (a, b) => a.name === b.name && a.unit === b.unit;
// "My Foods" is recent-first. Merging keeps a recipe's ingredients when it's logged from the form.
function rememberFood(food) {
  S.foods = [{ ...S.foods.find(f => sameFood(f, food)), ...food }, ...S.foods.filter(f => !sameFood(f, food))].slice(0, 500);
}

$('#addDlg').onclose = () => {
  if (closedWith($('#addDlg')) !== 'ok') return;
  const fd = Object.fromEntries(new FormData(form));
  const food = { name: fd.name.trim(), unit: fd.unit.trim() };
  NUT.forEach(k => food[k] = +fd[k] || 0);
  const entry = { qty: +fd.qty || 1, ...food };
  if (target === 'recipe') { ingredients.push(entry); renderRecipe(); }
  else day().entries.push({ meal: fd.meal, ...entry, at: Date.now() }); // `at` = when it was logged (Early Bird / Night Owl)
  rememberFood(food);
  save(); render();
};

// ---------- Food search ----------
// Barcodes (8-14 digits) → Open Food Facts (free, no key), falling back to USDA's branded foods.
function fromOFF(p) {
  const n = p.nutriments || {}, per = n['energy-kcal_serving'] != null ? '_serving' : '_100g';
  if (!p.product_name || n['energy-kcal' + per] == null) return null;
  const v = k => +n[k + per] || 0;
  return {
    name: p.product_name + (p.brands ? ` (${p.brands.split(',')[0]})` : ''),
    unit: per === '_serving' ? (p.serving_size || 'serving') : '100 g',
    kcal: v('energy-kcal'), p: v('proteins'), c: v('carbohydrates'), f: v('fat'),
  };
}

// Text search → USDA FoodData Central. Values are per 100 g; branded foods are scaled to their label serving.
const USDA_ID = { kcal: 1008, p: 1003, c: 1005, f: 1004 };
function fromUSDA(x) {
  const n = id => x.foodNutrients.find(v => v.nutrientId === id)?.value;
  if (n(USDA_ID.kcal) == null) return null;
  const g = /^(g|ml)$/i.test(x.servingSizeUnit) && x.servingSize, scale = g ? g / 100 : 1;
  const brand = x.brandName || x.brandOwner;
  const f = {
    name: x.description.toLowerCase().replace(/^./, ch => ch.toUpperCase()) + (brand ? ` (${brand})` : ''),
    unit: g ? `${x.householdServingFullText || 'serving'} (${g} ${x.servingSizeUnit.toLowerCase()})` : '100 g',
  };
  for (const k in USDA_ID) f[k] = (n(USDA_ID[k]) || 0) * scale;
  return f;
}

const searchError = msg => Object.assign(new Error(msg), { forUser: true }); // a message worth showing as-is

async function searchUSDA(q) {
  const key = encodeURIComponent(S.usdaKey || 'DEMO_KEY');
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${encodeURIComponent(q)}&pageSize=25`);
  if (res.status === 429) throw searchError('Too many searches with the shared key. Add your free USDA API key under Goals.');
  if (res.status === 401 || res.status === 403) throw searchError('USDA didn’t accept your API key. Check it under Goals, or clear it to use the shared key.');
  if (!res.ok) throw searchError('The USDA food search isn’t responding. Try again in a minute, or enter the food manually.');
  const { foods = [] } = await res.json();
  return foods.sort((a, b) => (a.dataType === 'Branded') - (b.dataType === 'Branded')).map(fromUSDA); // whole foods first
}

let searchId = 0; // only the latest search may show its results
async function searchOnline() {
  const q = $('#q').value.trim(), id = ++searchId;
  if (!q) return;
  $('#results').innerHTML = '<li><small>Searching…</small></li>';
  try {
    let found;
    if (/^\d{8,14}$/.test(q)) {
      const j = await (await fetch(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=product_name,brands,serving_size,nutriments`)).json();
      found = j.product ? [fromOFF(j.product)] : await searchUSDA(q);
    } else {
      found = await searchUSDA(q);
    }
    if (id !== searchId) return;
    showHits([...localHits(q), ...found.filter(Boolean)], 'No results found online. Enter the food below instead.');
  } catch (e) {
    if (id !== searchId) return;
    const msg = e.forUser ? e.message : 'Search failed. Check your connection, or enter the food manually.';
    $('#results').innerHTML = `<li><small>${esc(msg)}</small></li>`;
  }
}

// ---------- Barcode scanner: native BarcodeDetector on Android, WASM polyfill elsewhere (iPhone). Needs https. ----------
async function getDetector() {
  const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  const native = 'BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('ean_13');
  const BD = native ? BarcodeDetector : (await import('https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/ponyfill/+esm')).BarcodeDetector;
  return new BD({ formats });
}

$('#scanBtn').onclick = async () => {
  const dlg = $('#scanDlg'), video = $('#video'), msg = $('#scanMsg');
  let stream;
  msg.textContent = 'Starting camera…';
  dlg.showModal();
  try {
    const [detector, s] = await Promise.all([getDetector(), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })]);
    stream = s;
    video.srcObject = s;
    await video.play();
    msg.textContent = 'Point the camera at a barcode.';
    while (dlg.open) {
      const [code] = await detector.detect(video);
      if (code) {
        dlg.close();
        S.scans = (S.scans || 0) + 1;
        S.scanned = [...new Set([...(S.scanned || []), code.rawValue])];
        save();
        $('#q').value = code.rawValue;
        searchOnline();
        break;
      }
      await new Promise(res => setTimeout(res, 200));
    }
  } catch (e) {
    msg.textContent = e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in your browser settings.'
      : e.name === 'NotFoundError' ? 'No camera was found on this device.'
      : !isSecureContext ? 'The camera only works when the app is opened from an https:// address.'
      : 'Couldn’t start the scanner. Check your internet connection and try again.';
  } finally {
    stream?.getTracks().forEach(t => t.stop());
  }
};

// ---------- Recipes: saved to My Foods as a per-serving food ----------
const rForm = $('#recipeDlg form');
let ingredients = [];  // the recipe being built
let editing = null;    // name of the recipe being edited, null when creating

function renderRecipe() {
  const t = totals(ingredients), n = +rForm.servings.value || 1;
  $('#ingredients').innerHTML = ingredients.map((e, i) => entryRow(e, `data-rm="${i}"`)).join('')
    + (ingredients.length
      ? `<p><small>Per serving: ${r(t.kcal / n)} kcal<span class="mac">P ${r(t.p / n)} C ${r(t.c / n)} F ${r(t.f / n)}</span></small></p>`
      : '<p><small>No ingredients yet.</small></p>');
}

function openRecipe(food) {
  rForm.reset();
  editing = food?.name ?? null;
  ingredients = food ? food.ingredients.map(x => ({ ...x })) : []; // a copy, so Cancel discards changes
  if (food) { rForm.name.value = food.name; rForm.servings.value = food.servings; }
  $('#recipeTitle').textContent = food ? 'Edit recipe' : 'New recipe';
  renderRecipe();
  $('#recipeDlg').showModal();
}

$('#recipeBtn').onclick = () => openRecipe(null);
$('#addIng').onclick = () => openAdd(null);
rForm.servings.oninput = renderRecipe;
$('#ingredients').onclick = e => {
  const i = e.target.dataset.rm;
  if (i != null) { ingredients.splice(+i, 1); renderRecipe(); }
};
rForm.onsubmit = e => {
  if (!ingredients.length) {
    e.preventDefault();
    $('#recipeDlg').returnValue = ''; // not saved, so a later Back/Esc mustn't count as OK
    alert('Add at least one ingredient.');
  }
};
$('#recipeDlg').onclose = () => {
  if (closedWith($('#recipeDlg')) !== 'ok') return;
  const n = +rForm.servings.value || 1, t = totals(ingredients);
  const food = { name: rForm.name.value.trim(), unit: RECIPE_UNIT, servings: n, ingredients };
  NUT.forEach(k => food[k] = t[k] / n);
  if (editing != null) S.foods = S.foods.filter(f => !(f.name === editing && f.unit === RECIPE_UNIT)); // handles renames
  rememberFood(food);
  if (save()) alert(`Saved "${food.name}". Find it under My Foods when adding food.`);
};

// ---------- Weight progress: line over time; tap or hover a point for its value ----------
$('#progressBtn').onclick = () => {
  const pts = Object.keys(S.days).sort().filter(k => S.days[k].weight).map(k => ({ k, t: Date.parse(k), w: showW(S.days[k].weight) }));
  const svg = $('#wChart'), out = $('#wReadout');
  svg.innerHTML = '';
  svg.onpointermove = svg.onpointerleave = null;
  $('#wList').innerHTML = '';
  if (!pts.length) {
    out.innerHTML = '<small>Enter your current weight in Profile to start tracking progress.</small>';
    return $('#progDlg').showModal();
  }

  const W = 320, H = 160, L = 34, R = 10, T = 10, B = 22, first = pts[0], last = pts.at(-1);
  const lo = Math.floor(Math.min(...pts.map(p => p.w)) - 1), hi = Math.ceil(Math.max(...pts.map(p => p.w)) + 1);
  const x = t => last.t === first.t ? (L + W - R) / 2 : L + (t - first.t) / (last.t - first.t) * (W - L - R);
  const y = w => T + (hi - w) / (hi - lo) * (H - T - B);

  const goalKg = S.goals.weightKg, toGo = goalKg && Math.abs(latestKg() - goalKg);
  const goalNote = goalKg ? `<br><small>Goal ${showW(goalKg)} ${wUnit()}: ${toGo < 0.25 ? 'reached' : `${showW(toGo)} ${wUnit()} to go`}</small>` : '';
  const summary = `Latest <b>${last.w} ${wUnit()}</b>${pts.length > 1 ? ` <small>${signed(last.w - first.w)} since ${fmtDate(first.k)}</small>` : ''}${goalNote}`;
  out.innerHTML = summary;

  svg.innerHTML = `<g fill="var(--muted)" font-size="10">
      <text x="${L - 6}" y="${y(hi) + 3}" text-anchor="end">${hi}</text>
      <text x="${L - 6}" y="${y(lo) + 3}" text-anchor="end">${lo}</text>
      <text x="${x(first.t)}" y="${H - 6}" text-anchor="${pts.length > 1 ? 'start' : 'middle'}">${fmtDate(first.k)}</text>
      ${pts.length > 1 ? `<text x="${x(last.t)}" y="${H - 6}" text-anchor="end">${fmtDate(last.k)}</text>` : ''}
    </g>
    <line x1="${L}" x2="${W - R}" y1="${y(hi)}" y2="${y(hi)}" stroke="var(--line)"/>
    <line x1="${L}" x2="${W - R}" y1="${y(lo)}" y2="${y(lo)}" stroke="var(--line)"/>
    <polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" points="${pts.map(p => `${x(p.t)},${y(p.w)}`).join(' ')}"/>
    ${pts.map(p => `<circle cx="${x(p.t)}" cy="${y(p.w)}" r="4" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>`).join('')}
    <circle id="wFocus" r="7" fill="none" stroke="var(--fg)" stroke-width="2" visibility="hidden"/>`;

  const focus = $('#wFocus');
  svg.onpointermove = e => {
    const b = svg.getBoundingClientRect(), px = (e.clientX - b.left) / b.width * W;
    const p = pts.reduce((a, c) => Math.abs(x(c.t) - px) < Math.abs(x(a.t) - px) ? c : a);
    focus.setAttribute('cx', x(p.t));
    focus.setAttribute('cy', y(p.w));
    focus.setAttribute('visibility', 'visible');
    out.innerHTML = `${fmtDate(p.k)}: <b>${p.w}</b>`;
  };
  svg.onpointerleave = () => { focus.setAttribute('visibility', 'hidden'); out.innerHTML = summary; };

  $('#wList').innerHTML = pts.map((p, i) =>
    `<div class="row"><div>${fmtDate(p.k)}</div><span>${p.w}</span><small class="change">${i ? signed(p.w - pts[i - 1].w) : ''}</small></div>`).reverse().join('');
  $('#progDlg').showModal();
};

// ---------- Tabs: Nutrition is the diary; Goals and Profile are full screens. Leaving a screen unsaved = Cancel. ----------
const PAGES = { goalsBtn: $('#goalsDlg'), profileBtn: $('#profileDlg') };

function syncTabs() {
  const open = Object.keys(PAGES).find(id => PAGES[id].open) || 'nutritionBtn';
  document.querySelectorAll('#tabs button').forEach(b =>
    b.id === open ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
}
function closePages() {
  for (const d of Object.values(PAGES)) if (d.open) d.close('cancel');
}
function openPage(id) { // false if already showing, so a second tap doesn't wipe unsaved edits
  if (PAGES[id].open) return false;
  closePages();
  return true;
}
function showPage(id) {
  PAGES[id].show();
  PAGES[id].scrollTop = 0;
  syncTabs();
}

Object.values(PAGES).forEach(d => d.addEventListener('close', syncTabs));
$('#nutritionBtn').onclick = () => { closePages(); syncTabs(); scrollTo({ top: 0 }); };

// ---------- Profile (units live here) ----------
const pForm = $('#profileDlg form');
const pImperial = () => pForm.units.value === 'imperial';

function setProfileUnits() {
  pForm.querySelector('.hUnit').textContent = pImperial() ? 'in' : 'cm';
  pForm.querySelector('.wUnit').textContent = pImperial() ? 'lbs' : 'kg';
  pForm.height.placeholder = pImperial() ? '70 = 5′10″' : '178';
}

pForm.onchange = e => {
  if (e.target.name !== 'units') return;
  // Convert what's typed so switching units doesn't scramble it.
  const h = +pForm.height.value, w = +pForm.pweight.value, imp = pImperial();
  if (h) pForm.height.value = +(imp ? h / IN : h * IN).toFixed(1);
  if (w) pForm.pweight.value = +(imp ? w * LB : w / LB).toFixed(1);
  setProfileUnits();
};

$('#profileBtn').onclick = () => {
  if (!openPage('profileBtn')) return;
  const p = S.profile, imp = p.units === 'imperial', kg = latestKg(), best = bestStreak();
  pForm.reset();
  pForm.name.value = p.name || '';
  pForm.units.value = p.units;
  pForm.sex.value = p.sex || 'm';
  pForm.age.value = p.age || '';
  pForm.activity.value = p.activity || '1.2';
  pForm.height.value = p.cm ? +(imp ? p.cm / IN : p.cm).toFixed(1) : '';
  pForm.pweight.value = kg ? +(imp ? kg * LB : kg).toFixed(1) : '';
  $('#bestStreak').innerHTML = best ? `<small>Longest streak: <b>${best} ${best === 1 ? 'day' : 'days'}</b></small>` : '';
  setProfileUnits();
  showPage('profileBtn');
};

$('#profileDlg').onclose = () => {
  if (closedWith($('#profileDlg')) !== 'ok') return;
  const imp = pImperial(), h = +pForm.height.value, w = +pForm.pweight.value;
  Object.assign(S.profile, {
    name: pForm.name.value.trim(),
    units: pForm.units.value,
    sex: pForm.sex.value,
    age: +pForm.age.value || undefined,
    activity: pForm.activity.value,
    cm: h ? (imp ? h * IN : h) : undefined,
  });
  const kg = imp ? w / LB : w;
  if (w && Math.abs(kg - (latestKg() || 0)) > 0.05) day(today()).weight = kg; // a new current weight is today's weigh-in
  save(); render();
};

// ---------- Goals ----------
// Mifflin-St Jeor BMR × activity, ± a daily deficit/surplus for the chosen weekly rate.
function calcGoals({ sex, age, cm, kg, activity, delta }) {
  const tdee = (10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161)) * activity;
  const min = sex === 'm' ? 1500 : 1200; // safety floor
  const kcal = Math.max(min, r((tdee + delta) / 10) * 10);
  const p = r(Math.min(kg * 1.8, kcal * 0.35 / 4)); // ~0.8 g per lb, capped at 35% of calories
  const f = r(kcal * 0.3 / 9);                      // 30% of calories
  const c = Math.max(0, r((kcal - p * 4 - f * 9) / 4)); // the rest
  return { tdee: r(tdee), kcal, p, c, f, floored: tdee + delta < min };
}

// [daily kcal change, weekly amount, unit]: 1 lb ≈ 3500 kcal, 1 kg ≈ 7700 kcal.
const RATES = {
  imperial: [-2, -1.5, -1, -0.5, 0, 0.5, 1].map(n => [n * 500, n, 'lb']),
  metric: [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5].map(n => [n * 1100, n, 'kg']),
};

const gForm = $('#goalsDlg form');
let calcKg = null; // the weight used by the last Calculate, saved with the goals

function fillRates(delta) {
  const opts = RATES[S.profile.units];
  gForm.rate.innerHTML = opts.map(([d, n, u]) =>
    `<option value="${d}">${n < 0 ? `Lose ${-n} ${u} per week` : n > 0 ? `Gain ${n} ${u} per week` : 'Maintain weight'}</option>`).join('');
  gForm.rate.value = opts.reduce((a, o) => Math.abs(o[0] - delta) < Math.abs(a[0] - delta) ? o : a)[0]; // nearest, in case units changed
}

$('#goalsBtn').onclick = () => {
  if (!openPage('goalsBtn')) return;
  gForm.reset();
  calcKg = null;
  $('#calcMsg').innerHTML = '';
  fillRates(S.profile.rate ?? -500);
  gForm.goalWeight.value = S.goals.weightKg ? showW(S.goals.weightKg) : '';
  gForm.waterGoal.value = r(imperial() ? waterGoal() / OZ : waterGoal());
  gForm.querySelector('.waterUnit').textContent = waterUnit();
  NUT.forEach(k => gForm[k].value = S.goals[k]);
  gForm.usdaKey.value = S.usdaKey || '';
  showPage('goalsBtn');
};

$('#calcBtn').onclick = () => {
  const p = S.profile, kg = latestKg();
  if (!(p.age && p.cm && kg)) {
    $('#calcMsg').innerHTML = '<small class="bad">Your profile needs your age, height and current weight first.</small> <button type="button" class="link" data-go="profileBtn">Open profile</button>';
    return;
  }
  calcKg = kg;
  const g = calcGoals({ sex: p.sex, age: p.age, cm: p.cm, kg, activity: +p.activity, delta: +gForm.rate.value });
  NUT.forEach(k => gForm[k].value = g[k]);
  $('#calcMsg').innerHTML = `<small>Maintenance ≈ ${g.tdee} kcal/day. Goal: ${g.kcal} kcal${g.floored ? ' (raised to the safe minimum, so you may lose more slowly than selected)' : ''}. Adjust any number below, then Save.</small>`;
};

// Save keeps you on the Goals screen; Cancel or another tab leaves without saving.
gForm.onsubmit = e => {
  e.preventDefault();
  const stored = saveGoals();
  calcKg = null; // already applied; a later Save without Calculate shouldn't re-record it
  if (stored) toast('<b>Goals saved</b>'); // on failure the warning bar explains instead
};

function saveGoals() {
  const water = +gForm.waterGoal.value, goalWeight = +gForm.goalWeight.value;
  S.profile.rate = +gForm.rate.value;
  if (calcKg) S.profile.calcKg = calcKg;
  S.goals.waterMl = water > 0 ? (imperial() ? water * OZ : water) : undefined;               // empty → default 128 oz
  S.goals.weightKg = goalWeight > 0 ? (imperial() ? goalWeight / LB : goalWeight) : undefined; // stored in kg like all weights
  NUT.forEach(k => S.goals[k] = +gForm[k].value || 0);
  S.usdaKey = gForm.usdaKey.value.trim();
  const stored = save();
  render();
  return stored;
}

// ---------- Backup (browser storage can be cleared; export regularly) ----------
$('#exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  a.download = `macro-tracker-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000); // free the file's memory once the download has started
  S.exported = true; // Safe Keeper
  save(); render();
};

$('#restoreBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!data.goals || !data.days || !Array.isArray(data.foods)) throw new Error('not a backup');
    if (confirm('Replace all current data with this backup?')) {
      S = migrate(data);
      applyTheme(S.profile.theme);
      save(); render();
    }
  } catch {
    alert('That file is not a valid Macro Tracker backup.');
  }
  e.target.value = '';
};

// ---------- Start ----------
applyTheme(S.profile.theme);
render();
booted = true;
