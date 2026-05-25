# FareCheck.SG — SimplyGo Concession Savings Calculator

See how much you save with your Singapore concession card versus adult fares, using your own SimplyGo Transit Statement PDF.

**100% private. Your PDF never leaves your browser.**

---

## Features

- Upload your SimplyGo Transit Statement PDF
- Instantly see journey-by-journey concession savings vs estimated adult fares
- Supports all concession card types: Student, Senior Citizen, Workfare, PWD, Adult (Money Saver)
- Pre-peak discount detection (train tap-in before 07:45 on weekdays)
- Express bus surcharge detection
- Zero outbound network requests after page load

## Privacy

See [PRIVACY.md](./PRIVACY.md) for full details.

**Short version:** your PDF and journey data never leave your browser. The only thing stored is your card type preference in `localStorage`.

## Tech stack

- React 18 + Vite + TypeScript
- Tailwind CSS
- pdfjs-dist (Mozilla PDF.js) for in-browser text extraction
- No backend, no analytics, no CDN at runtime
- Inter font bundled locally via @fontsource/inter

## Development

```bash
npm install
npm run dev        # Start dev server at http://localhost:5173
npm test           # Run unit tests
npm run build      # Build to dist/
npm run preview    # Preview built output
```

## Reference data

Static JSON files in `public/data/` contain fare tables and transport network data:

| File | Contents |
|------|----------|
| `fare-table.json` | Distance-based fare bands (effective 28 Dec 2024) |
| `bus-stops.json` | Bus stop codes and descriptions |
| `bus-routes.json` | Route stop sequences with cumulative distances |
| `mrt-distances.json` | Precomputed station-to-station distances |
| `express-services.json` | List of express bus service numbers |

To refresh bus stops and routes from LTA DataMall (requires API key):

```bash
npx tsx scripts/build-data.ts --key YOUR_LTA_API_KEY
```

Register for a free LTA DataMall API key at [datamall.lta.gov.sg](https://datamall.lta.gov.sg).

Fare tables and express service lists must be updated manually from:
- [PTC fare schedules](https://www.ptc.gov.sg)
- LTA bus operator route information

## Limitations

- Fare estimates are approximate. Journey distance is computed from reference data which may not reflect real-time route changes.
- Pass Usage journeys are charged $0 and shown separately from paid fares.
- Journeys with unrecognised stop names are flagged as "Unpriced" (shown with a ⚠ indicator).
- The parser is calibrated for the SimplyGo Transit Statement PDF format as of 2025–2026. Other formats may not parse correctly.

## Disclaimer

This tool is not affiliated with, endorsed by, or connected to SimplyGo, TransitLink Pte Ltd, the Land Transport Authority (LTA), the Public Transport Council (PTC), or any Singapore government agency. Fare estimates are calculated from publicly available data and may differ from official fares due to data lag, edge cases, or fare structure changes. Use for personal informational purposes only.

## Security

See [SECURITY.md](./SECURITY.md) for the responsible disclosure policy.

## License

[MIT](./LICENSE)
