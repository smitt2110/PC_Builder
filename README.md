# CoreForge 3D

CoreForge 3D is a browser-based PC building studio. Browse a component catalog, assemble a custom PC, and explore the build in an interactive 3D preview.

## Features

- Browse and search graphics cards, processors, motherboards, memory, storage, power supplies, cases, and cooling fans.
- Add and remove parts, then see the estimated build total in Indian rupees.
- Generate a suggested build for a budget using the available catalog.
- Orbit and zoom the 3D preview, inspect an exploded view, and adjust RGB lighting.
- Add cooling fans, reset the camera, and save a screenshot of the preview.
- Estimate gaming frame rates using the selected graphics card or another card in the catalog.

## Run locally

1. Download or clone this project.
2. Open `index.html` in a modern browser, or use a local development server such as VS Code Live Server.
3. Keep `index.html`, `app.js`, `components_db.js`, and `style.css` together in the same folder.

The 3D preview uses Three.js, loaded from a CDN, so an internet connection is needed for that library.

## Project files

- `index.html` — page structure and dialogs
- `style.css` — layout and visual styling
- `app.js` — component selection, build logic, and 3D preview
- `components_db.js` — component catalog and price snapshots

## Notes

Component prices are catalog snapshots, not live quotes. Availability and prices may change. Compatibility checks and frame-rate estimates are intended as guides; verify component specifications and compatibility with the manufacturer before purchasing.
