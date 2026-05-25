# Privacy Policy

**FareCheck.SG — SimplyGo Concession Savings Calculator**

## What this tool processes

When you upload a SimplyGo Transit Statement PDF, the following happens:

1. Your browser reads the PDF file using the standard `FileReader` / `ArrayBuffer` API.
2. The PDF bytes are passed to [pdfjs-dist](https://github.com/mozilla/pdf.js), a local JavaScript library bundled with the app.
3. Text is extracted in-memory, structured into a `Statement` object, and displayed in your browser.
4. The extracted text and your PDF bytes are **never transmitted anywhere** — they exist only in your browser's JavaScript heap and are discarded when you close the tab or click "New upload".

## What data is processed

| Data                   | Where               | Duration                         |
| ---------------------- | ------------------- | -------------------------------- |
| PDF bytes              | Browser memory only | Until page close or "New upload" |
| Extracted journey text | Browser memory only | Until page close or "New upload" |
| Fare estimates         | Browser memory only | Until page close or "New upload" |

## What is stored

Only one item is written to `localStorage`:

| Key                   | Value                               | Purpose                                  |
| --------------------- | ----------------------------------- | ---------------------------------------- |
| `farecheck_card_type` | Card type string (e.g. `"STUDENT"`) | Remember your card type between sessions |

This is a functional preference, not personal data. It contains no name, card number, journey data, or any other information from your PDF.

## What is NOT stored, transmitted, or logged

- Your PDF file
- Your name or NRIC
- Your SimplyGo card number
- Your journey history
- Your tap-in/tap-out stop names
- Any analytics events
- Any error traces containing personal data

## How to verify

Open **DevTools → Network** tab before uploading your PDF. You should see:

- Initial page load: requests for the app bundle, CSS, fonts, and `/data/*.json` reference files.
- After upload: **zero outbound requests**.

All processing happens in the JavaScript running on your device.

## Third-party libraries

- **pdfjs-dist** (Mozilla): runs entirely in your browser, makes no network requests
- **@fontsource/inter**: fonts are bundled locally, no CDN is used
- **Tailwind CSS**: build-time only, no runtime scripts

No analytics, error tracking, or telemetry libraries are included.

## Contact

For privacy concerns, open an issue [here](https://github.com/jaey8den/concession-fare-checker/issues) or email the maintainer [here](89349331+jaey8den@users.noreply.github.com).
