#!/usr/bin/env python3
"""Baixa cifras do Cifra Club para o repertório Stefano e atualiza manifest + chords-dict."""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup
from curl_cffi import requests

ROOT = Path(__file__).resolve().parent.parent
CIFRAS_DIR = ROOT / "cifras"
MANIFEST = ROOT / "manifest.json"
CHORDS_DICT = ROOT / "chords-dict.json"
CHICO_CIFRAS = ROOT.parent.parent.parent / "musicas" / "chico-buarque" / "cifras"
MUSICAS_DICT = ROOT.parent.parent.parent / "musicas" / "data" / "chords" / "dictionary.json"
CIFRA_UTILS = ROOT.parent.parent.parent / "musicas" / "chico-buarque" / "scripts"
sys.path.insert(0, str(CIFRA_UTILS))
from cifra_utils import build_acordes_ascii  # noqa: E402

DELAY_SEC = 0.35

CHORD_RE = re.compile(
    r"(?<![A-Za-zÀ-ÿ])"
    r"([A-G][#b]?(?:[°º](?:\([^)]*\))*|"
    r"(?:(?:m(?!aj)|maj|min|dim|aug|sus|add)?"
    r"(?:[0-9]+-/(?:[A-G][#b]?|[0-9]+)|[0-9]+-(?=[(\s\]\[,]|$)|[0-9]+)?"
    r"M?(?:/[0-9]+)?(?:\([^)]*\))*(?:/[A-G][#b]?)?)))"
    r"(?![a-zà-ÿ])",
    re.I,
)

# num, arquivo (sem .txt), artista CC, slug CC
TRACKS_CC = [
    (1, "01-o-que-sera", "chico-buarque", "o-que-sera-a-flor-da-pele"),
    (2, "02-roda-viva", "chico-buarque", "roda-viva"),
    (3, "03-gente-humilde", "chico-buarque", "gente-humilde"),
    (4, "04-o-bebado-e-o-equilibrista", "joao-bosco", "o-bebado-e-o-equilibrista"),
    (5, "05-e-preciso-dar-um-jeito", "erasmo-carlos", "e-preciso-dar-um-jeito-meu-amigo"),
    (6, "06-apesar-de-voce", "chico-buarque", "apesar-de-voce"),
    (7, "07-cotidiano", "chico-buarque", "cotidiano"),
    (8, "08-construcao", "chico-buarque", "construcao"),
    (9, "09-essa-moca-ta-diferente", "chico-buarque", "essa-moca-ta-diferente"),
    (10, "10-trocando-em-miudos", "chico-buarque", "trocando-em-miudos"),
    (11, "11-joao-e-maria", "chico-buarque", "joao-maria"),
    (12, "12-azul", "djavan", "azul"),
    (13, "13-eu-te-amo", "chico-buarque", "eu-te-amo"),
    (14, "14-todo-o-sentimento", "chico-buarque", "todo-sentimento"),
    (15, "15-calice", "chico-buarque", "calice"),
    (16, "16-olhos-nos-olhos", "chico-buarque", "olhos-nos-olhos"),
    (17, "17-a-banda", "chico-buarque", "a-banda"),
    (18, "18-pedaco-de-mim", "chico-buarque", "pedaco-de-mim"),
    (19, "19-samba-e-amor", "chico-buarque", "samba-amor"),
    (20, "20-tatuagem", "chico-buarque", "tatuagem"),
    (21, "21-a-historia-de-lilly-braun", "chico-buarque", "a-historia-de-lily-braun"),
    (22, "22-folhetim", "chico-buarque", "folhetim"),
    (23, "23-o-mundo-e-um-moinho", "cartola", "o-mundo-um-moinho"),
    (24, "24-naquela-mesa", "nelson-goncalves", "naquela-mesa"),
    (25, "25-carinhoso", "pixinguinha", "carinhoso"),
    (26, "26-disritmia", "martinho-da-vila", "disritmia"),
]

# Tom / fonte quando o CC diverge da gravação do repertório
KEY_OVERRIDES: dict[int, str] = {
    1: "Dm",
    4: "A",
}

SOURCE_OVERRIDES: dict[int, str] = {
    4: "https://www.cifras.com.br/cifra/joao-bosco/o-bebado-e-a-equilibrista",
}

LOCAL_CIFRA_OVERRIDES: dict[int, Path] = {
    4: ROOT.parent.parent / "cifras" / "o-bebado-e-a-equilibrista.cifra.txt",
}


def fetch(url: str) -> str | None:
    try:
        r = requests.get(url, impersonate="chrome120", timeout=45)
        if r.status_code == 200:
            return r.text
    except Exception as exc:  # noqa: BLE001
        print(f"  ERRO fetch {url}: {exc}")
    return None


def parse_imprimir(html: str) -> tuple[str, str | None]:
    soup = BeautifulSoup(html, "lxml")
    tom = None
    tom_span = soup.find("span", id="cifra_tom")
    if tom_span:
        m = re.search(r"tom:\s*(.+)", tom_span.get_text(" ", strip=True), re.I)
        if m:
            tom = m.group(1).strip()
    if not tom:
        m = re.search(
            r"Tom[:\s]*(?:<[^>]+>)*([A-G][#b]?(?:m|maj|min|dim|aug|sus)?[0-9]*(?:\([^)]*\))?)",
            html,
            re.I,
        )
        if m:
            tom = m.group(1).strip()

    pre = soup.find("pre")
    cifra = pre.get_text() if pre else ""
    return cifra.strip(), tom


