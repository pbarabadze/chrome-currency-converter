# chrome-currency-converter

Chrome extension that detects and converts prices on any website, appending converted values as inline badges next to the originals.

![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)

## How it works

1. Open the extension popup and set your **from/to currencies**
2. Click **Pick price element**, then click any price on the page
3. The extension detects similar elements using CSS selector inference and highlights them
4. Refine the selector if needed, then **Save rule**
5. On every future visit to that domain, prices are automatically converted

Converted values appear as blue badges next to the original price — the original is never modified.

```
$29.99  [≈ ₾81.45]
```

Hovering a badge shows the exact rate used and the original value.

## Features

- Works on any website — no hardcoded site support
- Per-domain rules saved to `chrome.storage.sync` (synced across your Chrome profile)
- Live exchange rates via [exchangerate-api.com](https://www.exchangerate-api.com), cached for 1 hour
- Handles both US (`1,000.50`) and European (`1.000,50`) number formats
- 30 supported currencies
- Manual selector refinement with live preview

## Installation

### From source

1. Clone the repo
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the repo folder

### Chrome Web Store

Not published yet.

## Stack

- Manifest V3
- Vanilla JS (no build step, no dependencies)
- `chrome.storage.sync` for rules and settings
- `chrome.storage.local` for rate cache

## License

MIT
