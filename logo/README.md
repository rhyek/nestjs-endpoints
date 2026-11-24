# nestjs-endpoints' icon

A folder tree of three rows on a dark rounded tile. The last row is a route, in red, with a
request arriving at it, the grey arrow.

| File | What it is | Used by |
| --- | --- | --- |
| `logo.svg` | The icon. | The site's home page, beside the name; the source of the touch icon and the link preview. |
| `logo-small.svg` | The icon for small sizes: its arrow drawn thicker, its head thinner than the stem, and the mark scaled to 88% about the tile's center for more room to the edge. | The site's browser tab and nav bar; the source of the favicon. |
| `site/favicon-32.png` | 32 px, from `logo-small.svg`. | The browser tab, where it can't take an SVG. |
| `site/apple-touch-icon.png` | 180 px, square, from `logo.svg`. | An iPhone's home-screen bookmark, which rounds it. |
| `site/og-image.png` | 512 px, square, from `logo.svg`. | A link's preview (Slack, X, …), which rounds it. |

## The drawing

- **The mark is centered in the tile:** its left and right margins are equal, and so are its top
  and bottom ones.
- **The arrow is as far from the row above it as from the route.**
- **The tile's corners are a circular arc:** `rx` 13 in `logo.svg`, 15 in `logo-small.svg`.
- **The shadow is the site's**, not the file's: `filter: drop-shadow()` on the `<img>`, which follows
  the tile's shape (a `border-radius` on the `<img>` would clip it to a circular arc instead).
- **Colors:** the tile `#18181b`, the rows `#e4e4e7`, the route `#f0456c`, the arrow `#94a3b8`.

A change to the icon is a change to both SVGs and to the three PNGs, in the same change.

## The site's files

VitePress only serves files from `docs/public/`, so each file the site uses has a relative
symlink there, under the name its URL uses (`docs/public/logo.svg` → `../../logo/logo.svg`). A new
file the site needs gets one too. They are wired in `docs/.vitepress/config.ts`: `head` for the
browser tab, the touch icon and the link preview, and `themeConfig.logo` for the nav bar. Every
URL to them carries a hash of the file (`versioned()` there), so a changed icon is a new URL. The
home page's hero (`docs/.vitepress/theme/home/HomeHero.vue`) imports `logo.svg` from here directly.

## Rendering the PNGs

With `rsvg-convert` (librsvg). The touch icon and the preview are rendered from `logo.svg` with
the tile's corners squared, by removing `rx="13"` from the tile's `<rect>` in a copy:

```bash
rsvg-convert -w 32 -h 32 logo/logo-small.svg -o logo/site/favicon-32.png
sed 's/rx="13" fill="#18181b"/fill="#18181b"/' logo/logo.svg > /tmp/logo-square.svg
rsvg-convert -w 180 -h 180 /tmp/logo-square.svg -o logo/site/apple-touch-icon.png
rsvg-convert -w 512 -h 512 /tmp/logo-square.svg -o logo/site/og-image.png
```
