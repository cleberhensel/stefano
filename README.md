# Stefano — Player Vídeo + Stems

Player estático (GitHub Pages): **vídeo YouTube a 100% no fundo** (sempre mudo) + **voz** e **violão** locais sincronizados, com mute independente.

Baseado no modelo [`a-flor-da-pele`](../a-flor-da-pele/), estendido para 3 fontes de media.

## Conceito

```
┌─────────────────────────────────────────┐
│  YouTube iframe (100% fundo, muted)     │
│  ┌───────────────────────────────────┐  │
│  │  UI: playlist + player + mute       │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
     ▲                    ▲         ▲
     │                    │         │
  seekTo()           vocals.mp3  guitar.mp3
  (segue áudio)      (master)    (slave)
```

## Lista (22 faixas)

| # | Título | YouTube |
|---|--------|---------|
| 1 | O que será / Flor da pele | [_szSyzZVV4c](https://www.youtube.com/watch?v=_szSyzZVV4c) |
| 2 | Roda Viva | [fupIYBj-0lE](https://www.youtube.com/watch?v=fupIYBj-0lE) |
| 3 | Gente Humilde | [KZcSLK7Ya0s](https://www.youtube.com/watch?v=KZcSLK7Ya0s) |
| 4 | O bêbado e o equilibrista | [xK8Bp_aOOhc](https://www.youtube.com/watch?v=xK8Bp_aOOhc) |
| 5 | É preciso dar um jeito, meu amigo | [fKt-XwAbAUc](https://www.youtube.com/watch?v=fKt-XwAbAUc) |
| 6 | Apesar de você | [iR1zWZc19yA](https://www.youtube.com/watch?v=iR1zWZc19yA) |
| 7 | Cotidiano | [_ySl6SAZIe4](https://www.youtube.com/watch?v=_ySl6SAZIe4) |
| 8 | Construção | [4P-ZutZEeZA](https://www.youtube.com/watch?v=4P-ZutZEeZA) |
| 9 | Essa moça tá diferente | [XEEB1U2inqc](https://www.youtube.com/watch?v=XEEB1U2inqc) |
| 10 | Trocando em miúdos | [6XSlQTqcoaY](https://www.youtube.com/watch?v=6XSlQTqcoaY) |
| 11 | João e Maria | [1jJItSUErFs](https://www.youtube.com/watch?v=1jJItSUErFs) |
| 12 | Azul | [3Y5KhHQETl8](https://www.youtube.com/watch?v=3Y5KhHQETl8) |
| 13 | Eu te amo | [6yakscP9sgE](https://www.youtube.com/watch?v=6yakscP9sgE) |
| 14 | Todo o Sentimento | [AsE-RfBQ0eo](https://www.youtube.com/watch?v=AsE-RfBQ0eo) |
| 15 | Cálice | [nx0Qs-zmIBc](https://www.youtube.com/watch?v=nx0Qs-zmIBc) |
| 16 | Olhos nos olhos | [kVqvicbGqXQ](https://www.youtube.com/watch?v=kVqvicbGqXQ) |
| 17 | A Banda | [rU_xRkhpf60](https://www.youtube.com/watch?v=rU_xRkhpf60) |
| 18 | Pedaço de Mim | [FZUoR6vAyG8](https://www.youtube.com/watch?v=FZUoR6vAyG8) |
| 19 | Samba e Amor | [fauIobjSIbs](https://www.youtube.com/watch?v=fauIobjSIbs) |
| 20 | Tatuagem | [bu-n2iCtYn8](https://www.youtube.com/watch?v=bu-n2iCtYn8) |
| 21 | A História de Lilly Braun | [OXxMVJL2ZaQ](https://www.youtube.com/watch?v=OXxMVJL2ZaQ) |
| 22 | Folhetim | [7lp7Pp4b-mE](https://www.youtube.com/watch?v=7lp7Pp4b-mE) |

## Estrutura por faixa

```
NN Nome/
  meta.json       ← youtube_id, offset_sec
  source.wav      ← gitignored (download yt-dlp)
  vocals.mp3      ← stem voz
  guitar.mp3      ← stem violão
```

## Pipeline de produção

### 1. Descarregar áudio do YouTube

```bash
chmod +x download-audio.sh prepare-repo.sh
./download-audio.sh
```

Usa `yt-dlp` para obter `source.wav` de cada URL do `manifest.json`.

### 2. Separar voz e violão

**Importante:** separar a partir do **mesmo áudio** descarregado do vídeo (não de outra fonte), para manter o timing alinhado com o embed.

Opções:

- **Demucs** (recomendado): `demucs -n htdemucs --two-stems vocals source.wav`
- Pipeline existente em `transcrever-violao/` se já tiveres separação configurada

Renomear outputs para `vocals.wav` e `guitar.wav` (ou `other`/`no_vocals` como violão).

### 3. Converter e manifest

```bash
./prepare-repo.sh
```

### 4. Calibrar sync (`offset_sec`)

Muitos vídeos do YouTube têm intro (aplausos, fala) antes da música. Por faixa:

1. Toca no player
2. Ajusta `offset_sec` no `manifest.json` (segundos onde o vídeo deve começar vs. o áudio local)
3. Ferramenta futura: slider de offset na UI para gravar em `meta.json`

**Meta de sync:** drift < 40 ms (igual ao `a-flor-da-pele`).

## Sincronização (técnico)

| Desafio | Solução |
|---------|---------|
| YouTube tem latência no play | Master = `vocals` HTMLAudio; YT faz `seekTo` + `playVideo` no gesto do utilizador |
| Drift durante playback | Loop `requestAnimationFrame`: corrige YT e guitar se > 40 ms |
| Vídeo com intro | Campo `offset_sec` por faixa |
| YT sempre mudo | `mute: 1` no player + nunca ligar áudio do iframe |
| Seek na barra | `seekTo(t)` nos 3: YT, vocals, guitar |
| Arranque com drift alto | No clique Play, `preparePlayback()` espera stems (`canplay`) + YT (`CUED`) antes de iniciar |

## Próximos passos (ordem sugerida)

### Fase 1 — Prova de conceito (1 faixa)
- [ ] `./download-audio.sh` só para faixa 01
- [ ] Separar stems manualmente
- [ ] `./prepare-repo.sh`
- [ ] Testar `index.html` local — validar sync play/pause/seek

### Fase 2 — Pipeline em lote
- [ ] Script `separate-stems.sh` (Demucs wrapper)
- [ ] Processar as 22 faixas
- [ ] Calibrar `offset_sec` das que tiverem intro

### Fase 3 — UI (copiar modelo)
- [ ] Trazer layout/responsivo do `a-flor-da-pele`
- [ ] Fullscreen com chrome auto-hide
- [ ] Mobile: mute no player

### Fase 4 — Publicação
- [ ] Repo GitHub + Pages
- [ ] Estimar ~22 × 2 × ~3 MB ≈ 130 MB de MP3

### Riscos

1. **Vídeos removidos/restritos** — embed pode falhar; guardar `youtube_id` alternativo
2. **Qualidade da separação** — violão+voz misturados em gravações ao vivo
3. **Sync imperfeito** — YouTube IFrame API não é sample-accurate; pode precisar de offset fino por faixa
4. **Autoplay** — browser exige gesto do utilizador para áudio local + vídeo

## Testar localmente

```bash
python3 -m http.server 9877
```

Abrir `http://localhost:9877` (não usar `file://`).

## Ficheiros

| Ficheiro | Função |
|----------|--------|
| `manifest.json` | 22 faixas + YouTube IDs + paths |
| `index.html` | Player MVP (YT fundo + stems) |
| `download-audio.sh` | yt-dlp → source.wav |
| `prepare-repo.sh` | WAV → MP3 + manifest |
