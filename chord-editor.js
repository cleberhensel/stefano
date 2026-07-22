/**
 * Editor de diagramas — acorde a acorde, salva cifra + shapes.
 */
(() => {
  const STORAGE_PREFIX = "stefano-chord-edits-v1";
  const STRING_LABELS = ["6", "5", "4", "3", "2", "1"];
  const DISPLAY_FRETS = 4;

  const state = {
    track: null,
    progression: [],
    unique: [],
    chordIdx: 0,
    baseDict: {},
    overrides: {},
    cifraText: "",
    baseFret: 1,
    frets: [-1, -1, -1, -1, -1, -1],
    lastDetection: null,
  };

  const els = {};

  function storageKey(num) {
    return `${STORAGE_PREFIX}-track-${num}`;
  }

  function currentChord() {
    return state.unique[state.chordIdx] || null;
  }

  function mergedShape(name) {
    const o = state.overrides[name]?.shape;
    if (o) return o;
    const d = StefanoCifra.dictLookup(state.baseDict, name);
    return d?.shape || "X X X X X X";
  }

  function loadOverrides(num) {
    try {
      const raw = localStorage.getItem(storageKey(num));
      if (!raw) return { shapes: {}, cifraText: null };
      const data = JSON.parse(raw);
      return {
        shapes: data.shapes || {},
        cifraText: typeof data.cifraText === "string" ? data.cifraText : null,
      };
    } catch (_) {
      return { shapes: {}, cifraText: null };
    }
  }

  function saveOverrides() {
    if (!state.track) return;
    try {
      localStorage.setItem(
        storageKey(state.track.num),
        JSON.stringify({
          shapes: state.overrides,
          cifraText: state.cifraText,
          savedAt: Date.now(),
        }),
      );
      setEditorStatus("Salvo no browser.");
    } catch (_) {
      setEditorStatus("Erro ao salvar.", false);
    }
  }

  function setEditorStatus(msg, ok = true) {
    if (!els.status) return;
    els.status.textContent = msg || "";
    els.status.style.color = ok ? "var(--guitar)" : "#f0a0a0";
  }

  function autoBaseFret(frets) {
    const pos = frets.filter((f) => f > 0);
    if (!pos.length) return 1;
    const max = Math.max(...pos);
    const min = Math.min(...pos);
    return max > DISPLAY_FRETS ? min : 1;
  }

  function updateDetection() {
    const cifraName = currentChord();
    const det = StefanoCifra.detectChordFromFrets(state.frets, cifraName);
    state.lastDetection = det;

    if (els.detectedName) {
      els.detectedName.textContent = det.name || "— (sem notas)";
    }
    if (els.detectedNotes) {
      els.detectedNotes.textContent = det.notes.length
        ? `Notas: ${det.notes.join(" · ")}${det.bass ? ` · baixo ${det.bass}` : ""}`
        : "Marque cordas no diagrama";
    }
    if (els.detectedAlts) {
      els.detectedAlts.textContent =
        det.alternatives?.length > 0
          ? `Alternativas: ${det.alternatives.map((a) => a.name).join(", ")}`
          : "";
    }

    const match =
      !det.name || !cifraName || StefanoCifra.chordNamesEquivalent(cifraName, det.name);
    if (els.detectBox) {
      els.detectBox.classList.toggle("is-match", Boolean(match && det.name));
      els.detectBox.classList.toggle("is-mismatch", Boolean(!match && det.name));
    }
    if (els.detectActions) {
      els.detectActions.hidden = match || !det.name;
    }
    if (els.chordTitle && cifraName) {
      els.chordTitle.textContent = cifraName;
      if (!match && det.name) {
        els.chordTitle.title = `Cifra: ${cifraName} · Shape soa como: ${det.name}`;
      } else {
        els.chordTitle.title = "";
      }
    }
  }

  function refreshEditorView() {
    renderBoard();
    updateDetection();
  }

  function loadChordIntoEditor(name) {
    const shape = mergedShape(name);
    state.frets = StefanoCifra.parseShape(shape);
    state.baseFret = autoBaseFret(state.frets);
    syncInputsFromFrets();
    refreshEditorView();
    renderPills();
    updateNav();
  }

  function syncInputsFromFrets() {
    STRING_LABELS.forEach((_, i) => {
      const inp = els.stringInputs[i];
      if (!inp) return;
      const f = state.frets[i];
      inp.value = f === -1 ? "X" : String(f);
    });
    if (els.shapeOut) els.shapeOut.value = StefanoCifra.formatShape(state.frets);
  }

  function applyFretsFromInputs() {
    state.frets = STRING_LABELS.map((_, i) => {
      const v = (els.stringInputs[i]?.value || "X").trim().toUpperCase();
      if (v === "X") return -1;
      if (v === "0") return 0;
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= 0 ? n : -1;
    });
    state.baseFret = autoBaseFret(state.frets);
    if (els.shapeOut) els.shapeOut.value = StefanoCifra.formatShape(state.frets);
    refreshEditorView();
  }

  function setStringFret(strIdx, value) {
    state.frets[strIdx] = value;
    state.baseFret = autoBaseFret(state.frets);
    syncInputsFromFrets();
    refreshEditorView();
  }

  function renderBoard() {
    if (!els.board) return;
    const name = currentChord();
    if (els.chordTitle) els.chordTitle.textContent = name || "—";
    if (els.baseFret) els.baseFret.textContent = state.baseFret > 1 ? `${state.baseFret}ª` : "";

    els.board.innerHTML = "";

    const openRow = document.createElement("div");
    openRow.className = "fb-row fb-row--open";
    openRow.innerHTML = `<span class="fb-row-label"></span>`;
    STRING_LABELS.forEach((label, si) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "fb-cell fb-cell--open";
      const f = state.frets[si];
      if (f === -1) {
        cell.textContent = "×";
        cell.classList.add("is-muted");
      } else if (f === 0) {
        cell.textContent = "○";
        cell.classList.add("is-open");
      } else {
        cell.textContent = "·";
      }
      cell.title = `Corda ${label} — clique: mudo / aberta`;
      cell.addEventListener("click", () => {
        if (f === -1) setStringFret(si, 0);
        else if (f === 0) setStringFret(si, -1);
        else setStringFret(si, 0);
      });
      openRow.appendChild(cell);
    });
    els.board.appendChild(openRow);

    for (let row = 1; row <= DISPLAY_FRETS; row++) {
      const fretRow = document.createElement("div");
      fretRow.className = "fb-row";
      fretRow.innerHTML = `<span class="fb-row-label">${state.baseFret > 1 ? state.baseFret + row - 1 : row}</span>`;
      STRING_LABELS.forEach((label, si) => {
        const abs = state.baseFret + row - 1;
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "fb-cell";
        if (state.frets[si] === abs) cell.classList.add("is-active");
        cell.title = `Corda ${label}, traste ${abs}`;
        cell.addEventListener("click", () => {
          setStringFret(si, state.frets[si] === abs ? -1 : abs);
        });
        fretRow.appendChild(cell);
      });
      els.board.appendChild(fretRow);
    }
  }

  function renderPills() {
    if (!els.pills) return;
    els.pills.innerHTML = state.unique
      .map((c, i) => {
        const edited = Boolean(state.overrides[c]?.shape);
        const missing = !StefanoCifra.dictLookup(state.baseDict, c) && !edited;
        return (
          `<button type="button" class="chord-pill${i === state.chordIdx ? " is-active" : ""}` +
          `${edited ? " is-edited" : ""}${missing ? " is-missing" : ""}" data-idx="${i}">${c}</button>`
        );
      })
      .join("");
    els.pills.querySelectorAll(".chord-pill").forEach((btn) => {
      btn.addEventListener("click", () => selectChord(Number(btn.dataset.idx)));
    });
  }

  function updateNav() {
    const total = state.unique.length;
    if (els.navMeta) {
      els.navMeta.textContent = total
        ? `Acorde ${state.chordIdx + 1} de ${total} · ${state.unique.filter((c) => state.overrides[c]?.shape).length} editados`
        : "Sem acordes";
    }
    if (els.btnPrev) els.btnPrev.disabled = state.chordIdx <= 0;
    if (els.btnNext) els.btnNext.disabled = state.chordIdx >= total - 1;
  }

  function selectChord(idx) {
    if (idx < 0 || idx >= state.unique.length) return;
    state.chordIdx = idx;
    loadChordIntoEditor(state.unique[idx]);
  }

  function saveShapeUnderName(name) {
    if (!name) return;
    state.overrides[name] = { shape: StefanoCifra.formatShape(state.frets) };
    saveOverrides();
    renderPills();
    updateNav();
  }

  function saveCurrentVoicing() {
    const name = currentChord();
    if (!name) return;
    saveShapeUnderName(name);
    const det = state.lastDetection?.name;
    if (det && !StefanoCifra.chordNamesEquivalent(name, det)) {
      setEditorStatus(`Voicing salvo como ${name} (detectado: ${det}).`);
    } else {
      setEditorStatus(`Voicing de ${name} salvo.`);
    }
  }

  function saveAsDetected() {
    const det = state.lastDetection?.name;
    if (!det) return;
    saveShapeUnderName(det);
    setEditorStatus(`Shape salvo como ${det}.`);
    updateDetection();
  }

  function adoptDetectedName() {
    const oldName = currentChord();
    const det = state.lastDetection?.name;
    if (!oldName || !det || StefanoCifra.chordNamesEquivalent(oldName, det)) return;

    if (
      !confirm(
        `Substituir "${oldName}" por "${det}" em toda a cifra desta faixa?\n\n` +
          "Isso atualiza o texto e a lista de acordes.",
      )
    ) {
      return;
    }

    const shape = StefanoCifra.formatShape(state.frets);
    delete state.overrides[oldName];
    state.overrides[det] = { shape };

    const text = els.cifraText?.value ?? state.cifraText;
    state.cifraText = StefanoCifra.replaceChordInText(text, oldName, det);
    if (els.cifraText) els.cifraText.value = state.cifraText;

    state.progression = StefanoCifra.parseProgression(state.cifraText);
    state.unique = StefanoCifra.uniqueChords(state.progression);
    const newIdx = state.unique.indexOf(det);
    state.chordIdx = newIdx >= 0 ? newIdx : 0;

    saveOverrides();
    document.dispatchEvent(
      new CustomEvent("stefano:cifra-updated", {
        detail: { progression: state.progression, cifraText: state.cifraText },
      }),
    );

    loadChordIntoEditor(state.unique[state.chordIdx]);
    setEditorStatus(`Cifra atualizada: ${oldName} → ${det}`);
  }

  function resetCurrentVoicing() {
    const name = currentChord();
    if (!name) return;
    delete state.overrides[name];
    saveOverrides();
    loadChordIntoEditor(name);
    setEditorStatus(`${name} restaurado do dicionário.`);
  }

  function downloadCifra() {
    if (!state.track) return;
    const blob = new Blob([state.cifraText], { type: "text/plain;charset=utf-8" });
    const slug =
      state.track.cifra?.replace(/^cifras\//, "").replace(/\.txt$/i, "") || `track-${state.track.num}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-edit.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setEditorStatus(`Cifra baixada: ${a.download}`);
  }

  function downloadShapes() {
    if (!state.track) return;
    const payload = {
      track: state.track.num,
      title: state.track.title,
      source: "chord-editor",
      shapes: {},
    };
    for (const c of state.unique) {
      const shape = state.overrides[c]?.shape || mergedShape(c);
      payload.shapes[c] = { shape };
    }
    const slug =
      state.track.cifra?.replace(/^cifras\//, "").replace(/\.txt$/i, "") || `track-${state.track.num}`;
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.shapes.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setEditorStatus(`Shapes baixados: ${a.download}`);
  }

  async function loadDict() {
    if (Object.keys(state.baseDict).length) return;
    try {
      const res = await fetch("chords-dict.json");
      if (!res.ok) throw new Error("dict");
      const data = await res.json();
      state.baseDict = data.chords || {};
    } catch (_) {
      state.baseDict = {};
    }
  }

  async function onTrackLoaded(detail) {
    await loadDict();
    state.track = detail.track;
    state.progression = detail.progression || [];
    state.unique = StefanoCifra.uniqueChords(state.progression);
    state.chordIdx = 0;

    const saved = loadOverrides(detail.track.num);
    state.overrides = saved.shapes || {};
    state.cifraText = saved.cifraText ?? detail.cifraText ?? "";

    if (els.cifraText) els.cifraText.value = state.cifraText;

    if (state.unique.length) loadChordIntoEditor(state.unique[0]);
    else {
      renderBoard();
      renderPills();
      updateNav();
    }
    setEditorStatus("");
  }

  function bind() {
    els.btnPrev?.addEventListener("click", () => selectChord(state.chordIdx - 1));
    els.btnNext?.addEventListener("click", () => selectChord(state.chordIdx + 1));
    els.btnSaveVoicing?.addEventListener("click", saveCurrentVoicing);
    els.btnSaveDetected?.addEventListener("click", saveAsDetected);
    els.btnAdoptName?.addEventListener("click", adoptDetectedName);
    els.btnResetVoicing?.addEventListener("click", resetCurrentVoicing);
    els.btnSaveCifra?.addEventListener("click", () => {
      state.cifraText = els.cifraText?.value ?? state.cifraText;
      saveOverrides();
      setEditorStatus("Cifra salva no browser.");
    });
    els.btnDownloadCifra?.addEventListener("click", () => {
      state.cifraText = els.cifraText?.value ?? state.cifraText;
      downloadCifra();
    });
    els.btnDownloadShapes?.addEventListener("click", downloadShapes);

    els.stringInputs.forEach((inp) => {
      inp?.addEventListener("change", applyFretsFromInputs);
      inp?.addEventListener("input", applyFretsFromInputs);
    });
    els.shapeOut?.addEventListener("change", () => {
      state.frets = StefanoCifra.parseShape(els.shapeOut.value);
      state.baseFret = autoBaseFret(state.frets);
      syncInputsFromFrets();
      refreshEditorView();
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("textarea, input, select")) return;
      if (e.code === "Comma" || e.key === ",") {
        e.preventDefault();
        selectChord(state.chordIdx - 1);
      } else if (e.code === "Period" || e.key === ".") {
        e.preventDefault();
        selectChord(state.chordIdx + 1);
      }
    });

    document.addEventListener("stefano:track-loaded", (e) => onTrackLoaded(e.detail));
  }

  function init() {
    Object.assign(els, {
      board: document.getElementById("fb-board"),
      chordTitle: document.getElementById("editor-chord-name"),
      baseFret: document.getElementById("fb-base-fret"),
      navMeta: document.getElementById("editor-nav-meta"),
      btnPrev: document.getElementById("editor-prev"),
      btnNext: document.getElementById("editor-next"),
      pills: document.getElementById("editor-pills"),
      cifraText: document.getElementById("editor-cifra-text"),
      shapeOut: document.getElementById("editor-shape"),
      stringInputs: [0, 1, 2, 3, 4, 5].map((i) => document.getElementById(`str-${i}`)),
      btnSaveVoicing: document.getElementById("editor-save-voicing"),
      btnSaveDetected: document.getElementById("editor-save-detected"),
      btnAdoptName: document.getElementById("editor-adopt-name"),
      btnResetVoicing: document.getElementById("editor-reset-voicing"),
      detectBox: document.getElementById("editor-detect"),
      detectedName: document.getElementById("editor-detected-name"),
      detectedNotes: document.getElementById("editor-detected-notes"),
      detectedAlts: document.getElementById("editor-detected-alts"),
      detectActions: document.getElementById("editor-detect-actions"),
      btnSaveCifra: document.getElementById("editor-save-cifra"),
      btnDownloadCifra: document.getElementById("editor-dl-cifra"),
      btnDownloadShapes: document.getElementById("editor-dl-shapes"),
      status: document.getElementById("editor-status"),
    });
    bind();
  }

  init();
})();
