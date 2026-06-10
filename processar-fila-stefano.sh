#!/usr/bin/env bash
# Orquestra download → separação → MP3 para a fila Stefano.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG="$SCRIPT_DIR/ultimo-run-fila-stefano.log"
FILA="$SCRIPT_DIR/fila-extracao-stefano.md"

START_NUM="${1:-1}"
END_NUM="${2:-26}"

mark_done() {
  local num="$1"
  local padded
  padded=$(printf "%02d" "$num")
  sed -i '' "s/| ${padded} | ⏳ pendente |/| ${padded} | ✅ feito |/" "$FILA" 2>/dev/null || true
}

is_done() {
  local num="$1"
  local folder
  folder=$(python3 - "$num" <<'PY'
import json, sys
from pathlib import Path
num = int(sys.argv[1])
m = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
for t in m["tracks"]:
    if t["num"] == num:
        print(t["folder"])
        break
PY
)
  [[ -n "$folder" && -f "$folder/vocals.mp3" && -f "$folder/guitar.mp3" ]]
}

{
  echo "=== Fila Stefano — $(date) — faixas ${START_NUM}–${END_NUM} ==="

  for num in $(seq "$START_NUM" "$END_NUM"); do
    title=$(python3 - "$num" <<'PY'
import json, sys
from pathlib import Path
num = int(sys.argv[1])
m = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
for t in m["tracks"]:
    if t["num"] == num:
        print(t["title"])
        break
PY
)

    if is_done "$num"; then
      mark_done "$num"
      echo "→ [#$(printf '%02d' "$num")] $title — já completo, pulando"
      continue
    fi

    echo
    echo "→ [#$(printf '%02d' "$num")] $title"

    folder=$(python3 - "$num" <<'PY'
import json, sys
from pathlib import Path
num = int(sys.argv[1])
m = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
for t in m["tracks"]:
    if t["num"] == num:
        print(t["folder"])
        break
PY
)

    if [[ ! -f "$folder/source.wav" ]]; then
      echo "  download…"
      ./download-audio.sh "$num" || { echo "  ❌ download falhou"; exit 1; }
    fi

    if [[ ! -f "$folder/vocals.wav" || ! -f "$folder/guitar.wav" ]]; then
      echo "  separação Demucs…"
      ./separate-stems.sh "$num" || { echo "  ❌ separação falhou"; exit 1; }
    fi

    echo "  prepare-repo…"
    ./prepare-repo.sh

    if is_done "$num"; then
      mark_done "$num"
      echo "  ✅ concluído"
    else
      echo "  ❌ MP3s não gerados"
      exit 1
    fi
  done

  echo
  echo "=== Fila ${START_NUM}–${END_NUM} concluída — $(date) ==="
} 2>&1 | tee -a "$LOG"
