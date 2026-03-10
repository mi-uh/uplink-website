# Security Best Practices Report

## Executive Summary
The codebase already applies escaping in many rendering paths and avoids obvious sinks like `eval`.  
The main risk is in maintenance-mode protection: current client-side XOR obfuscation is cryptographically broken for this use case and should not be treated as access control.

## Critical Severity

### SBP-001: Maintenance protected content can be decrypted without passphrase (known-plaintext key recovery)
- Severity: Critical
- Location: `scripts/build_static_pages.py:303-317`, `public/js/main.js:1145-1158`
- Evidence:
  - Builder encrypts with repeating-key XOR (`xor_encrypt_to_base64`) using SHA-256 bytes as key.
  - Browser decrypts by XOR with known prefix check (`UPLINK-PROTECTED::{page}::`).
  - With predictable HTML start (`<section...`), first 32 plaintext bytes are known, which reveals the full 32-byte key stream for one cycle.
- Impact:
  - Attackers can recover the key bytes from ciphertext and decrypt `protected_content` offline.
  - Maintenance mode no longer provides confidentiality for withheld page content.
- Recommended fix:
  - Do not ship protected page content to unauthenticated clients.
  - Enforce maintenance access server-side (e.g., reverse-proxy auth/basic auth/IP allowlist/session auth).
  - Remove XOR protection path (`protected_content`) once server-side gating is in place.

## Medium Severity

### SBP-002: JSON-LD script blocks are not hardened against `</script>` breakout
- Severity: Medium
- Location: `scripts/build_static_pages.py:1097-1135`
- Evidence:
  - JSON-LD is inserted into `<script type="application/ld+json">` using `json.dumps(...)` without script-context hardening.
  - Runtime JSON already uses `.replace("</", "<\\/")`, but JSON-LD does not.
- Impact:
  - If content fields ever contain `</script>`, script-context breakouts are possible.
- Recommended fix:
  - Apply the same hardening to all JSON-LD payloads:
    - `json.dumps(..., ensure_ascii=False).replace("</", "<\\/")`

### SBP-003: Config-driven values are inserted into `innerHTML` without escaping in multiple UI paths
- Severity: Medium
- Location: `public/js/main.js:264`, `public/js/main.js:435`, `public/js/main.js:471`, `public/js/main.js:483`, `public/js/main.js:504`, `public/js/main.js:510`, `public/js/main.js:866`
- Evidence:
  - Several `config`/`stats` fields (labels, icons, phase labels) are interpolated directly into HTML templates.
- Impact:
  - Stored XSS risk if upstream JSON content is ever tainted (CI pipeline compromise, accidental unsafe content injection).
- Recommended fix:
  - Wrap all string interpolations that originate from data files with `escapeHtml(...)`.
  - Prefer `textContent` when dynamic HTML markup is not required.

## Low Severity

### SBP-004: Maintenance overlay can be suppressed via URL/session flag
- Severity: Low
- Location: `public/js/main.js:1178-1183`
- Evidence:
  - `?maintenance=off` sets `sessionStorage` flag and returns before gate rendering.
- Impact:
  - Bypasses overlay UX, which can confuse operator expectations.
  - This does not restore encrypted content by itself, but weakens gate consistency.
- Recommended fix:
  - Remove in production, or guard behind explicit development flag.

### SBP-005: Third-party analytics script is loaded remotely without integrity control
- Severity: Low
- Location: `public/js/vendor/matomo.js:11-14`
- Evidence:
  - Dynamic external script load from `https://stats.michaeluhrich.xyz/matomo.js`.
- Impact:
  - Supply-chain exposure if analytics host/script is compromised.
- Recommended fix:
  - Prefer self-hosting analytics JS under your deployment domain and strict CSP allowlists.

## Open Questions / Verification Needed
- Runtime headers (CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) are not configured in this repository.
- Verify live response headers directly on the deployed origin.
