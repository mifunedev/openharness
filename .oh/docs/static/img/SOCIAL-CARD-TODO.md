# Social Card PNG Generation Required

The `social-card.svg` file has been created, but PNG generation tooling (ImageMagick, librsvg, or similar) is not available in the current environment.

To generate the PNG from the SVG, run the following command:

```bash
convert -size 1200x630 xc:'#0b1220' \
  -fill '#f1f5fb' -gravity center -font DejaVu-Sans-Bold -pointsize 110 -annotate +0-40 'Open Harness' \
  -fill '#92a0b6' -font DejaVu-Sans -pointsize 36 -annotate +0+80 'A Docker sandbox for Claude, Codex, OpenCode, or Pi.' \
  -fill '#4e9af1' -draw 'rectangle 0,618 1200,630' \
  packages/docs/static/img/social-card.png
```

Alternatively, if you have `rsvg-convert` installed:

```bash
rsvg-convert -w 1200 -h 630 packages/docs/static/img/social-card.svg -o packages/docs/static/img/social-card.png
```

Or use any online SVG-to-PNG converter with the `social-card.svg` file as input.
