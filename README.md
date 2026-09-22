# TourSplit

A mobile-friendly tour expense splitter dashboard built with plain HTML, CSS, and JavaScript. It runs entirely in the browser and stores data in `localStorage`, so it requires no backend or build step.

## Features

- Create and edit a tour with dates and description
- Add, edit, and delete tour members
- Add, edit, and delete expenses with payer, category, date, and amount
- Dashboard totals, member count, expense count, average spend, and balances
- Responsive layout designed for mobile devices
- Print-friendly report using the browser print dialog

## Run locally

Open `index.html` in a browser. For local development, any static server works, for example:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save. GitHub will publish `index.html` as the site entry point.
