#!/usr/bin/env bash
# Regenerate the self-hosted font subsets (§6.4, a P1 performance requirement).
#
# Prerequisites:  pip install "fonttools[woff]" brotli
# Usage:          ./scripts/build-fonts.sh [path/to/InterVariable.ttf]
#
# Source: https://github.com/rsms/inter/releases — Inter, SIL Open Font License.
# The licence travels with the fonts in apps/web/public/fonts/LICENSE.txt.
set -euo pipefail

SRC="${1:-InterVariable.ttf}"
OUT="apps/web/public/fonts"

if [[ ! -f "$SRC" ]]; then
  echo "Source font not found: $SRC" >&2
  echo "Download Inter from https://github.com/rsms/inter/releases and pass the" >&2
  echo "path to InterVariable.ttf as the first argument." >&2
  exit 1
fi

# Subset by SCRIPT, not by the glyphs currently on screen. The pages render
# user-supplied hospital names and notes, so any Latin or Cyrillic character
# can appear — a subset built from observed text would break on real data.
#
# Macedonian is written in Cyrillic, so that subset is not optional. Ranges
# match the ones Google Fonts uses, which keeps the unicode-range declarations
# in tokens.css conventional and reviewable.
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
CYRILLIC="U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"

# Inter ships two axes: wght (100–900) and opsz (14–32, optical sizing).
# Pinning opsz to 14 — the value tuned for UI text, which is almost all of the
# text here — costs optical refinement on the largest headings and saves 25KB,
# 35% of the Latin file. §11 measures the budget on a mid-range Android over
# throttled 4G, where 25KB is worth more than that refinement. Remove the
# instancer step to get the axis back.
PINNED="$(mktemp -t inter-pinned).ttf"
python3 -m fontTools.varLib.instancer "$SRC" opsz=14 -o "$PINNED" > /dev/null
trap 'rm -f "$PINNED"' EXIT

subset() {
  local name="$1" ranges="$2"
  python3 -m fontTools.subset "$PINNED" \
    --unicodes="$ranges" \
    --flavor=woff2 \
    --with-zopfli \
    --output-file="$OUT/inter-$name.woff2" \
    `# tnum is NOT in fontTools' default retain list, and dropping it would` \
    `# silently break font-variant-numeric: tabular-nums — which §6.4 requires` \
    `# so counts and dates do not jitter as they update.` \
    --layout-features+=tnum,case
  echo "  $OUT/inter-$name.woff2  $(wc -c < "$OUT/inter-$name.woff2" | tr -d ' ') bytes"
}

echo "Subsetting $SRC"
subset latin "$LATIN"
subset cyrillic "$CYRILLIC"
echo "Done. Two files, which is the budget in §11."
