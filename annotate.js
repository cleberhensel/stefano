/**
 * Anotador manual de timeline — tecla L marca troca de acorde.
 */
(() => {
  const STORAGE_PREFIX = "stefano-annotate-v1";

  let manifest = null;
  let track = null;
  let progression = [];
  let markIdx = 0;
  let marks = [];
  let duration = 0;
  let offsetSec = 0;
  let rafId = null;

  let ytPlayer = null;
  let ytReady = false;
  let ytApiReady = false;

  const vocalsEl = new Audio();
  const guitarEl = new Audio();
  vocalsEl.preload = "auto";
  guitarEl.preload = "auto";

  const els = {
    trackSelect: document.getElementById("track-select"),
    btnPlay: document.getElementById("btn-play"),
    btnMark: document.getElementById("btn-mark"),
    btnUndo: document.getElementById("btn-undo"),
    btnSkip: document.getElementById("btn-skip"),
    btnClear: document.getElementById("btn-clear"),
    btnSave: document.getElementById("btn-save"),
    btnExport: document.getElementById("btn-export"),
    btnCopy: document.getElementById("btn-copy"),
    muteVocals: document.getElementById("mute-vocals"),
    muteGuitar: document.getElementById("mute-guitar"),
    progress: document.getElementById("progress"),
    progressFill: document.getElementById("progress-fill"),
    timeCur: document.getElementById("time-cur"),
    timeTot: document.getElementById("time-tot"),
    nextChord: document.getElementById("next-chord"),
    nextMeta: document.getElementById("next-meta"),
    marksList: document.getElementById("marks-list"),
    status: document.getElementById("status"),
    doneBanner: document.getElementById("done-banner"),
  };

  function enc(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function masterTime() {
    return guitarEl.currentTime || 0;
  }

  function storageKey(num) {
    return `${STORAGE_PREFIX}-track-${num}`;
  }

  function setStatus(msg, ok = true) {
    els.status.textContent = msg || "";
    els.status.style.color = ok ? "var(--guitar)" : "#f0a0a0";
  }

  function flashMarkBtn() {
    els.btnMark.classList.add("is-flash");
    setTimeout(() => els.btnMark.classList.remove("is-flash"), 120);
  }

  function updateProgressUI() {
    const dur = duration || guitarEl.duration || 0;
    const t = masterTime();
    els.timeCur.textContent = StefanoCifra.formatTime(t);
    if (dur) {
      els.progressFill.style.width = `${Math.min(100, (t / dur) * 100)}%`;
      els.timeTot.textContent = StefanoCifra.formatTime(dur);
    }
  }

  function renderMarksList() {
    els.marksList.innerHTML = marks
      .slice()
      .reverse()
      .slice(0, 24)
      .map(
        (m, revI) => {
          const i = marks.length - 1 - revI;
          return `<div class="mark-row"><span>${i + 1}. ${m.chord}</span><span>${StefanoCifra.formatTime(m.t)}</span></div>`;
        },
      )
      .join("");
  }

  function updateAnnotUi() {
    const total = progression.length;
    const done = markIdx >= total;
    els.doneBanner.hidden = !done || total === 0;

    if (!total) {
      els.nextChord.textContent = "—";
      els.nextMeta.textContent = "Sem acordes na cifra";
      els.btnMark.disabled = true;
      return;
    }

    if (done) {
      els.nextChord.textContent = "✓";
      els.nextMeta.textContent = `${marks.length} marcas · pronto para exportar`;
      els.btnMark.disabled = true;
    } else {
      els.nextChord.textContent = progression[markIdx];
      els.nextMeta.textContent = `Acorde ${markIdx + 1} de ${total}`;
      els.btnMark.disabled = false;
    }
    renderMarksList();
  }

  function saveDraft() {
    if (!track) return;
    try {
      localStorage.setItem(
        storageKey(track.num),
        JSON.stringify({ marks, markIdx, savedAt: Date.now() }),
      );
      setStatus("Rascunho salvo no browser.");
    } catch (_) {
      setStatus("Erro ao salvar rascunho.", false);
    }
  }

  function loadDraft(num) {
    try {
      const raw = localStorage.getItem(storageKey(num));
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.marks)) return false;
      marks = data.marks;
      markIdx = Number.isFinite(data.markIdx) ? data.markIdx : data.marks.length;
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildExport() {
    return StefanoCifra.buildTimeline(track, marks, duration || guitarEl.duration || 0);
  }

  function markChord() {
    if (!track || markIdx >= progression.length) return;
    const t = Math.round(masterTime() * 100) / 100;
    const chord = progression[markIdx];
    marks.push({ t, chord, idx: markIdx });
    markIdx++;
    flashMarkBtn();
    updateAnnotUi();
    saveDraft();
    setStatus(`Marcado ${chord} @ ${StefanoCifra.formatTime(t)}`);
  }

  function undoMark() {
    if (!marks.length) return;
    marks.pop();
    markIdx = Math.max(0, markIdx - 1);
    updateAnnotUi();
    saveDraft();
    setStatus("Última marca removida.");
  }

  function skipChord() {
    if (markIdx >= progression.length) return;
    markIdx++;
    updateAnnotUi();
    saveDraft();
    setStatus(`Pulou ${progression[markIdx - 1] || "?"} (sem timestamp).`);
  }

  function clearMarks() {
    if (!confirm("Limpar todas as marcas desta faixa?")) return;
    marks = [];
    markIdx = 0;
    updateAnnotUi();
    saveDraft();
    setStatus("Marcas limpas.");
  }

  function downloadJson() {
    const payload = buildExport();
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const slug = track.cifra?.replace(/^cifras\//, "").replace(/\.txt$/i, "") || `track-${track.num}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.timeline.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(`Baixado ${a.download}`);
  }

  async function copyJson() {
    const payload = buildExport();
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setStatus("JSON copiado — cole em cifras/*.timeline.json");
    } catch (_) {
      setStatus("Não foi possível copiar.", false);
    }
  }

  function seekAll(t) {
    vocalsEl.currentTime = t;
    guitarEl.currentTime = t;
    if (ytPlayer && ytReady) {
      try {
        ytPlayer.seekTo(t + offsetSec, true);
      } catch (_) {}
    }
    updateProgressUI();
  }

  function syncYoutube() {
    if (!ytPlayer || !ytReady || vocalsEl.paused) return;
    const target = masterTime() + offsetSec;
    let ytTime = 0;
    try {
      ytTime = ytPlayer.getCurrentTime();
    } catch (_) {
      return;
    }
    if (Math.abs(ytTime - target) > 0.12) {
      try {
        ytPlayer.seekTo(target, true);
      } catch (_) {}
    }
  }

  function syncLoop() {
    if (Math.abs(vocalsEl.currentTime - guitarEl.currentTime) > 0.04) {
      guitarEl.currentTime = vocalsEl.currentTime;
    }
    syncYoutube();
    updateProgressUI();
    rafId = requestAnimationFrame(syncLoop);
  }

  function startSyncLoop() {
    if (rafId) return;
    rafId = requestAnimationFrame(syncLoop);
  }

  function stopSyncLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function initYt(videoId) {
    if (!ytApiReady) return;
    if (ytPlayer) {
      ytPlayer.cueVideoById({ videoId, startSeconds: offsetSec });
      ytPlayer.mute();
      return;
    }
    ytPlayer = new YT.Player("yt-host", {
      width: "100%",
      height: "100%",
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        start: offsetSec,
      },
      events: {
        onReady: () => {
          ytReady = true;
          ytPlayer.mute();
        },
      },
    });
  }

  window.onYouTubeIframeAPIReady = () => {
    ytApiReady = true;
    if (track?.youtube_id) initYt(track.youtube_id);
  };

  async function loadTrackByNum(num) {
    const index = manifest.tracks.findIndex((t) => t.num === num);
    if (index < 0) return;
    await loadTrack(index);
  }

  async function loadTrack(index) {
    track = manifest.tracks[index];
    offsetSec = track.offset_sec || 0;
    progression = [];
    marks = [];
    markIdx = 0;

    vocalsEl.pause();
    guitarEl.pause();
    if (ytPlayer && ytReady) ytPlayer.pauseVideo();

    if (!track.cifra) {
      setStatus("Faixa sem cifra.", false);
      updateAnnotUi();
      return;
    }

    try {
      const res = await fetch(track.cifra);
      if (!res.ok) throw new Error("cifra");
      const cifraText = await res.text();
      progression = StefanoCifra.parseProgression(cifraText);
      document.dispatchEvent(
        new CustomEvent("stefano:track-loaded", {
          detail: { track, progression, cifraText },
        }),
      );
    } catch (_) {
      setStatus("Erro ao carregar cifra.", false);
      updateAnnotUi();
      return;
    }

    if (loadDraft(track.num)) {
      setStatus(`Rascunho restaurado (${marks.length} marcas).`);
    } else {
      setStatus("");
    }
    updateAnnotUi();

    if (track.vocals && track.guitar) {
      vocalsEl.src = enc(track.vocals);
      guitarEl.src = enc(track.guitar);
      initYt(track.youtube_id);
      const onMeta = () => {
        duration = Math.max(vocalsEl.duration || 0, guitarEl.duration || 0);
        updateProgressUI();
      };
      vocalsEl.addEventListener("loadedmetadata", onMeta, { once: true });
      guitarEl.addEventListener("loadedmetadata", onMeta, { once: true });
    }
  }

  function togglePlay() {
    if (!guitarEl.src) return;
    if (vocalsEl.paused) {
      const t = masterTime();
      seekAll(t);
      if (ytPlayer && ytReady) {
        ytPlayer.mute();
        ytPlayer.seekTo(t + offsetSec, true);
        ytPlayer.playVideo();
      }
      Promise.all([vocalsEl.play(), guitarEl.play()]).catch(() => {
        setStatus("Clique em Play (gesto do browser).", false);
      });
      els.btnPlay.textContent = "⏸";
      startSyncLoop();
    } else {
      vocalsEl.pause();
      guitarEl.pause();
      if (ytPlayer && ytReady) ytPlayer.pauseVideo();
      els.btnPlay.textContent = "▶";
      stopSyncLoop();
    }
  }

  function bindKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("select, input, textarea")) return;

      if (e.code === "KeyL" || e.key === "l" || e.key === "L") {
        e.preventDefault();
        markChord();
      } else if (e.code === "KeyZ" || e.key === "Backspace") {
        e.preventDefault();
        undoMark();
      } else if (e.code === "KeyS" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        skipChord();
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekAll(Math.max(0, masterTime() - 2));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekAll(Math.min(duration || 9999, masterTime() + 2));
      }
    });
  }

  function init() {
    els.btnPlay.addEventListener("click", togglePlay);
    els.btnMark.addEventListener("click", markChord);
    els.btnUndo.addEventListener("click", undoMark);
    els.btnSkip.addEventListener("click", skipChord);
    els.btnClear.addEventListener("click", clearMarks);
    els.btnSave.addEventListener("click", saveDraft);
    els.btnExport.addEventListener("click", downloadJson);
    els.btnCopy.addEventListener("click", copyJson);

    els.progress.addEventListener("click", (e) => {
      const dur = duration || guitarEl.duration;
      if (!dur) return;
      const r = els.progress.getBoundingClientRect();
      seekAll(((e.clientX - r.left) / r.width) * dur);
    });

    els.muteVocals.addEventListener("click", () => {
      vocalsEl.muted = !vocalsEl.muted;
      els.muteVocals.style.opacity = vocalsEl.muted ? ".45" : "1";
    });
    els.muteGuitar.addEventListener("click", () => {
      guitarEl.muted = !guitarEl.muted;
      els.muteGuitar.style.opacity = guitarEl.muted ? ".45" : "1";
    });

    bindKeys();

    document.addEventListener("stefano:cifra-updated", (e) => {
      if (!e.detail?.progression) return;
      progression = e.detail.progression;
      markIdx = Math.min(markIdx, progression.length);
      updateAnnotUi();
    });

    fetch("manifest.json")
      .then((r) => r.json())
      .then((data) => {
        manifest = data;
        const ready = data.tracks.filter((t) => t.cifra && t.vocals && t.guitar);
        els.trackSelect.innerHTML = ready
          .map(
            (t) =>
              `<option value="${t.num}">${String(t.num).padStart(2, "0")} — ${t.title}</option>`,
          )
          .join("");
        els.trackSelect.addEventListener("change", () => {
          loadTrackByNum(Number(els.trackSelect.value));
        });
        const q = new URLSearchParams(location.search).get("track");
        const pick = q ? ready.find((t) => String(t.num) === q) : ready[0];
        if (pick) {
          els.trackSelect.value = String(pick.num);
          loadTrackByNum(pick.num);
        }
      })
      .catch(() => setStatus("Erro ao carregar manifest.", false));
  }

  init();
})();
