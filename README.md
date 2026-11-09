# Macro Tracker

A free calorie, macro and water tracker that runs in your phone's browser. Your diary stays on your device: there's no account, no server and no subscription.

## Features

- **Food diary**: Breakfast, Lunch, Dinner and Snacks, with a week strip to jump between days and "Copy yesterday" for repeat meals. Tap a meal name to expand or collapse it, and swipe a food left to remove it. Foods you often eat at that meal are listed first. Tap several saved foods or search results to add them together, each with its own servings, or use **Add another** to log foods one after another without closing the sheet.
- **Nutrition Facts summary**: calories left and % of goal for fat, carbs and protein.
- **Food search**: USDA FoodData Central for text searches, Open Food Facts for barcodes, plus camera barcode scanning.
- **My Foods and recipes**: everything you log is saved for quick re-use. **Recipes** (top of the diary) lists every recipe with its per-serving nutrition; tap one to view or edit it, or create a new one. Recipes show whole-recipe and per-serving totals as you build them.
- **Import recipes from screenshots**: in **Recipes → New recipe → Import from screenshot**, pick a screenshot from another app (e.g. MyFitnessPal). The text is read on your phone (nothing is uploaded), the name, servings and per-serving calories, protein, carbs and fat are filled in, and you check them before saving.
- **Goals**: calculated from your profile (Mifflin-St Jeor), with a lose/maintain/gain rate, goal weight and daily water goal.
- **Water tracker**: tap cups to log water.
- **Progress**: weight chart, daily logging streak, and 41 achievements (two of them secret).
- **Settings**: lbs/in or kg/cm, and backup export and restore.
- **Light and dark mode**: one tap on the sun/moon button. It follows your phone's setting until you tap it.
- **Works offline**: once opened, the app loads without a connection (food search still needs one), and updates arrive the next time you open it online.

## Run it locally

Open `index.html` in a browser. Everything works except the camera scanner, which browsers only allow on `https://` pages or `localhost`.

To test the scanner on your computer, serve the folder with Node.js:

```bash
node serve.js
```

Then open http://localhost:8123.

## Put it on your phone

1. Push this repository to GitHub.
2. In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", choose `main` and `/ (root)`, and save.
3. Open the `https://<your-username>.github.io/<repo-name>/` address on your phone.
4. Use **Share → Add to Home Screen** (iPhone) or **⋮ → Install app / Add to Home screen** (Android). It installs as "Macros" with its own icon and opens full screen.

## Your data

- Everything is saved in the browser's local storage on the device you use. Different browsers or devices don't share data.
- Clearing the browser's website data erases the diary. Use **Profile → Export backup** regularly, and **Restore from backup** to bring it back or move it to a new phone.
- Food searches send only the search text or barcode to USDA or Open Food Facts. A Content Security Policy blocks the app from sending data anywhere else.
- Exported backups leave out your USDA API key, so they're safe to share for troubleshooting (they do contain your diary).

## USDA API key

Text search uses USDA's shared `DEMO_KEY`, which allows only a small number of searches per hour. Get a free personal key at https://fdc.nal.usda.gov/api-key-signup and paste it into **Goals → USDA API key**.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure: diary screen, tabs, Goals and Profile screens, and pop-up sheets |
| `styles.css` | All styling, including light and dark themes |
| `app.js` | All app logic: diary, search, scanner, recipes, goals, streaks and achievements |
| `sw.js` | Service worker: offline support and update handling |
| `manifest.webmanifest`, `icon*` | Home-screen app name, icon and full-screen launch |
| `vendor/` | Barcode reader (MIT) and screenshot text reader (Tesseract, Apache-2.0), kept locally instead of loaded from a CDN; see `vendor/README.md` |
| `nutrition-parser.js` | Finds recipe name, servings and nutrition in text read from a screenshot; tested by `node --test test/nutrition-parser.test.js` |
| `serve.js` | Optional local web server for testing (`node serve.js`) |
