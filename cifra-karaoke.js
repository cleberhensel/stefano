/**
 * Piloto karaoke — acordes em queda sincronizados ao stem de violão.
 */
(() => {
  const LEAD_SEC = 3.2;
  const HIT_Y = 88;
  const OFFSET_KEY = "stefano-karaoke-offsets";

  const state = {
    enabled: false,
    events: [],
    lastTrack: null,
    activeIdx: -1,
    clock: null,
    offsetSec: 0,
    loadError: null,
    uiReady: false,
  };

  let els = {};

  function timelinePath(track) {
    if (track?.timeline) return track.timeline;
    if (!track?.cifra) return null;
    return track.cifra.replace(/\.txt$/i, ".timeline.json");
  }

  function offsetKey() {
    return state.trackNum != null ? String(state.trackNum) : "default";
  }

  function restoreOffset() {
    state.offsetSec = 0;
    try {
      const raw = localStorage.getItem(OFFSET_KEY);
      if (!raw) return;
      const map = JSON.parse(raw);
      const v = parseFloat(map[offsetKey()]);
      if (Number.isFinite(v)) state.offsetSec = v;
    } catch (_) {}
  }

  function saveOffset() {
    try {
      let map = {};
      const raw = localStorage.getItem(OFFSET_KEY);
      if (raw) map = JSON.parse(raw) || {};
      map[offsetKey()] = state.offsetSec;
      localStorage.setItem(OFFSET_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function currentTime() {
    const fn = state.clock?.getTime || (() => 0);
    return (typeof fn === "function" ? fn() : 0) + state.offsetSec;
  }

  function findActiveIndex(t) {
    const ev = state.events;
    if (!ev.length) return -1;
    let lo = 0;
    let hi = ev.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ev[mid].t <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  function syncOverlay(idx) {
    if (idx === state.activeIdx) return;
    state.activeIdx = idx;
    if (window.CifraOverlay?.setActiveIndex && idx >= 0) {
      window.CifraOverlay.setActiveIndex(idx);
    }
  }

  function clearBlocks() {
    if (els.track) els.track.innerHTML = "";
    if (els.wait) els.wait.textContent = "";
    syncOverlay(-1);
  }

  function mountBlock(slot, chord, y, flags = {}) {
    const node = document.createElement("div");
    node.className = "karaoke-block";
    node.dataset.role = slot;
    node.innerHTML = `<span class="karaoke-block__label"></span>`;
    node.querySelector(".karaoke-block__label").textContent = chord;
    node.style.transform = `translate(-50%, ${y}px)`;
    if (flags.hit) node.classList.add("is-hit");
    if (flags.current) node.classList.add("is-current");
    if (flags.falling) node.classList.add("is-falling");
    els.track.appendChild(node);
    return node;
  }

  function findNextIndex(now, active) {
    if (active >= 0 && active + 1 < state.events.length) return active + 1;
    for (let i = 0; i < state.events.length; i++) {
      if (state.events[i].t > now + 0.02) return i;
    }
    return -1;
  }

  function renderBlocks(now) {
    if (!els.track || !state.events.length) return;

    const active = findActiveIndex(now);
    syncOverlay(active);

    const slots = [];
    const cur = active >= 0 ? state.events[active] : null;
    const nextIdx = findNextIndex(now, active);
    const next = nextIdx >= 0 ? state.events[nextIdx] : null;

    if (cur) {
      const holdUntil = state.events[active + 1]?.t ?? cur.t + (cur.dur || 2);
      if (now >= cur.t - 0.05 && now < holdUntil) {
        slots.push({ role: "current", chord: cur.chord, y: HIT_Y, flags: { hit: true, current: true } });
      }
    }

    if (next && now < next.t) {
      const start = next.t - LEAD_SEC;
      if (now >= start - 0.05) {
        const progress = Math.min(1, Math.max(0, (now - start) / LEAD_SEC));
        const y = Math.min(HIT_Y - 18, progress * HIT_Y);
        if (!slots.length || y < HIT_Y - 12) {
          slots.push({ role: "next", chord: next.chord, y, flags: { falling: true } });
        }
      }
    }

    els.track.innerHTML = "";
    for (const slot of slots) {
      mountBlock(slot.role, slot.chord, slot.y, slot.flags);
    }

    if (els.wait) {
      if (!slots.length && next) {
        const sec = Math.max(0, next.t - now);
        els.wait.textContent = sec > 0.5 ? `Próximo acorde em ${sec.toFixed(0)}s` : "";
      } else {
        els.wait.textContent = "";
      }
    }
  }

  function tick() {
    if (!state.enabled || !state.events.length) return;
    renderBlocks(currentTime());
  }

  function syncUi() {
    if (!state.uiReady) return;
    const has = state.events.length > 0;
    if (els.toggle) {
      els.toggle.disabled = !has;
      els.toggle.setAttribute("aria-pressed", String(state.enabled && has));
      if (!has) {
        els.toggle.title = state.loadError || "Karaoke indisponível nesta faixa";
      } else {
        els.toggle.title = state.enabled ? "Desligar karaoke de acordes" : "Karaoke de acordes (piloto)";
      }
      if (has) els.toggle.classList.add("is-available");
      else els.toggle.classList.remove("is-available");
    }
    if (els.lane) {
      const open = state.enabled && has;
      els.lane.classList.toggle("is-open", open);
      els.lane.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (state.enabled && has) tick();
    else if (!state.enabled) clearBlocks();
  }

  function setEnabled(on) {
    state.enabled = on;
    try {
      localStorage.setItem("stefano-karaoke-on", on ? "1" : "0");
    } catch (_) {}
    syncUi();
  }

  async function loadForTrack(track) {
    state.lastTrack = track || null;
    state.trackNum = track?.num ?? null;
    state.events = [];
    state.loadError = null;
    state.activeIdx = -1;
    restoreOffset();
    clearBlocks();

    const path = timelinePath(track);
    if (!path) {
      setEnabled(false);
      syncUi();
      return;
    }

    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.events = Array.isArray(data.events) ? data.events : [];
      if (!state.events.length) throw new Error("timeline vazia");
    } catch (err) {
      state.events = [];
      if (location.protocol === "file:") {
        state.loadError = "Abra via servidor local (não file://)";
      } else {
        state.loadError = "Timeline não encontrada";
      }
    }

    let wantOn = false;
    try {
      wantOn = localStorage.getItem("stefano-karaoke-on") === "1";
    } catch (_) {}
    state.enabled = wantOn && state.events.length > 0;
    syncUi();
  }

  function nudgeOffset(delta) {
    state.offsetSec = Math.round((state.offsetSec + delta) * 100) / 100;
    saveOffset();
    if (els.hint) {
      els.hint.textContent = `Offset ${state.offsetSec >= 0 ? "+" : ""}${state.offsetSec.toFixed(2)}s`;
      els.hint.classList.add("is-visible");
      clearTimeout(els.hint._t);
      els.hint._t = setTimeout(() => els.hint.classList.remove("is-visible"), 1600);
    }
    tick();
  }

  function init(opts = {}) {
    els = {
      lane: document.getElementById("karaoke-lane"),
      track: document.getElementById("karaoke-track"),
      wait: document.getElementById("karaoke-wait"),
      toggle: document.getElementById("btn-karaoke"),
      hint: document.getElementById("karaoke-offset-hint"),
    };
    if (!els.lane) return;

    restoreOffset();
    state.clock = opts;
    state.uiReady = true;

    if (els.toggle) {
      els.toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!state.events.length) return;
        setEnabled(!state.enabled);
      });
    }

    document.addEventListener("keydown", (e) => {
      if (!state.enabled || !state.events.length) return;
      if (e.target.matches("input, textarea, [contenteditable=true]")) return;
      if (e.key === "[") {
        e.preventDefault();
        nudgeOffset(-0.05);
      } else if (e.key === "]") {
        e.preventDefault();
        nudgeOffset(0.05);
      }
    });

    if (state.lastTrack) syncUi();
  }

  function refresh() {
    tick();
  }

  window.CifraKaraoke = {
    init,
    loadForTrack,
    setEnabled,
    tick,
    refresh,
    nudgeOffset,
  };
})();
