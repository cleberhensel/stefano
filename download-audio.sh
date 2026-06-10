#!/usr/bin/env bash
# Descarrega áudio de cada vídeo YouTube listado no manifest.json.
# Requer: yt-dlp (brew install yt-dlp)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp não encontrado. Instale com: brew install yt-dlp"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg não encontrado. Instale com: brew install ffmpeg"
  exit 1
fi

python3 - <<'PY'
import json
import subprocess
from pathlib import Path

manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
for track in manifest["tracks"]:
    folder = Path(track["folder"])
    folder.mkdir(parents=True, exist_ok=True)
    url = track["youtube_url"]
    out_wav = folder / "source.wav"
    out_mp3 = folder / "source.mp3"
    meta_path = folder / "meta.json"

    if out_wav.exists() or out_mp3.exists():
        print(f"  skip {folder.name} (source já existe)")
    else:
        print(f"==> {track['num']:02d} {track['title']}")
        tmp = folder / "_download"
        subprocess.run(
            [
                "yt-dlp",
                "-x",
                "--audio-format", "wav",
                "--audio-quality", "0",
                "-o", str(tmp),
                url,
            ],
            check=True,
        )
        downloaded = next(folder.glob("_download.*"))
        downloaded.rename(out_wav)
        print(f"    → {out_wav}")

    meta = {
        "youtube_id": track["youtube_id"],
        "youtube_url": track["youtube_url"],
        "offset_sec": track.get("offset_sec", 0),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

echo "==> Próximo passo: separar voz/violão (Demucs ou pipeline existente) e correr ./prepare-repo.sh"
