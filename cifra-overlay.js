/**
 * Overlay de cifra + diagramas (protótipo v1 — Stefano)
 * Formato: .txt estilo CifraClub + chords-dict.json com shapes "X 0 2 2 1 0"
 */
(() => {
  const CHORD_RE =
    /(?<![A-Za-zÀ-ÿ])([A-G][#b]?(?:[°º](?:\([^)]*\))*|(?:(?:m(?!aj)|maj|min|dim|aug|sus|add)?(?:[0-9]+-\/(?:[A-G][#b]?|[0-9]+)|[0-9]+-(?=[(\s\]\[,]|$)|[0-9]+)?M?(?:\/[0-9]+)?(?:\([^)]*\))*(?:\/[A-G][#b]?)?)))(?![a-zà-ÿ])/gi;

  const PROG_COLS = 5;

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function chordCount(line) {
    CHORD_RE.lastIndex = 0;
    return (line.match(CHORD_RE) || []).length;
  }

  function isChordsLine(line) {
    const words = line.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
    return chordCount(line) >= 1 && words.length <= 3;
  }

  function dictEntry(dict, name) {
    return dict[name] || dict[name.replace("º", "°")] || dict[name.replace("°", "º")];
  }

  function renderChordSvg(name, shape, opts = {}) {
    const W = opts.width || 72;
    const showName = opts.hideName !== true;
    const active = opts.active === true;
    const VB_W = 100;
    const NUM_FRETS = 4;
    const GX0 = 16;
    const GX1 = 84;
    const COL = (GX1 - GX0) / 5;
    const ROW = 20;
    const GY0 = showName ? 38 : 24;
    const GY1 = GY0 + ROW * NUM_FRETS;
    const VB_H = GY1 + 14;
    const H = Math.round((W * VB_H) / VB_W);

    const tokens = shape.trim().split(/\s+/);
    const frets =
      tokens.length === 6
        ? tokens.map((s) => (s === "X" || s === "x" ? -1 : parseInt(s, 10)))
        : [-1, -1, -1, -1, -1, -1];

    const fretted = frets.filter((f) => f > 0);
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    const baseFret = maxF > NUM_FRETS ? minF : 1;

    const cText = active ? "#fff" : "#f6fafc";
    const cMuted = "rgba(240,248,252,.55)";
    const cLine = "rgba(255,255,255,.35)";
    const dot = active ? "#fff" : "#a8e0bc";

    const x = (i) => GX0 + i * COL;
    const y = (r) => GY0 + r * ROW;

    let svg =
      `<svg class="cifra-diagram" width="${W}" height="${H}" viewBox="0 0 ${VB_W} ${VB_H}" ` +
      `role="img" aria-label="Acorde ${esc(name)}" xmlns="http://www.w3.org/2000/svg">`;

    if (showName) {
      svg += `<text x="${VB_W / 2}" y="13" text-anchor="middle" font-family="Outfit,sans-serif" ` +
        `font-size="11" font-weight="600" fill="${cText}">${esc(name)}</text>`;
    }

    if (baseFret === 1) {
      svg += `<rect x="${GX0 - 1}" y="${GY0 - 3.5}" width="${GX1 - GX0 + 2}" height="3.5" fill="${cText}"/>`;
    } else {
      svg += `<text x="${GX0 - 6}" y="${y(0) + ROW * 0.66}" text-anchor="end" ` +
        `font-family="monospace" font-size="10" fill="${cMuted}">${baseFret}</text>`;
    }

    for (let r = 0; r <= NUM_FRETS; r++) {
      svg += `<line x1="${x(0)}" y1="${y(r)}" x2="${x(5)}" y2="${y(r)}" stroke="${cLine}" stroke-width="1"/>`;
    }
    for (let i = 0; i < 6; i++) {
      svg += `<line x1="${x(i)}" y1="${GY0}" x2="${x(i)}" y2="${GY1}" stroke="${cLine}" stroke-width="1"/>`;
    }

    for (let st = 0; st < 6; st++) {
      const f = frets[st];
      const sx = x(st);
      if (f === -1) {
        svg += `<text x="${sx}" y="${GY0 - 8}" text-anchor="middle" font-family="monospace" ` +
          `font-size="10" font-weight="700" fill="${cMuted}">×</text>`;
      } else if (f === 0) {
        svg += `<circle cx="${sx}" cy="${GY0 - 11}" r="3.5" fill="none" stroke="${cMuted}" stroke-width="1.2"/>`;
      } else {
        const rr = f - baseFret;
        if (rr >= 0 && rr < NUM_FRETS) {
          svg += `<circle cx="${sx}" cy="${y(rr) + ROW / 2}" r="5.5" fill="${dot}"/>`;
        }
      }
    }
    svg += "</svg>";
    return svg;
  }

  function parseCifraText(text) {
    const lines = text.split("\n");
    const chordProgression = [];
    let chordIdx = 0;
    const html = [];

    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (!line.trim()) {
        html.push("<div class='cifra-gap'></div>");
        continue;
      }
      const sec = line.trim();
      if (sec.startsWith("[") && sec.endsWith("]")) {
        html.push(`<div class="cifra-sec">${esc(sec)}</div>`);
        continue;
      }
      if (isChordsLine(line)) {
        CHORD_RE.lastIndex = 0;
        let out = "";
        let last = 0;
        let m;
        while ((m = CHORD_RE.exec(line)) !== null) {
          out += esc(line.slice(last, m.index));
          const name = m[1];
          const idx = chordIdx++;
          chordProgression.push(name);
          out += `<button type="button" class="cifra-chord" data-chord="${esc(name)}" data-idx="${idx}">${esc(name)}</button>`;
          last = m.index + m[0].length;
        }
        out += esc(line.slice(last));
        html.push(`<div class="cifra-line cifra-line--chords">${out}</div>`);
      } else {
        html.push(`<div class="cifra-line cifra-line--lyrics">${esc(line)}</div>`);
      }
    }

    return { html: html.join(""), chordProgression };
  }

  function loadDict() {
    if (state.dict) return Promise.resolve(state.dict);
    return fetch("chords-dict.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        state.dict = data?.chords || {};
        return state.dict;
      })
      .catch(() => {
        state.dict = {};
        return state.dict;
      });
  }

  const PANEL_MIN_W = 260;
  const PANEL_MIN_H = 200;

  const state = {
    dict: null,
    open: false,
    diagramsCollapsed: true,
    chordProgression: [],
    activeIndex: -1,
    drag: null,
    resize: null,
  };

  let els = {};

  function renderProgressionSlot(i, name, dict) {
    const entry = dictEntry(dict, name);
    const active = i === state.activeIndex;
    if (!entry) {
      return `<div class="cifra-prog__slot is-missing">${esc(name)}</div>`;
    }
    return (
      `<button type="button" class="cifra-prog__slot${active ? " is-active" : ""}" ` +
      `data-idx="${i}" data-chord="${esc(name)}" aria-label="${esc(name)} posição ${i + 1}">` +
      renderChordSvg(name, entry.shape, { width: 48, active }) +
      `</button>`
    );
  }

  function renderProgression() {
    const prog = state.chordProgression;
    const dict = state.dict || {};
    if (!prog.length) {
      els.progGrid.innerHTML = `<p class="cifra-prog__empty">Sem acordes na cifra</p>`;
      return;
    }

    const rows = [];
    for (let start = 0; start < prog.length; start += PROG_COLS) {
      const cells = [];
      for (let c = 0; c < PROG_COLS; c++) {
        const i = start + c;
        const name = prog[i];
        if (!name) {
          cells.push(`<div class="cifra-prog__slot is-empty" aria-hidden="true"></div>`);
          continue;
        }
        cells.push(renderProgressionSlot(i, name, dict));
      }
      rows.push(`<div class="cifra-prog-row">${cells.join("")}</div>`);
    }
    els.progGrid.innerHTML = rows.join("");
  }

  function setActiveIndex(idx) {
    if (idx < 0 || idx >= state.chordProgression.length) return;
    state.activeIndex = idx;
    els.body.querySelectorAll(".cifra-chord").forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.dataset.idx) === idx);
    });
    renderProgression();
    const token = els.body.querySelector(`.cifra-chord[data-idx="${idx}"]`);
    if (token) token.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const slot = els.progGrid.querySelector(`.cifra-prog__slot[data-idx="${idx}"]`);
    if (slot) slot.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function setDiagramsCollapsed(collapsed) {
    state.diagramsCollapsed = collapsed;
    els.panel.classList.toggle("is-diagrams-collapsed", collapsed);
    if (els.diagramsToggle) {
      els.diagramsToggle.setAttribute("aria-expanded", String(!collapsed));
      els.diagramsToggle.title = collapsed ? "Expandir diagramas" : "Recolher diagramas";
    }
    saveLayout();
  }

  function setOpen(on) {
    state.open = on;
    els.panel.classList.toggle("is-open", on);
    els.panel.setAttribute("aria-hidden", on ? "false" : "true");
    if (els.toggle) {
      els.toggle.setAttribute("aria-pressed", String(on));
      if (on) els.toggle.classList.add("is-visible");
    }
    try {
      localStorage.setItem("stefano-cifra-open", on ? "1" : "0");
    } catch (_) {}
  }

  function restoreLayout() {
    let diagramsCollapsed = true;
    try {
      const raw = localStorage.getItem("stefano-cifra-layout");
      if (raw) {
        const layout = JSON.parse(raw);
        if (layout.w) els.panel.style.width = layout.w;
        if (layout.h) els.panel.style.height = layout.h;
        if (layout.l != null) els.panel.style.left = layout.l;
        if (layout.t != null) els.panel.style.top = layout.t;
        if (layout.open === "1") setOpen(true);
        if (layout.diagramsCollapsed === "0") diagramsCollapsed = false;
      }
    } catch (_) {}
    setDiagramsCollapsed(diagramsCollapsed);
  }

  function saveLayout() {
    try {
      const r = els.panel.getBoundingClientRect();
      localStorage.setItem(
        "stefano-cifra-layout",
        JSON.stringify({
          w: els.panel.style.width || `${Math.round(r.width)}px`,
          h: els.panel.style.height || `${Math.round(r.height)}px`,
          l: els.panel.style.left,
          t: els.panel.style.top,
          open: state.open ? "1" : "0",
          diagramsCollapsed: state.diagramsCollapsed ? "1" : "0",
        }),
      );
    } catch (_) {}
  }

  function panelMaxSize() {
    const playerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--player-h")) || 58;
    return {
      w: window.innerWidth - 24,
      h: window.innerHeight - playerH - 24,
    };
  }

  function bindDrag() {
    els.head.addEventListener("mousedown", (e) => {
      if (e.target.closest(".cifra-panel__close")) return;
      e.preventDefault();
      const r = els.panel.getBoundingClientRect();
      state.drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      els.panel.classList.add("is-dragging");
    });
  }

  function bindResize() {
    const grips = els.panel.querySelectorAll(".cifra-panel__resize");
    grips.forEach((grip) => {
      grip.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = els.panel.getBoundingClientRect();
        state.resize = {
          mode: grip.dataset.resize,
          x: e.clientX,
          y: e.clientY,
          w: r.width,
          h: r.height,
          l: r.left,
        };
        els.panel.classList.add("is-resizing");
      });
    });

    window.addEventListener("mousemove", (e) => {
      if (state.drag) {
        const dx = e.clientX - state.drag.x;
        const dy = e.clientY - state.drag.y;
        els.panel.style.left = `${state.drag.l + dx}px`;
        els.panel.style.top = `${Math.max(8, state.drag.t + dy)}px`;
        return;
      }
      if (!state.resize) return;
      const { mode, x, y, w, h, l } = state.resize;
      const dx = e.clientX - x;
      const dy = e.clientY - y;
      const max = panelMaxSize();
      const newH = Math.min(max.h, Math.max(PANEL_MIN_H, h + dy));
      let newW = w;
      let newL = l;

      if (mode === "br") {
        newW = Math.min(max.w, Math.max(PANEL_MIN_W, w + dx));
      } else if (mode === "bl") {
        newW = Math.min(max.w, Math.max(PANEL_MIN_W, w - dx));
        newL = l + (w - newW);
        if (newL < 8) {
          newW = Math.max(PANEL_MIN_W, newW - (8 - newL));
          newL = 8;
        }
        const rightEdge = newL + newW;
        if (rightEdge > window.innerWidth - 12) {
          newW = Math.max(PANEL_MIN_W, window.innerWidth - 12 - newL);
        }
      }

      els.panel.style.width = `${Math.round(newW)}px`;
      els.panel.style.height = `${Math.round(newH)}px`;
      if (mode === "bl") els.panel.style.left = `${Math.round(newL)}px`;
    });

    window.addEventListener("mouseup", () => {
      if (state.drag) {
        state.drag = null;
        els.panel.classList.remove("is-dragging");
        saveLayout();
      }
      if (state.resize) {
        state.resize = null;
        els.panel.classList.remove("is-resizing");
        saveLayout();
      }
    });

    const ro = new ResizeObserver(() => saveLayout());
    ro.observe(els.panel);
  }

  async function loadForTrack(track) {
    if (!track?.cifra) {
      els.body.innerHTML = `<p class="cifra-empty">Cifra ainda não disponível para esta faixa.</p>`;
      els.progGrid.innerHTML = "";
      state.chordProgression = [];
      state.activeIndex = -1;
      return;
    }
    await loadDict();
    try {
      const res = await fetch(track.cifra);
      if (!res.ok) throw new Error("404");
      const text = await res.text();
      const parsed = parseCifraText(text);
      state.chordProgression = parsed.chordProgression;
      state.activeIndex = parsed.chordProgression.length ? 0 : -1;
      els.body.innerHTML = parsed.html;
      renderProgression();
      if (state.activeIndex >= 0) setActiveIndex(state.activeIndex);
    } catch (_) {
      els.body.innerHTML = `<p class="cifra-empty">Erro ao carregar cifra.</p>`;
      els.progGrid.innerHTML = "";
      state.chordProgression = [];
      state.activeIndex = -1;
    }
  }

  function init() {
    els = {
      panel: document.getElementById("cifra-panel"),
      head: document.getElementById("cifra-head"),
      body: document.getElementById("cifra-body"),
      progGrid: document.getElementById("cifra-prog-grid"),
      diagramsToggle: document.getElementById("cifra-diagrams-toggle"),
      toggle: document.getElementById("btn-cifra"),
      close: document.getElementById("cifra-close"),
    };
    if (!els.panel) return;

    restoreLayout();
    bindDrag();
    bindResize();

    els.toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(!state.open);
    });
    els.panel.addEventListener("click", (e) => e.stopPropagation());
    els.panel.addEventListener("mousedown", (e) => e.stopPropagation());
    els.close.addEventListener("click", () => setOpen(false));

    if (els.diagramsToggle) {
      els.diagramsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setDiagramsCollapsed(!state.diagramsCollapsed);
      });
      els.diagramsToggle.addEventListener("mousedown", (e) => e.stopPropagation());
    }

    els.body.addEventListener("click", (e) => {
      const btn = e.target.closest(".cifra-chord");
      if (!btn) return;
      e.stopPropagation();
      setActiveIndex(Number(btn.dataset.idx));
    });

    els.panel.addEventListener("click", (e) => {
      const slot = e.target.closest(".cifra-prog__slot[data-idx]");
      if (!slot) return;
      setActiveIndex(Number(slot.dataset.idx));
    });
  }

  window.CifraOverlay = { init, loadForTrack, setOpen, setActiveIndex };
})();
