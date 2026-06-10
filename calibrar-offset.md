# Calibração de offset_sec (sync YouTube)

O player usa `ytTargetTime(audioT) = offset_sec + audioT`.

## Procedimento por faixa

1. Servir local: `python3 -m http.server 9877`
2. Abrir `http://localhost:9877`
3. Tocar a faixa com `offset_sec: 0`
4. Observar o indicador **Sync YT: N ms** no footer
5. Se o vídeo adianta ou atrasa sistematicamente:
   - Aumentar `offset_sec` se o vídeo está **atrás** dos stems
   - Diminuir `offset_sec` se o vídeo está **à frente** dos stems
   - Ajustar em passos de 0.1s até drift estável **< 120 ms**
6. Gravar em `manifest.json` **e** `NN Nome/meta.json`
7. Validar: play → pause → seek (início, meio, fim) → next/prev

## Critérios

| Métrica | Threshold |
|---------|-----------|
| Drift voz ↔ violão | < 40 ms |
| Drift YouTube ↔ voz | < 120 ms |

## Faixas com intro provável (ao vivo)

Gravações Stefano costumam ter aplausos/fala antes da música. Priorizar calibração nas faixas 01–04 e demais ao vivo.
