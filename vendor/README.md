# Vendored third-party code

Kept in the repository instead of loaded from a CDN, so no outside code runs in the app (the Content Security
Policy in `index.html` only allows this site's own scripts) and everything works offline after first use.
Both are loaded only when needed, and the service worker (`sw.js`) saves each file the first time it's used.

**After changing anything in this folder, bump `VENDOR_CACHE` in `sw.js`** (e.g. `macro-tracker-vendor-1` →
`-2`), or phones will keep using their saved copies.

## Barcode reader

Used by the camera scanner on phones without a built-in barcode reader (e.g. iPhone). MIT licensed; licenses in each folder.

| File | Source | Check |
| --- | --- | --- |
| `barcode-detector/ponyfill.js`, `barcode-detector/zxing-exported.js` | npm `barcode-detector@3.2.2`, `dist/es/` | package integrity `sha512-/4QOrrNrCRmDSBWiiP4aC72dnkuXUEdcFRidHgbPRXUpy82XcCMvJssI6fEs6JT42LS7DvBVZO70qasJbYKyrA==` |
| `zxing-wasm/zxing_reader.wasm` | npm `zxing-wasm@3.1.3`, `dist/reader/` | SHA-256 `2ebda08a93eea3efcd8399cda6b276e6a0b1de4fec60b4d8988a047de4c6d1ba` (matches `ZXING_WASM_SHA256` in `zxing-exported.js`) |

To update: `npm pack barcode-detector@<version>` and the `zxing-wasm` version it pins in its `package.json`
(npm checks each download against its published integrity hash), copy the files above, confirm the `.wasm`
SHA-256 equals `ZXING_WASM_SHA256` in `zxing-exported.js`, and update the versions here and above `getDetector()` in `app.js`.

## Screenshot text reader (Tesseract)

Used by **New recipe → Import from screenshot** to read text from an image on the phone. Apache-2.0 licensed
(`LICENSE.md`, `core/LICENSE`); the English model is from `@tesseract.js-data/eng` (MIT package of Google's
Apache-2.0 tessdata). About 7 MB is downloaded on first use: the library, one engine build and the language model.

| File | Source | SHA-256 |
| --- | --- | --- |
| `tesseract/tesseract.esm.min.js` | npm `tesseract.js@7.0.0`, `dist/` | `64871d76c75609fd5413b88a8171e2ef40deedd77d5875ba23df104b2d05eb29` |
| `tesseract/worker.min.js` | npm `tesseract.js@7.0.0`, `dist/` | `576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d` |
| `tesseract/core/tesseract-core-simd-lstm.wasm.js` (phones from the last few years) | npm `tesseract.js-core@7.0.0` | `c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38` |
| `tesseract/core/tesseract-core-lstm.wasm.js` (older phones without WebAssembly SIMD) | npm `tesseract.js-core@7.0.0` | `eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680` |
| `tesseract/lang/eng.traineddata.gz` | npm `@tesseract.js-data/eng@1.0.0`, `4.0.0_best_int/` | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` |

Package integrity (checked by `npm pack`): `tesseract.js@7.0.0` `sha512-exPBkd+z+wM1BuMkx/Bjv43OeLBxhL5kKWsz/9JY+DXcXdiBjiAch0V49QR3oAJqCaL5qURE0vx9Eo+G5YE7mA==`,
`tesseract.js-core@7.0.0` `sha512-WnNH518NzmbSq9zgTPeoF8c+xmilS8rFIl1YKbk/ptuuc7p6cLNELNuPAzcmsYw450ca6bLa8j3t0VAtq435Vw==`,
`@tesseract.js-data/eng@1.0.0` `sha512-mbTumm6KQPUHyzTPQaF3ObXYnx0SqqfV2nabqFVQBwD6Kl7PhGSLSzOlfFTWy0P3BjghaSKA2W9GB19Jk+ZcTg==`.

To update: `npm pack` the three packages (the core version must match the range `tesseract.js` depends on),
copy the files above, record the new hashes here, and update the versions in the comment above `textReader()` in `app.js`.
The paths are set in `textReader()`; `workerBlobURL: false` keeps the worker loading from its file so the
Content Security Policy doesn't need to allow `blob:` scripts.
