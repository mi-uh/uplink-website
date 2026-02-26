# UPLINK-WEBSITE

🌐 [uplink.michaeluhrich.xyz](https://uplink.michaeluhrich.xyz)

Static single-page website. Vanilla HTML/CSS/JS, no framework, no build step.

---

## Structure

```
public/
├── index.html          # App shell
├── css/                # Modular stylesheets (reset → layout → components → effects)
├── js/
│   ├── main.js         # Entry point (ES6 module)
│   ├── cold-open.js    # First-visit intro sequence
│   ├── core/           # EventBus, DataService
│   ├── services/       # EpisodeService, StatsService, StorageService
│   └── utils/          # dom, date, text, animation, performance
└── data/
    ├── config.json     # Project config, characters, scoring, story arc (versioned)
    ├── dialogs.json    # Episode content — updated externally, not versioned
    └── stats.json      # Current scores and metrics — updated externally, not versioned
```

## Local Development

No install needed. Serve `public/` with any static file server:

```bash
npx serve public
# or
python -m http.server 8080 --directory public
```

## License

Code: MIT — see [LICENSE](LICENSE)
Content: © 2026 Michael Uhrich, all rights reserved
