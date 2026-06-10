#!/usr/bin/env bash
# Descarrega áudio de cada vídeo YouTube listado no manifest.json.
# Uso: download-audio.sh [NUM] [NUM2] [--force]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

FORCE=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      cat <<'EOF'
Uso: download-audio.sh [NUM] [NUM2] [--force]

Descarrega source.wav do YouTube para cada faixa do manifest.json.

  download-audio.sh           # todas as faixas
  download-audio.sh 1         # só faixa 01
  download-audio.sh 2 5       # faixas 02 a 05
  download-audio.sh 1 --force # re-baixa mesmo se source existir

Requer: yt-dlp, ffmpeg
EOF
      exit 0
      ;;
    *) ARGS+=("$arg") ;;
  esac
done

if [[ ${#ARGS[@]} -eq 0 ]]; then
  START_NUM=1
  END_NUM=999
elif [[ ${#ARGS[@]} -eq 1 ]]; then
  START_NUM="${ARGS[0]}"
  END_NUM="${ARGS[0]}"
else
  START_NUM="${ARGS[0]}"
  END_NUM="${ARGS[1]}"
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp não encontrado. Instale com: brew install yt-dlp"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg não encontrado. Instale com: brew install ffmpeg"
  exit 1
fi

python3 - "$START_NUM" "$END_NUM" "$FORCE" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

start_num = int(sys.argv[1])
end_num = int(sys.argv[2])
force = bool(int(sys.argv[3]))

manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))

def duration_ok(path: Path) -> bool:
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        return float(out) > 30
    except (subprocess.CalledProcessError, ValueError):
        return False

for track in manifest["tracks"]:
    num = track["num"]
    if num < start_num or num > end_num:
        continue

    folder = Path(track["folder"])
    folder.mkdir(parents=True, exist_ok=True)
    url = track["youtube_url"]
    out_wav = folder / "source.wav"
    meta_path = folder / "meta.json"

    if out_wav.exists() and not force:
        if duration_ok(out_wav):
            print(f"  skip #{num:02d} {track['title']} (source já existe)")
        else:
            print(f"  ⚠ #{num:02d} source.wav inválido — re-baixando")
            out_wav.unlink()
            force = True

    if not out_wav.exists() or force:
        if out_wav.exists() and force:
            out_wav.unlink()
        print(f"==> #{num:02d} {track['title']}")
        tmp = folder / "_download"
        for old in folder.glob("_download.*"):
            old.unlink()
        subprocess.run(
            ["yt-dlp", "-x", "--audio-format", "wav", "--audio-quality", "0",
             "-o", str(tmp), url],
            check=True,
        )
        downloaded = next(folder.glob("_download.*"))
        downloaded.rename(out_wav)
        dur = duration_ok(out_wav)
        print(f"    → {out_wav}" + (f" ({subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(out_wav)], text=True).strip()}s)" if dur else " [AVISO: duração < 30s]"))

    meta = {
        "youtube_id": track["youtube_id"],
        "youtube_url": track["youtube_url"],
        "offset_sec": track.get("offset_sec", 0),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("==> Próximo passo: ./separate-stems.sh && ./prepare-repo.sh")
PY
