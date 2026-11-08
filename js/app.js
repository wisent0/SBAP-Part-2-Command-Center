const App = (() => {
  let currentDays = [];
  let timerInt = null, timerSec = 180, timerMode = "spot", soePhase = 1;

  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.15); o.stop(ctx.currentTime + i * 0.15 + 0.32);
      });
    } catch (e) {}
  }

  async function init() {
    await StorageEngine.init();
    const savedM = localStorage.getItem("sbap_m") || "m01_nov";
    const savedW = localStorage.getItem("sbap_w") || "week1";
    document.getElementById("monthSelect").value = savedM;
    document.getElementById("weekSelect").value = savedW;
    await loadSelectedPeriod();
    refreshAll();
  }

  function switchTab(tabId, btn) {
    document.querySelectorAll(".tab-section").forEach(s => s.classList.toggle("active", s.id === tabId));
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    if (tabId === "tab-onepagers") loadOnePager(document.getElementById("onePagerSelect").value);
  }

  async function loadSelectedPeriod() {
    const m = document.getElementById("monthSelect").value;
    const w = document.getElementById("weekSelect").value;
    localStorage.setItem("sbap_m", m);
    localStorage.setItem("sbap_w", w);

    try {
      const r = await fetch(`data/${m}/${w}.json?t=${Date.now()}`);
      if (!r.ok) throw new Error(`data/${m}/${w}.json not created yet`);
      const data = await r.json();
      document.getElementById("weekTitleDisplay").textContent = data.title || `${m} - ${w}`;
      currentDays = data.days || [];
    } catch (e) {
      document.getElementById("weekTitleDisplay").textContent = `Pending File: data/${m}/${w}.json`;
      currentDays = [];
    }
    renderSchedule();
    if (document.getElementById("tab-onepagers").classList.contains("active")) {
      loadOnePager(document.getElementById("onePagerSelect").value);
    }
  }

  function renderSchedule() {
    const tbody = document.getElementById("scheduleBody");
    const done = StorageEngine.getState().completedDays || [];

    if (!currentDays.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:18px;">Add this week's JSON file to view schedule.</td></tr>`;
    } else {
      tbody.innerHTML = currentDays.map(d => {
        const isDone = done.includes(d.id);
        return `
          <tr class="${isDone ? "completed" : ""}">
            <td style="text-align:center;"><input type="checkbox" ${isDone ? "checked" : ""} onchange="App.toggleDay('${d.id}')" /></td>
            <td><strong>${d.date}</strong><br><span class="badge ${d.badge || "b-cns"}">${d.tag}</span></td>
            <td><strong>${d.time}</strong></td>
            <td>${d.b1}</td>
            <td>${d.b2}</td>
            <td>${d.b3}</td>
          </tr>`;
      }).join("");
    }

    const wkTotal = currentDays.length || 7;
    const wkDone = currentDays.filter(d => done.includes(d.id)).length;
    const pct = Math.round((wkDone / wkTotal) * 100);
    document.getElementById("progressBar").style.width = `${pct}%`;
    document.getElementById("progressText").textContent = `${wkDone} / ${wkTotal} Days (${pct}%)`;
    document.getElementById("globalStats").textContent = `Total Completed Across All Months: ${done.length} Days`;
  }

  function toggleDay(id) {
    const st = StorageEngine.getState();
    const set = new Set(st.completedDays || []);
    set.has(id) ? set.delete(id) : set.add(id);
    st.completedDays = Array.from(set);
    StorageEngine.saveState(st, true);
    renderSchedule();
  }

  async function loadOnePager(opKey) {
    const m = document.getElementById("monthSelect").value;
    const box = document.getElementById("onePagerContent");
    box.innerHTML = `<p class="muted-hint">Loading data/${m}/${opKey}.html...</p>`;
    try {
      const r = await fetch(`data/${m}/${opKey}.html?t=${Date.now()}`);
      if (!r.ok) throw new Error(`File data/${m}/${opKey}.html not added yet.`);
      box.innerHTML = await r.text();
    } catch (e) {
      box.innerHTML = `<p class="muted-hint">${e.message}</p>`;
    }
  }

  function renderSOE() {
    const logs = StorageEngine.getState().soeLogs || [];
    const box = document.getElementById("soeLogList");
    if (!logs.length) {
      box.innerHTML = `<div class="card"><p class="muted-hint">No SOE entries yet.</p></div>`;
      return;
    }
    box.innerHTML = logs.map((l, i) => `
      <div class="soe-entry-card">
        <div class="card-header-row">
          <strong style="color:var(--accent);">${l.diag}</strong>
          <button class="btn btn-danger btn-sm no-print" onclick="App.delSOE(${i})">Delete</button>
        </div>
        <div style="font-size:0.83rem;margin-bottom:6px;"><strong>Morphology &amp; DDx:</strong> ${l.morph}</div>
        <div class="soe-domains-grid">
          <div class="soe-domain-box"><strong>1. Data-Gathering:</strong><br>${l.d1}</div>
          <div class="soe-domain-box"><strong>2. Reasoning (IHC/Mol):</strong><br>${l.d2}</div>
          <div class="soe-domain-box"><strong>3. Decision-Making:</strong><br>${l.d3}</div>
          <div class="soe-domain-box"><strong>4. Professional &amp; QC:</strong><br>${l.d4}</div>
        </div>
      </div>`).join("");
  }

  function addSOELog() {
    const diag = document.getElementById("soeDiag").value.trim();
    if (!diag) return alert("Enter Diagnosis.");
    const st = StorageEngine.getState();
    st.soeLogs = st.soeLogs || [];
    st.soeLogs.unshift({
      diag,
      morph: document.getElementById("soeMorph").value.trim(),
      d1: document.getElementById("soeD1").value.trim(),
      d2: document.getElementById("soeD2").value.trim(),
      d3: document.getElementById("soeD3").value.trim(),
      d4: document.getElementById("soeD4").value.trim()
    });
    StorageEngine.saveState(st, true);
    ["soeDiag", "soeMorph", "soeD1", "soeD2", "soeD3", "soeD4"].forEach(id => document.getElementById(id).value = "");
    renderSOE();
  }

  function delSOE(idx) {
    const st = StorageEngine.getState();
    st.soeLogs.splice(idx, 1);
    StorageEngine.saveState(st, true);
    renderSOE();
  }

  function renderConfidence() {
    const conf = StorageEngine.getState().confidence || {};
    document.getElementById("confidenceGrid").innerHTML = Object.entries(conf).map(([k, v]) => `
      <div class="conf-card">
        <div class="card-header-row"><span>${k}</span><span style="color:var(--accent);">${v.current}/5</span></div>
        <div class="muted-hint">Baseline: ${v.baseline}/5 | ${v.weight}</div>
        <input type="range" min="1" max="5" step="0.5" value="${v.current}" onchange="App.setConf('${k}', this.value)" />
      </div>`).join("");
  }

  function setConf(k, val) {
    const st = StorageEngine.getState();
    if (st.confidence[k]) st.confidence[k].current = Number(val);
    StorageEngine.saveState(st, true);
    renderConfidence();
  }

  function fmtTime() {
    const m = String(Math.floor(timerSec / 60)).padStart(2, "0");
    const s = String(timerSec % 60).padStart(2, "0");
    document.getElementById("timerDisplay").textContent = `${m}:${s}`;
  }

  function setTimer(mode) {
    clearInterval(timerInt); timerInt = null; timerMode = mode; soePhase = 1;
    document.getElementById("timerBtn").textContent = "Start";
    const lbl = document.getElementById("timerLabel");
    if (mode === "spot") { timerSec = 180; lbl.textContent = "3m Spot Slide"; }
    else if (mode === "cyto") { timerSec = 480; lbl.textContent = "8m Cytology"; }
    else { timerSec = 600; lbl.textContent = "SOE 1/2: 10m Slide Review"; }
    fmtTime();
  }

  function toggleTimer() {
    const btn = document.getElementById("timerBtn"), lbl = document.getElementById("timerLabel");
    if (timerInt) { clearInterval(timerInt); timerInt = null; btn.textContent = "Resume"; return; }
    btn.textContent = "Pause";
    timerInt = setInterval(() => {
      if (timerSec > 0) { timerSec--; fmtTime(); }
      else if (timerMode === "soe" && soePhase === 1) {
        soePhase = 2; timerSec = 600; chime();
        lbl.textContent = "SOE 2/2: 10m Oral Encounter!"; fmtTime();
      } else {
        clearInterval(timerInt); timerInt = null; chime();
        btn.textContent = "Start"; lbl.textContent = "Time Up!";
      }
    }, 1000);
  }

  function resetTimer() { setTimer(timerMode); }
  function refreshAll() { renderSchedule(); renderSOE(); renderConfidence(); }

  return { init, switchTab, loadSelectedPeriod, toggleDay, loadOnePager, addSOELog, delSOE, setConf, setTimer, toggleTimer, resetTimer, refreshAll };
})();

document.addEventListener("DOMContentLoaded", App.init);