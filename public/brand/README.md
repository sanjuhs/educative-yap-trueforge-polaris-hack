# Yap logo

`yap-logo.svg` is the primary logo for the studio and repository. It uses vector
outlines, so it stays sharp at any size without requesting or installing a font.

The wordmark is based on DM Sans Bold (weight 700, optical size 14), set at 92 units
with -11 units of tracking on a 236 × 134 canvas. The letters are converted to
paths. DM Sans is available from [Google Fonts](https://fonts.google.com/specimen/DM+Sans)
under the SIL Open Font License.

The original palette is preserved: cream `#f6f5f0`, dark ink `#1d2723`, and green
`#879b50`. The upward arrow is a vector stroke. Keep the SVG self-contained when
editing it; do not embed a bitmap or depend on a live font.

The header, sign-in screen, favicon, and repository README use the SVG. The
showcase banner and mobile concept diagrams embed the same vector paths so they
also render without external fonts or images.

All PNGs are rendered from this SVG:

- `yap-social.png`: 1200 × 630 social preview, shared by Open Graph and Twitter.
- `yap-logo.png`: 472 × 268 compatibility copy.
- `../images/educative-yap-logo.png`: the same compatibility copy at the legacy URL.

Keep these derivatives in sync when changing the primary SVG.
