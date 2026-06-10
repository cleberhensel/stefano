#!/usr/bin/env bash
# Separa voz e violão de source.wav em cada pasta de faixa (Demucs 2 passos).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

VOCALS_MODEL="htdemucs"
GUITAR_MODEL="htdemucs_6s"
GUITAR_SHIFTS="${DEMUCS_GUITAR_SHIFTS:-4}"
DEMUCS_OUT="_demucs_out"

usage() {
  cat <<EOF
Uso: separate-stems.sh [NUM] [NUM2]
     separate-stems.sh           # todas as faixas do manifest

Separa voz e violão a partir de source.wav em cada pasta:

  1. htdemucs --two-stems=vocals   → vocals.wav
  2. htdemucs_6s --two-stems=guitar (shifts=$GUITAR_SHIFTS) → guitar.wav

Variáveis:
  DEMUCS_GUITAR_SHIFTS=4   # qualidade do violão (padrão: 4)

Dependências: demucs, ffmpeg
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Erro: '$1' não encontrado." >&2
    exit 1
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd demucs
require_cmd ffmpeg

START_NUM="${1:-1}"
END_NUM="${2:-999}"

python3 - "$START_NUM" "$END_NUM" "$VOCALS_MODEL" "$GUITAR_MODEL" "$GUITAR_SHIFTS" "$DEMUCS_OUT" <<'PY'
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

start_num = int(sys.argv[1])
end_num = int(sys.argv[2])
vocals_model = sys.argv[3]
guitar_model = sys.argv[4]
guitar_shifts = sys.argv[5]
demucs_out = sys.argv[6]

root = Path(".")
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))

def stem_folder_name(source_wav: Path) -> str:
    return source_wav.stem

def run_demucs(model: str, two_stems: str, shifts: str | None, source: Path, out_dir: Path) -> None:
    cmd = ["demucs", "-n", model, "--two-stems", two_stems, "-o", str(out_dir), str(source)]
    if shifts is not None:
        cmd = ["demucs", "-n", model, "--shifts", shifts, "--two-stems", two_stems, "-o", str(out_dir), str(source)]
    subprocess.run(cmd, check=True)

for track in manifest["tracks"]:
    num = track["num"]
    if num < start_num or num > end_num:
        continue

    folder = root / track["folder"]
    source = folder / "source.wav"
    vocals_out = folder / "vocals.wav"
    guitar_out = folder / "guitar.wav"

    if vocals_out.exists() and guitar_out.exists():
        print(f"  skip #{num:02d} {track['title']} (stems já existem)")
        continue

    if not source.exists():
        print(f"  skip #{num:02d} {track['title']} (source.wav ausente — corra download-audio.sh)")
        continue

    print(f"==> #{num:02d} {track['title']}")
    work = folder / demucs_out
    if work.exists():
        shutil.rmtree(work)

    stem_name = stem_folder_name(source)
    vocals_path = work / vocals_model / stem_name
    guitar_path = work / guitar_model / stem_name

    if not vocals_out.exists():
        print(f"    [1/2] voz ({vocals_model})…")
        run_demucs(vocals_model, "vocals", None, source, work)
        src = vocals_path / "vocals.wav"
        if not src.exists():
            print(f"    Erro: vocals.wav não gerado em {src}", file=sys.stderr)
            sys.exit(1)
        shutil.copy2(src, vocals_out)
        print(f"    → {vocals_out}")

    if not guitar_out.exists():
        print(f"    [2/2] violão ({guitar_model}, shifts={guitar_shifts})…")
        run_demucs(guitar_model, "guitar", guitar_shifts, source, work)
        src = guitar_path / "guitar.wav"
        if not src.exists():
            print(f"    Erro: guitar.wav não gerado em {src}", file=sys.stderr)
            sys.exit(1)
        shutil.copy2(src, guitar_out)
        print(f"    → {guitar_out}")

    if work.exists():
        shutil.rmtree(work)

    for stem in (vocals_out, guitar_out):
        dur = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(stem)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        print(f"    duração {stem.name}: {float(dur):.1f}s")

print("==> Separação concluída. Próximo: ./prepare-repo.sh")
PY
