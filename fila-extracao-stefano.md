# Fila de extração — Stefano (26 faixas)

Player: vídeo YouTube mudo + stems locais (voz + violão).

Pipeline: `./processar-fila-stefano.sh [NUM] [NUM2]`

| # | Status | Música | URL |
|---|--------|--------|-----|
| 01 | ✅ feito | O que será / Flor da pele | https://www.youtube.com/watch?v=_szSyzZVV4c |
| 02 | ✅ feito | Roda Viva | https://www.youtube.com/watch?v=fupIYBj-0lE |
| 03 | ✅ feito | Gente Humilde | https://www.youtube.com/watch?v=KZcSLK7Ya0s |
| 04 | ✅ feito | O bêbado e o equilibrista | https://www.youtube.com/watch?v=xK8Bp_aOOhc |
| 05 | ✅ feito | É preciso dar um jeito, meu amigo | https://www.youtube.com/watch?v=fKt-XwAbAUc |
| 06 | ✅ feito | Apesar de você | https://www.youtube.com/watch?v=iR1zWZc19yA |
| 07 | ✅ feito | Cotidiano | https://www.youtube.com/watch?v=_ySl6SAZIe4 |
| 08 | ✅ feito | Construção | https://www.youtube.com/watch?v=4P-ZutZEeZA |
| 09 | ✅ feito | Essa moça tá diferente | https://www.youtube.com/watch?v=XEEB1U2inqc |
| 10 | ✅ feito | Trocando em miúdos | https://www.youtube.com/watch?v=6XSlQTqcoaY |
| 11 | ✅ feito | João e Maria | https://www.youtube.com/watch?v=1jJItSUErFs |
| 12 | ✅ feito | Azul | https://www.youtube.com/watch?v=3Y5KhHQETl8 |
| 13 | ✅ feito | Eu te amo | https://www.youtube.com/watch?v=6yakscP9sgE |
| 14 | ✅ feito | Todo o Sentimento | https://www.youtube.com/watch?v=AsE-RfBQ0eo |
| 15 | ✅ feito | Cálice | https://www.youtube.com/watch?v=nx0Qs-zmIBc |
| 16 | ✅ feito | Olhos nos olhos | https://www.youtube.com/watch?v=kVqvicbGqXQ |
| 17 | ✅ feito | A Banda | https://www.youtube.com/watch?v=rU_xRkhpf60 |
| 18 | ✅ feito | Pedaço de Mim | https://www.youtube.com/watch?v=FZUoR6vAyG8 |
| 19 | ✅ feito | Samba e Amor | https://www.youtube.com/watch?v=fauIobjSIbs |
| 20 | ✅ feito | Tatuagem | https://www.youtube.com/watch?v=bu-n2iCtYn8 |
| 21 | ✅ feito | A História de Lilly Braun | https://www.youtube.com/watch?v=OXxMVJL2ZaQ |
| 22 | ✅ feito | Folhetim | https://www.youtube.com/watch?v=7lp7Pp4b-mE |
| 23 | ✅ feito | O Mundo é um moinho | https://www.youtube.com/watch?v=AOc0i-Nih7Y |
| 24 | ✅ feito | Naquela mesa | https://www.youtube.com/watch?v=VLq4eFuAAjA |
| 25 | ✅ feito | Carinhoso | https://www.youtube.com/watch?v=59rhQlNhqy8 |
| 26 | ✅ feito | Disritmia | https://www.youtube.com/watch?v=Wokf65PcvpQ |

## Saída esperada (cada música)

```
stefano/NN Nome/
  meta.json
  source.wav       (gitignored)
  vocals.wav       (gitignored)
  guitar.wav       (gitignored)
  vocals.mp3
  guitar.mp3
```

## Configuração Demucs

- Voz: `htdemucs --two-stems=vocals`
- Violão: `htdemucs_6s --two-stems=guitar --shifts 4`

## Sync YouTube

Calibrar `offset_sec` em `manifest.json` e `meta.json` quando o vídeo tiver intro (plateia, fala).
