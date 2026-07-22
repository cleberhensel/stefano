#!/usr/bin/env python3
"""Gera timeline.json alinhando progressão da cifra a onsets do stem de violão."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CHORD_RE = re.compile(
    r"(?<![A-Za-zÀ-ÿ])"
    r"([A-G][#b]?(?:[°º](?:\([^)]*\))*|"
    r"(?:(?:m(?!aj)|maj|min|dim|aug|sus|add)?"
    r"(?:[0-9]+-/(?:[A-G][#b]?|[0-9]+)|[0-9]+-(?=[(\s\]\[,]|$)|[0-9]+)?"
    r"M?(?:/[0-9]+)?(?:\([^)]*\))*(?:/[A-G][#b]?)?)))"
    r"(?![a-zà-ÿ])",
    re.I,
)


def chord_count(line: str) -> int:
    return len(CHORD_RE.findall(line))


def is_chords_line(line: str) -> bool:
    words = re.findall(r"[A-Za-zÀ-ÿ]{3,}", line)
    return chord_count(line) >= 1 and len(words) <= 3


def parse_progression(text: str, skip_sections: bool = False) -> list[str]:
    chords: list[str] = []
    for raw in text.splitlines():
        line = raw.rstrip("\r")
        sec = line.strip()
        if skip_sections and sec.startswith("[") and sec.endswith("]"):
            continue
        if is_chords_line(line):
            for m in CHORD_RE.finditer(line):
                chords.append(m.group(1))
    return chords


def pick_onsets(y: np.ndarray, sr: int, n: int, min_gap: float = 0.35) -> list[float]:
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, aggregate=np.median)
    peaks = librosa.util.peak_pick(
        onset_env,
        pre_max=3,
        post_max=3,
        pre_avg=3,
        post_avg=5,
        delta=0.12,
        wait=int(min_gap * sr / 512),
    )
    times = librosa.frames_to_time(peaks, sr=sr).tolist()
    if not times:
        return []
    # reforço: picos de energia em banda média (violão)
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    band = (freqs >= 120) & (freqs <= 3500)
    flux = np.diff(np.sum(S[band], axis=0), prepend=0)
    flux_peaks = librosa.util.peak_pick(
        flux,
        pre_max=3,
        post_max=3,
        pre_avg=3,
        post_avg=5,
        delta=np.percentile(flux, 75) * 0.15,
        wait=int(min_gap * sr / 512),
    )
    flux_times = librosa.frames_to_time(flux_peaks, sr=sr).tolist()
    merged = sorted(set(round(t, 3) for t in times + flux_times))
    # filtrar muito cedo (intro) e fundir próximos
    filtered: list[float] = []
    for t in merged:
        if t < 0.15:
            continue
        if filtered and t - filtered[-1] < min_gap:
            continue
        filtered.append(t)
    return filtered


def beat_grid(y: np.ndarray, sr: int) -> list[float]:
    try:
        _, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        return librosa.frames_to_time(beat_frames, sr=sr).tolist()
    except Exception:
        return []


def snap_to_beats(times: list[float], beats: list[float], window: float = 0.22) -> list[float]:
    if not beats:
        return times
    out: list[float] = []
    for t in times:
        near = [b for b in beats if abs(b - t) <= window]
        out.append(min(near, key=lambda b: abs(b - t)) if near else t)
    for i in range(1, len(out)):
        out[i] = max(out[i], out[i - 1] + 0.22)
    return out


def chord_times(
    chords: list[str],
    onsets: list[float],
    duration: float,
    intro_sec: float = 8.0,
    beats: list[float] | None = None,
) -> list[float]:
    n = len(chords)
    if n == 0:
        return []
    end_sec = max(intro_sec + 4, duration - 1.5)
    avg = (end_sec - intro_sec) / max(n, 1)
    min_step = max(0.35, min(1.1, avg * 0.55))

    if onsets:
        idx = np.linspace(0, len(onsets) - 1, n).astype(int)
        times = [float(onsets[i]) for i in idx]
        span = times[-1] - times[0]
        target = end_sec - intro_sec
        if span > 0.5 and span < target * 0.72:
            scale = target / span
            times = [intro_sec + (t - times[0]) * scale for t in times]
        elif intro_sec > 1.0 and times[0] < intro_sec:
            shift = intro_sec - times[0]
            times = [min(end_sec, t + shift) for t in times]
        elif intro_sec <= 1.0:
            times[0] = max(intro_sec, times[0])
    else:
        times = np.linspace(intro_sec, end_sec, n).tolist()

    if intro_sec > 1.0:
        times[0] = max(intro_sec, times[0])
    for i in range(1, n):
        times[i] = max(times[i], times[i - 1] + min_step)
    if times[-1] > end_sec:
        scale = end_sec / times[-1]
        base = times[0] if intro_sec <= 1.0 else intro_sec
        times = [base + (t - base) * scale for t in times]

    if beats:
        times = snap_to_beats(times, beats)
    return times


def distribute_chords(
    chords: list[str],
    onsets: list[float],
    duration: float,
    intro_sec: float = 8.0,
    beats: list[float] | None = None,
) -> list[dict]:
    times = chord_times(chords, onsets, duration, intro_sec, beats=beats)
    events = []
    for i, chord in enumerate(chords):
        t = times[i]
        if i + 1 < len(times):
            dur = max(0.25, times[i + 1] - t)
        else:
            dur = max(0.25, duration - t)
        events.append({"t": round(t, 2), "chord": chord, "dur": round(dur, 2)})
    return events


def align_track(
    track_num: int,
    cifra_path: Path,
    guitar_path: Path,
    out_path: Path,
    intro_sec: float = 8.0,
) -> dict:
    text = cifra_path.read_text(encoding="utf-8")
    chords = parse_progression(text)
    y, sr = librosa.load(str(guitar_path), sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))
    avg_gap = duration / max(len(chords), 1)
    onsets = pick_onsets(y, sr, len(chords), min_gap=max(0.35, min(0.9, avg_gap * 0.45)))
    beats = beat_grid(y, sr)
    events = distribute_chords(chords, onsets, duration, intro_sec=intro_sec, beats=beats)

    payload = {
        "track": track_num,
        "source": "onset+guitar.mp3",
        "method": "librosa_onset_v2_beats",
        "duration_sec": round(duration, 2),
        "chord_count": len(chords),
        "onset_count": len(onsets),
        "intro_sec": intro_sec,
        "events": events,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


INTRO_SEC = {
    1: 8.0,   # voz entra depois do instrumental
    2: 0.5,   # Roda Viva: cifra começa no intro de violão
}


def main() -> int:
    track = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    entry = next((t for t in manifest["tracks"] if t["num"] == track), None)
    if not entry:
        print(f"Faixa {track} não encontrada", file=sys.stderr)
        return 1

    cifra = ROOT / entry["cifra"]
    guitar = ROOT / entry["guitar"]
    out = cifra.with_suffix(".timeline.json")
    intro_sec = float(entry.get("timeline_intro_sec", INTRO_SEC.get(track, 6.0)))

    payload = align_track(track, cifra, guitar, out, intro_sec=intro_sec)
    print(f"OK {out.name}: {payload['chord_count']} acordes, {payload['onset_count']} onsets")
    if payload["events"]:
        print(f"  primeiro: {payload['events'][0]}")
        print(f"  último:   {payload['events'][-1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
