# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Reporting a vulnerability

Please report security vulnerabilities by **opening a GitHub Issue** with the label `security`.

For sensitive disclosures (e.g. a vulnerability that could affect other users), email the maintainer directly (see README for contact).

We aim to acknowledge reports within **48 hours** and provide a fix or mitigation within **14 days** for confirmed issues.

## Scope

### In-scope

- XSS vulnerabilities in PDF text extraction or rendering
- Content Security Policy bypasses
- Malicious PDF files that cause unintended code execution in the browser
- Privacy violations (data exfiltration, unexpected network requests)
- Dependency vulnerabilities with a credible exploit path

### Out-of-scope

- Denial of service via crafted PDFs (the app has no server to DOS)
- Social engineering attacks
- Physical access attacks
- Vulnerabilities in third-party services (GitHub Pages, Cloudflare Pages)
- Issues requiring physical access to the user's device
- Fare calculation inaccuracies (these are estimation errors, not security issues — please report them as bugs instead)

## Architecture notes for security reviewers

FareCheck.SG is a fully static single-page application:

- **No server-side code** — there is no backend to attack
- **No user accounts** — no authentication surface
- **No persistent data** — PDF bytes and journey data exist only in browser memory
- **No network requests at runtime** — the app fetches only `/data/*.json` files from the same origin at startup
- **No `eval()` or dynamic script loading** — pdfjs-dist is bundled, not loaded from CDN

The primary attack surface is:
1. Malicious PDF files — mitigated by pdfjs-dist's sandboxed rendering
2. XSS via extracted PDF text — mitigated by React's default output escaping
3. Supply chain attacks via npm dependencies — mitigated by lockfile and `npm audit`

## Content Security Policy

The deployed app should include the following `Content-Security-Policy` header:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data:;
connect-src 'none';
object-src 'none';
base-uri 'self';
form-action 'none';
```

`wasm-unsafe-eval` is required for pdfjs-dist's WebAssembly decoder.
`unsafe-inline` for styles is required by Tailwind CSS's generated stylesheet.
`connect-src 'none'` enforces the zero-outbound-request privacy guarantee at the browser level.
