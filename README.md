# Kaarigar · AI concierge commerce (concept)

A handicraft store concept with two modes behind one toggle:

- **AI Concierge on:** describe what you want in plain words, or take a 4-question quiz. The concierge shows what it understood (craft, colour, room, occasion, budget), ranks every piece with plain-language reasons, and keeps learning from what you hover, open, like and add. The list re-ranks live and the wheel throws your top match.
- **AI Concierge off:** a classic catalogue with filters, sort and search. Nothing is personalised.

The 3D is a potter's studio: a wheel under a spotlight, shelves of pottery in the bokeh behind. Each chapter has its own camera move scrubbed by scroll. Pieces are lathe-turned models with craft finishes painted in code (Jaipur blue pottery, Dhokra brass, Bankura terracotta, Channapatna lacquer, Nizamabad black pottery, Agra marble inlay, block-print and kantha textiles). The same models render every product photograph in the shop.

Placeholder brand and catalogue. The concierge here is an on-device matcher; production would use a language model, product embeddings and consented behaviour data.

## Build and run

The page loads one minified bundle, `dist/app.min.js` (three.js included), so it is a single request.

```
npm install
npm run build                      # rebuild dist/app.min.js after editing app.js, studio.js or catalog.js
python3 -m http.server 8766        # open http://localhost:8766/
```

Product photos (`assets/p/*.webp`) and the poster shown while the 3D boots (`assets/poster.jpg`) are rendered from the same 3D models by `tools/render.html` + `tools/render.js`; re-run it after changing the catalogue or finishes.

## Performance

- Quality tier from the GPU: film (depth of field, MSAA, 2k shadows) on Apple Silicon and modern discrete GPUs; balanced on phones and recent integrated graphics; light on older or unknown laptops (no post-processing, fewer shelf pieces).
- If the frame rate falls under ~42 fps after the intro, it steps down a tier automatically.
- Force a tier with `?q=0`, `?q=1` or `?q=2`; add `?debug` for an fps and tier readout.
