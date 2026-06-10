#!/usr/bin/env bash
# Converte stems para MP3 e regenera manifest.json (preserva campos YouTube).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg não encontrado. Instale com: brew install ffmpeg"
  exit 1
fi

echo "==> Convertendo vocals.wav e guitar.wav para MP3…"
for dir in */; do
  [ -d "$dir" ] || continue
  for stem in vocals guitar; do
    wav="${dir}${stem}.wav"
    mp3="${dir}${stem}.mp3"
    if [ -f "$wav" ]; then
      if [ -f "$mp3" ]; then
        echo "  skip ${mp3} (já existe)"
      else
        echo "  ffmpeg ${wav}"
        ffmpeg -y -hide_banner -loglevel error -i "$wav" \
          -codec:a libmp3lame -qscale:a 2 "$mp3"
      fi
    fi
  done
done

echo "==> Atualizando manifest.json…"
python3 - <<'PY'
import json
import subprocess
from pathlib import Path

def mp3_duration(path: Path) -> float | None:
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return round(float(out), 2)
    except (subprocess.CalledProcessError, ValueError):
        return None

root = Path(".")
manifest_path = root / "manifest.json"
base = json.loads(manifest_path.read_text(encoding="utf-8"))
tracks = []

for prev in sorted(base.get("tracks", []), key=lambda t: t.get("num", 999)):
    folder = root / prev["folder"]
    entry = dict(prev)
    if not folder.is_dir():
        tracks.append(entry)
        continue

    vocals = folder / "vocals.mp3"
    guitar = folder / "guitar.mp3"
    meta_path = folder / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

    if vocals.exists() and guitar.exists():
        entry["vocals"] = f"{folder.name}/vocals.mp3"
        entry["guitar"] = f"{folder.name}/guitar.mp3"
        dur = mp3_duration(vocals) or mp3_duration(guitar)
        if dur is not None:
            entry["duration_sec"] = dur
    else:
        entry.pop("vocals", None)
        entry.pop("guitar", None)
        entry.pop("duration_sec", None)

    entry["youtube_id"] = entry.get("youtube_id") or meta.get("youtube_id")
    entry["youtube_url"] = entry.get("youtube_url") or meta.get("youtube_url")
    entry["offset_sec"] = entry.get("offset_sec", meta.get("offset_sec", 0))
    tracks.append(entry)

base["tracks"] = tracks
manifest_path.write_text(json.dumps(base, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"  {len(tracks)} faixas em manifest.json")
PY

echo "==> Pronto."
