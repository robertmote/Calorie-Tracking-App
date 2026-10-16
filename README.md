# Macro Tracker

A free calorie, macro and water tracker that runs in your phone's browser. Your diary stays on your device: there's no account, no server and no subscription.

## Features

- **Food diary**: Breakfast, Lunch, Dinner and Snacks, with a week strip to jump between days and "Copy yesterday" for repeat meals.
- **Nutrition Facts summary**: calories left and % of goal for fat, carbs and protein.
- **Food search**: USDA FoodData Central for text searches, Open Food Facts for barcodes, plus camera barcode scanning.
- **My Foods and recipes**: everything you log is saved for quick re-use. Recipes calculate per-serving nutrition and can be edited later.
- **Goals**: calculated from your profile (Mifflin-St Jeor), with a lose/maintain/gain rate, goal weight and daily water goal.
- **Water tracker**: tap cups to log water.
- **Progress**: weight chart, daily logging streak, and 41 achievements (two of them secret).
- **Settings**: lbs/in or kg/cm, light/dark/auto appearance, and backup export and restore.

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
4. Use **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android) so it opens like an app.

## Your data

- Everything is saved in the browser's local storage on the device you use. Different browsers or devices don't share data.
- Clearing the browser's website data erases the diary. Use **Profile → Export backup** regularly, and **Restore from backup** to bring it back or move it to a new phone.
- Food searches send only the search text or barcode to USDA or Open Food Facts.

## USDA API key

Text search uses USDA's shared `DEMO_KEY`, which allows only a small number of searches per hour. Get a free personal key at https://fdc.nal.usda.gov/api-key-signup and paste it into **Goals → USDA API key**.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure: diary screen, tabs, Goals and Profile screens, and pop-up sheets |
| `styles.css` | All styling, including light and dark themes |
| `app.js` | All app logic: diary, search, scanner, recipes, goals, streaks and achievements |
| `serve.js` | Optional local web server for testing (`node serve.js`) |