def download_track(artist: str, slug: str) -> dict | None:
    base = f"https://www.cifraclub.com.br/{artist}/{slug}"
    imprimir_url = f"{base}/imprimir.html"
    html = fetch(imprimir_url)
    if not html:
        return None
    cifra, tom = parse_imprimir(html)
    if not cifra or len(cifra) < 40:
        return None
    acordes, _ = build_acordes_ascii(html)
    return {
        "cifra": cifra,
        "tom": tom,
        "url": f"{base}/",
        "acordes": {a["nome"]: a["shape"] for a in acordes},
    }


def strip_local_header(text: str) -> str:
    lines = text.splitlines()
    out: list[str] = []
    started = False
    for line in lines:
        s = line.strip()
        if not started:
            if s.startswith("#") or s.lower().startswith("tom:") or s.lower().startswith("fonte:"):
                continue
            if s.lower().startswith("youtube:"):
                continue
            if not s:
                continue
            started = True
        out.append(line)
    return "\n".join(out).strip()


def load_musicas_shapes() -> dict[str, str]:
    if not MUSICAS_DICT.exists():
        return {}
    data = json.loads(MUSICAS_DICT.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for name, entry in (data.get("entries") or {}).items():
        variations = entry.get("variations") or []
        if variations:
            out[name] = variations[0].get("shape", "")
    return out


def load_chico_json_shapes(slug: str) -> dict[str, str]:
    path = CHICO_CIFRAS / f"{slug}.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {a["nome"]: a["shape"] for a in data.get("acordes") or [] if a.get("shape")}


def extract_chords_from_text(text: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for m in CHORD_RE.finditer(text):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def sync_chords_dict(cifra_paths: list[Path], downloaded_shapes: dict[str, str]) -> dict:
    existing = {}
    if CHORDS_DICT.exists():
        existing = json.loads(CHORDS_DICT.read_text(encoding="utf-8")).get("chords") or {}

    musicas = load_musicas_shapes()
    merged: dict[str, dict] = dict(existing)

    needed: set[str] = set()
    for path in cifra_paths:
        if path.exists():
            needed.update(extract_chords_from_text(path.read_text(encoding="utf-8")))

    for name in sorted(needed):
        if name in merged and merged[name].get("shape"):
            continue
        shape = (
            downloaded_shapes.get(name)
            or downloaded_shapes.get(name.replace("º", "°"))
            or musicas.get(name)
            or musicas.get(name.replace("º", "°"))
        )
        if shape:
            merged[name] = {"shape": shape}
            alt = name.replace("°", "º") if "°" in name else name.replace("º", "°")
            if alt != name and alt in needed and alt not in merged:
                merged[alt] = {"shape": shape}

    return {
        "version": 1,
        "source": "CifraClub + musicas/data/chords/dictionary.json",
        "updated": str(date.today()),
        "chords": dict(sorted(merged.items())),
    }


def load_local_override(num: int, file_id: str) -> dict | None:
    src = LOCAL_CIFRA_OVERRIDES.get(num)
    if not src or not src.exists():
        return None
    raw = src.read_text(encoding="utf-8")
    lines: list[str] = []
    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("─") or s.lower().startswith("fonte:") or s.lower().startswith("tom:"):
            continue
        if re.match(r"^[A-Za-zÀ-ÿ].+—", s):
            continue
        lines.append(line)
    cifra = "\n".join(lines).strip()
    if not cifra:
        return None
    return {
        "cifra": cifra,
        "tom": KEY_OVERRIDES.get(num),
        "url": SOURCE_OVERRIDES.get(num, ""),
        "acordes": {},
    }


def update_manifest(track_files: dict[int, dict]) -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for track in manifest["tracks"]:
        num = track["num"]
        info = track_files.get(num)
        if not info:
            continue
        track["cifra"] = info["cifra_path"]
        track["cifra_key"] = KEY_OVERRIDES.get(num) or info.get("tom")
        track["cifra_source"] = SOURCE_OVERRIDES.get(num) or info["url"]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    CIFRAS_DIR.mkdir(parents=True, exist_ok=True)
    track_files: dict[int, dict] = {}
    all_shapes: dict[str, str] = {}
    ok = fail = 0

    for num, file_id, artist, slug in TRACKS_CC:
        out = CIFRAS_DIR / f"{file_id}.txt"
        print(f"[{num:02d}/26] {file_id}...", end=" ", flush=True)

        data = load_local_override(num, file_id) or download_track(artist, slug)
        if data:
            out.write_text(data["cifra"] + "\n", encoding="utf-8")
            track_files[num] = {
                "cifra_path": f"cifras/{file_id}.txt",
                "tom": data["tom"],
                "url": data["url"],
            }
            all_shapes.update(data["acordes"])
            lines = len(data["cifra"].splitlines())
            print(f"OK ({lines} linhas, tom={data['tom'] or '?'})")
            ok += 1
        else:
            print("FALHOU")
            fail += 1

        time.sleep(DELAY_SEC)

    update_manifest(track_files)

    cifra_paths = list(CIFRAS_DIR.glob("*.txt"))
    chords = sync_chords_dict(cifra_paths, all_shapes)
    CHORDS_DICT.write_text(json.dumps(chords, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\nConcluído: {ok} cifras, {fail} falhas")
    print(f"  manifest: {MANIFEST}")
    print(f"  chords-dict: {len(chords['chords'])} acordes")


if __name__ == "__main__":
    main()
