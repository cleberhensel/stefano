/**
 * Utilitários compartilhados: progressão da cifra + timeline manual.
 */
(() => {
  const CHORD_RE =
    /(?<![A-Za-zÀ-ÿ])([A-G][#b]?(?:[°º](?:\([^)]*\))*|(?:(?:m(?!aj)|maj|min|dim|aug|sus|add)?(?:[0-9]+-\/(?:[A-G][#b]?|[0-9]+)|[0-9]+-(?=[(\s\]\[,]|$)|[0-9]+)?M?(?:\/[0-9]+)?(?:\([^)]*\))*(?:\/[A-G][#b]?)?)))(?![a-zà-ÿ])/gi;

  function chordCount(line) {
    CHORD_RE.lastIndex = 0;
    return (line.match(CHORD_RE) || []).length;
  }

  function isChordsLine(line) {
    const words = line.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
    return chordCount(line) >= 1 && words.length <= 3;
  }

  function parseProgression(text) {
    const chords = [];
    for (const raw of text.split("\n")) {
      const line = raw.replace(/\r$/, "");
      const sec = line.trim();
      if (sec.startsWith("[") && sec.endsWith("]")) continue;
      if (!isChordsLine(line)) continue;
      CHORD_RE.lastIndex = 0;
      let m;
      while ((m = CHORD_RE.exec(line)) !== null) chords.push(m[1]);
    }
    return chords;
  }

  function formatTime(s) {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${m}:${String(sec).padStart(2, "0")}.${ms}`;
  }

  function eventsWithDuration(events, durationSec) {
    return events.map((ev, i) => {
      const nextT = events[i + 1]?.t;
      const dur = nextT != null ? Math.max(0.2, nextT - ev.t) : Math.max(0.2, (durationSec || ev.t + 2) - ev.t);
      return { t: Math.round(ev.t * 100) / 100, chord: ev.chord, dur: Math.round(dur * 100) / 100 };
    });
  }

  function buildTimeline(track, marks, durationSec) {
    const events = eventsWithDuration(marks, durationSec);
    const outPath = track.cifra ? track.cifra.replace(/\.txt$/i, ".timeline.json") : null;
    return {
      track: track.num,
      title: track.title,
      source: "manual-annotate",
      method: "keyboard-L",
      duration_sec: durationSec ? Math.round(durationSec * 100) / 100 : null,
      chord_count: events.length,
      output: outPath,
      events,
    };
  }

  function uniqueChords(progression) {
    const seen = new Set();
    const out = [];
    for (const c of progression) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  }

  function parseShape(shape) {
    const tokens = String(shape || "")
      .trim()
      .split(/\s+/);
    if (tokens.length !== 6) return [-1, -1, -1, -1, -1, -1];
    return tokens.map((s) => {
      if (s === "X" || s === "x") return -1;
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : -1;
    });
  }

  function formatShape(frets) {
    return frets
      .map((f) => {
        if (f === -1) return "X";
        if (f === 0) return "0";
        return String(f);
      })
      .join(" ");
  }

  function dictLookup(dict, name) {
    if (!dict || !name) return null;
    return dict[name] || dict[name.replace("º", "°")] || dict[name.replace("°", "º")] || null;
  }

  const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
  const NOTE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NOTE_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  const CHORD_TEMPLATES = [
    { suffix: "", intervals: [0, 4, 7], weight: 10 },
    { suffix: "m", intervals: [0, 3, 7], weight: 10 },
    { suffix: "dim", intervals: [0, 3, 6], weight: 8 },
    { suffix: "aug", intervals: [0, 4, 8], weight: 7 },
    { suffix: "sus4", intervals: [0, 5, 7], weight: 8 },
    { suffix: "sus2", intervals: [0, 2, 7], weight: 7 },
    { suffix: "6", intervals: [0, 4, 7, 9], weight: 8 },
    { suffix: "m6", intervals: [0, 3, 7, 9], weight: 8 },
    { suffix: "7", intervals: [0, 4, 7, 10], weight: 9 },
    { suffix: "7M", intervals: [0, 4, 7, 11], weight: 9 },
    { suffix: "m7", intervals: [0, 3, 7, 10], weight: 9 },
    { suffix: "m7M", intervals: [0, 3, 7, 11], weight: 7 },
    { suffix: "dim7", intervals: [0, 3, 6, 9], weight: 7 },
    { suffix: "m7(5-)", intervals: [0, 3, 6, 10], weight: 8 },
    { suffix: "7(5-)", intervals: [0, 4, 6, 10], weight: 6 },
    { suffix: "7(9-)", intervals: [0, 4, 7, 10, 13], weight: 6 },
    { suffix: "9", intervals: [0, 4, 7, 10, 14], weight: 7 },
    { suffix: "m7(9-)", intervals: [0, 3, 7, 10, 13], weight: 6 },
    { suffix: "add9", intervals: [0, 4, 7, 14], weight: 6 },
  ];

  function preferFlats(hint) {
    if (!hint) return false;
    return /[bB](?![a-z])|Bb|Db|Eb|Gb|Ab/.test(hint) || hint.includes("º");
  }

  function pcName(pc, useFlats) {
    return (useFlats ? NOTE_FLAT : NOTE_SHARP)[((pc % 12) + 12) % 12];
  }

  function notesFromFrets(frets) {
    const out = [];
    for (let s = 0; s < 6; s++) {
      const f = frets[s];
      if (f < 0) continue;
      out.push({ midi: OPEN_MIDI[s] + f, s, pc: (OPEN_MIDI[s] + f) % 12 });
    }
    out.sort((a, b) => a.midi - b.midi);
    return out;
  }

  function scoreTemplate(pcs, root, intervals) {
    if (!pcs.includes(root)) return 0;
    let hit = 0;
    for (const iv of intervals) {
      if (pcs.includes((root + iv) % 12)) hit++;
    }
    const req = Math.min(3, intervals.length);
    let reqHit = 0;
    for (let i = 0; i < req; i++) {
      if (pcs.includes((root + intervals[i]) % 12)) reqHit++;
    }
    if (reqHit < req) return 0;
    return hit / intervals.length;
  }

  function normalizeChordName(name) {
    return String(name || "")
      .replace(/maj7/gi, "7M")
      .replace(/min/gi, "m")
      .replace(/°/g, "º");
  }

  function chordNamesEquivalent(a, b) {
    if (!a || !b) return false;
    const na = normalizeChordName(a);
    const nb = normalizeChordName(b);
    if (na === nb) return true;
    if (na.replace(/\(5-\)/g, "b5") === nb.replace(/\(5-\)/g, "b5")) return true;
    return false;
  }

  function detectChordFromFrets(frets, hintName) {
    const notes = notesFromFrets(frets);
    if (!notes.length) {
      return { name: null, notes: [], alternatives: [], confidence: 0 };
    }

    const pcs = [...new Set(notes.map((n) => n.pc))];
    const bassPc = notes[0].pc;
    const useFlats = preferFlats(hintName);
    const candidates = [];

    for (let root = 0; root < 12; root++) {
      for (const tpl of CHORD_TEMPLATES) {
        const score = scoreTemplate(pcs, root, tpl.intervals);
        if (score < 0.55) continue;
        let name = pcName(root, useFlats) + tpl.suffix;
        const chordTones = tpl.intervals.map((i) => (root + i) % 12);
        if (bassPc !== root && !chordTones.includes(bassPc)) {
          name += `/${pcName(bassPc, useFlats)}`;
        }
        candidates.push({
          name,
          score: score * tpl.weight,
          root,
          bassPc,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const alts = [];
    for (const c of candidates.slice(1, 6)) {
      if (alts.some((a) => a.name === c.name)) continue;
      if (best && c.name === best.name) continue;
      alts.push({ name: c.name, score: c.score });
      if (alts.length >= 3) break;
    }

    const noteNames = notes.map((n) => pcName(n.pc, useFlats));
    return {
      name: best?.name || null,
      confidence: best ? Math.min(1, best.score / 10) : 0,
      notes: noteNames,
      bass: pcName(bassPc, useFlats),
      alternatives: alts,
    };
  }

  function replaceChordInText(text, from, to) {
    CHORD_RE.lastIndex = 0;
    const re = new RegExp(
      `(?<![A-Za-zÀ-ÿ])(${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![a-zà-ÿ])`,
      "g",
    );
    return text.replace(re, to);
  }

  window.StefanoCifra = {
    parseProgression,
    formatTime,
    buildTimeline,
    eventsWithDuration,
    uniqueChords,
    parseShape,
    formatShape,
    dictLookup,
    detectChordFromFrets,
    chordNamesEquivalent,
    normalizeChordName,
    replaceChordInText,
  };
})();
