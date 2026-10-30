# Third-party notices

The root MIT license covers this project's original code. It does not replace the following licenses or upstream copyright notices.

| Component | License / retained notice |
| --- | --- |
| OpenAI Sites Vite integration | MIT, `build/sites-vite-plugin.LICENSE` |
| Tesseract.js / tesseract.js-core | Apache-2.0, `public/vendor/body-ocr/TESSERACT-LICENSE.txt`, `CORE-LICENSE.txt` and generated bundle notices |
| Chinese and English OCR model assets | Apache-2.0 as declared by the fixed upstream npm packages; `public/vendor/body-ocr/NOTICE.md` |
| PulsHealth SQLite receiver | Apache-2.0, `mac-bridge/vendor/PulsHealth-LICENSE` and `NOTICE.md` |
| Nayuki QR Code generator | MIT copyright/license retained in `mac-bridge/vendor/qrcodegen.py` |
| Vendored shadcn stylesheet | `vendor/shadcn-tailwind-4.13.0.LICENSE.md` |

OCR asset hashes and sources are recorded in `public/vendor/body-ocr/SHA256SUMS.json` and `NOTICE.md`. Other npm dependencies retain their respective upstream licenses and are installed separately; they are pinned by `package-lock.json` and not redistributed as `node_modules`.
