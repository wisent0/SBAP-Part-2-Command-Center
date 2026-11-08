const StorageEngine = (() => {
  const STATE_KEY = "sbap_vault_state_v2";
  const GH_KEY = "sbap_vault_gh_v2";
  const FILE_PATH = "data/progress.json";

  const defaultState = {
    lastUpdated: new Date().toISOString(),
    completedDays: [],
    confidence: {
      "CNS / Neuropathology": { baseline: 1, current: 1, weight: "Surgical Path (50%)" },
      "Soft Tissue & Bone": { baseline: 1, current: 1, weight: "Surgical Path (50%)" },
      "Head & Neck": { baseline: 2, current: 2, weight: "Surgical Path (50%)" },
      "Dermatopathology": { baseline: 2, current: 2, weight: "Surgical Path (50%)" },
      "Hematopathology": { baseline: 2, current: 2, weight: "Surgical Path (50%)" },
      "Breast & GYN": { baseline: 3, current: 3, weight: "Surgical Path (50%)" },
      "GI & Medical Liver": { baseline: 3, current: 3, weight: "Surgical Path (50%)" },
      "GU & Medical Renal": { baseline: 3, current: 3, weight: "Surgical Path (50%)" },
      "Endocrine": { baseline: 3, current: 3, weight: "Surgical Path (50%)" },
      "Cytopathology": { baseline: 3, current: 3, weight: "18% Written + Day 1" },
      "Quality & Safety": { baseline: 2, current: 2, weight: "12% Written + Day 2 SOE" },
      "Special Stains & IHC": { baseline: 3, current: 3, weight: "5% Written + Day 2 SOE" },
      "Molecular, Cytogenetics & EM": { baseline: 2, current: 2, weight: "5% Written + Day 2 SOE" },
      "General Pathology": { baseline: 3, current: 3, weight: "5% Written + Day 2 SOE" },
      "Autopsy & Forensic (BIP)": { baseline: 2, current: 2, weight: "5% Written + Day 2 SOE" }
    },
    soeLogs: []
  };

  let state = null;
  const toB64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const fromB64 = (b) => decodeURIComponent(escape(atob(b.replace(/\s/g, ""))));

  function setStatus(msg, cls = "") {
    const el = document.getElementById("syncStatus");
    if (el) { el.textContent = msg; el.className = "sync-badge " + cls; }
  }

  async function init() {
    loadGHUI();
    const local = localStorage.getItem(STATE_KEY);
    if (local) {
      try { state = JSON.parse(local); return state; } catch (e) {}
    }
    try {
      const r = await fetch(`${FILE_PATH}?t=${Date.now()}`);
      if (r.ok) {
        state = { ...defaultState, ...(await r.json()) };
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
        return state;
      }
    } catch (e) {}
    state = JSON.parse(JSON.stringify(defaultState));
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return state;
  }

  function getState() { return state || defaultState; }

  function saveState(newState, autoPush = true) {
    state = { ...newState, lastUpdated: new Date().toISOString() };
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    setStatus("Local Saved");
    const cfg = getGHConfig();
    if (autoPush && cfg.autoSync && cfg.token) pushToGitHub(true);
  }

  function getGHConfig() {
    try { return JSON.parse(localStorage.getItem(GH_KEY)) || {}; } catch { return {}; }
  }

  function loadGHUI() {
    const c = getGHConfig();
    if (document.getElementById("ghOwner")) document.getElementById("ghOwner").value = c.owner || "";
    if (document.getElementById("ghRepo")) document.getElementById("ghRepo").value = c.repo || "";
    if (document.getElementById("ghBranch")) document.getElementById("ghBranch").value = c.branch || "main";
    if (document.getElementById("ghToken")) document.getElementById("ghToken").value = c.token || "";
    if (document.getElementById("autoSyncToggle")) document.getElementById("autoSyncToggle").checked = !!c.autoSync;
  }

  function saveGitHubConfig() {
    const cfg = {
      owner: document.getElementById("ghOwner").value.trim(),
      repo: document.getElementById("ghRepo").value.trim(),
      branch: document.getElementById("ghBranch").value.trim() || "main",
      token: document.getElementById("ghToken").value.trim(),
      autoSync: document.getElementById("autoSyncToggle").checked
    };
    localStorage.setItem(GH_KEY, JSON.stringify(cfg));
    setStatus("GitHub Settings Saved");
  }

  async function pushToGitHub(silent = false) {
    const c = getGHConfig();
    if (!c.owner || !c.repo || !c.token) {
      if (!silent) alert("Configure GitHub Sync settings first.");
      return;
    }
    setStatus("Syncing...", "syncing");
    const url = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${FILE_PATH}`;
    const headers = { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json" };
    try {
      let sha = null;
      const g = await fetch(`${url}?ref=${c.branch}`, { headers });
      if (g.ok) sha = (await g.json()).sha;
      const body = { message: "Sync progress", content: toB64(JSON.stringify(getState(), null, 2)), branch: c.branch };
      if (sha) body.sha = sha;
      const p = await fetch(url, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!p.ok) throw new Error(`HTTP ${p.status}`);
      setStatus("☁️ GitHub Synced");
    } catch (e) {
      setStatus("Sync Error", "error");
      if (!silent) alert("GitHub Push Failed: " + e.message);
    }
  }

  async function pullFromGitHub() {
    const c = getGHConfig();
    if (!c.owner || !c.repo || !c.token) return alert("Configure GitHub Sync settings first.");
    setStatus("Pulling...", "syncing");
    const url = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${FILE_PATH}?ref=${c.branch}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const remote = JSON.parse(fromB64((await r.json()).content));
      saveState(remote, false);
      if (window.App) App.refreshAll();
      setStatus("☁️ Pulled from GitHub");
    } catch (e) {
      setStatus("Pull Error", "error");
      alert("GitHub Pull Failed: " + e.message);
    }
  }

  function exportJSON() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" }));
    a.download = `SBAP_Progress_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  }

  function importJSON(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        saveState(JSON.parse(ev.target.result), false);
        if (window.App) App.refreshAll();
        setStatus("Backup Restored");
      } catch { alert("Invalid JSON file."); }
    };
    reader.readAsText(f);
  }

  return { init, getState, saveState, saveGitHubConfig, pushToGitHub, pullFromGitHub, exportJSON, importJSON };
})();