// Run with: node --test test/nutrition-parser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNutrition } = require('../nutrition-parser.js');

const check = (text, expected) => assert.deepEqual(parseNutrition(text), expected);

test('Nutrition Facts style: label and value on one line, look-alike lines ignored', () => check(`
9:41
Chicken Chili
Servings 6
Nutrition per serving
Calories 350
Total Fat 12 g
Saturated Fat 3 g
Cholesterol 85 mg
Sodium 640 mg
Total Carbohydrates 31 g
Dietary Fiber 8 g
Sugars 6 g
Protein 29 g`, { name: 'Chicken Chili', servings: 6, kcal: 350, f: 12, c: 31, p: 29 }));

test('stacked, values below labels (macro summary)', () => check(`
Overnight Oats
4 servings
Calories per serving
310
Carbs
42g
Fat
9g
Protein
15g`, { name: 'Overnight Oats', servings: 4, kcal: 310, c: 42, f: 9, p: 15 }));

test('stacked, values above labels', () => check(`
Turkey Meatballs
Makes 8
285
Calories
18g
Carbs
11g
Fat
27g
Protein`, { name: 'Turkey Meatballs', servings: 8, kcal: 285, c: 18, f: 11, p: 27 }));

test('columns: a row of labels over a row of values, percentages skipped', () => check(`
Beef Stew
Serving Size: 1 bowl Servings: 5
Cal Carbs Fat Protein
420 38g 14g 33g
40% 30% 30%`, { name: 'Beef Stew', servings: 5, kcal: 420, c: 38, f: 14, p: 33 }));

test('percentages, kJ beside kcal, thousands separators and OCR "O" for zero', () => check(`
Protein Pancakes
Energy 1465 kJ 350 kcal
Carbs 40% 42g
Fat 25% 1O g
Protein 35% 2O.5 g`, { name: 'Protein Pancakes', kcal: 350, c: 42, f: 10, p: 20.5 }));

test('kJ only is converted to kcal; whole-recipe totals with a thousands separator', () => {
  assert.equal(parseNutrition('Energy 1465 kJ').kcal, 350);
  assert.equal(parseNutrition('Calories 1,250').kcal, 1250);
});

test('nothing recognisable returns no numbers', () => check('Just a photo of my dog', { name: 'Just a photo of my dog' }));

// Real Tesseract output for a MyFitnessPal-style screenshot (385 kcal; 34g carbs, 12g fat, 36g protein),
// where the "g" in "12g" and "36g" was read as a 9.
const mfp = { name: 'Turkey Chili', servings: 6, kcal: 385, c: 34, f: 12, p: 36 };

test('sparse-mode OCR: column values and labels each on their own line, "g" misread as 9', () => check(
  '9:41\nRecipes\nEdit\nTurkey Chili\n6 servings\nNutrition per serving\n385\nCalories\n349\n129\n369g\nCarbs\nFat\nProtein\nIngredients\nGround turkey, 2 Ib\nKidney beans, 2 cans\n', mfp));

test('column-mode OCR with the same misreads', () => check(
  '9:41\nRecipes Edit\nTurkey Chili\n6 servings\nNutrition per serving\n385\nCalories\n349 12g 369\nCarbs Fat Protein\nIngredients\n', mfp));

test('a real value ending in 9 is kept when the calories add up', () =>
  assert.deepEqual(parseNutrition('Calories 271\nCarbs 19g\nFat 9g\nProtein 29g'), { name: '', kcal: 271, c: 19, f: 9, p: 29 }));

// Real MyFitnessPal "Add Meal" screenshot (dark mode): 840 cal; 43% 87 g carbs, 22% 19.6 g fat, 36% 73.4 g protein.
const real = require('./fixtures/mfp-add-meal-ocr.json');
const { caloriesNear } = require('../nutrition-parser.js');

test('real MFP screenshot (colors kept): "g" misreads fixed using the % of calories, calories estimated', () => {
  const r = parseNutrition(real.colorKept);
  assert.deepEqual({ c: r.c, f: r.f, p: r.p }, { c: 87, f: 19.6, p: 73.4 });
  assert.equal(r.kcal, 818); // 4×87 + 9×19.6 + 4×73.4, since the ring's 840 wasn't readable in this pass
  assert.equal(r.kcalEstimated, true);
  assert.equal(r.name, '');  // nothing on this screen is the meal's name; OCR noise like "HNIC" isn't used
});

test('real MFP screenshot (no preparation): "8749", "19.69", "7349" resolve to within half a gram', () => {
  // Without image preparation the reading is genuinely ambiguous (87 g and 87.4 g give the same % of calories),
  // so this pass only has to land within 0.5 g. The app prepares the image, which reads exactly (test above).
  const r = parseNutrition(real.original);
  for (const [k, want] of Object.entries({ c: 87, f: 19.6, p: 73.4 })) assert.ok(Math.abs(r[k] - want) <= 0.5, k + ': ' + r[k]);
});

test('second pass finds the real calories beside "cal", checked against the estimate', () => {
  assert.equal(caloriesNear(real.colorBlanked, 818), 840);
  assert.equal(caloriesNear(real.colorBlanked, 400), undefined); // nothing near "cal" fits 400, so nothing is guessed
});
