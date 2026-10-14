(() => {
  // 사례 제보를 받는 Google Apps Script 웹 앱 주소 (scripts/apps-script.gs 참고)
  // 비어 있으면 GitHub 이슈 양식으로 대신 연결한다
  const SUBMIT_ENDPOINT = "";
  const ISSUE_URL = "https://github.com/hyeji-simulacre/rax/issues/new?template=case.yml";

  // 카테고리: 색상 두 개(그라데이션)와 라인 아이콘
  const CATS = [
    { key: "분류·평가", en: "Classification & Appraisal", c: ["#5b7cff", "#9fb4ff"],
      icon: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><rect x="3" y="11" width="18" height="5" rx="1.5"/><path d="M8 20h8M7 6.5h3M7 13.5h3"/>' },
    { key: "공개·비식별", en: "Access & Privacy", c: ["#ff6b93", "#ffb3c6"],
      icon: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 20 4"/>' },
    { key: "OCR·고문서", en: "OCR & Manuscripts", c: ["#f59e0b", "#ffd27a"],
      icon: '<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 13h8M8 17h5"/>' },
    { key: "메타데이터·기술", en: "Metadata & Description", c: ["#14b8a6", "#8ff0dc"],
      icon: '<path d="M20 12 12 20l-8-8V4h8z"/><circle cx="8.5" cy="8.5" r="1.5"/>' },
    { key: "검색·챗봇", en: "Discovery & Chat", c: ["#8b5cf6", "#cdb6ff"],
      icon: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/>' },
    { key: "음성·영상", en: "Audio & Video", c: ["#fb7a3c", "#ffc29e"],
      icon: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>' },
    { key: "보존·관리 자동화", en: "Preservation & Automation", c: ["#0ea5e9", "#9adcff"],
      icon: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>' },
    { key: "정책·가이드", en: "Policy & Guidance", c: ["#22a06b", "#a7e8c4"],
      icon: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 8h6M9 12h6"/>' },
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c.key, c]));
  const FACETS = [
    { field: "region", label: "지역", values: ["국내", "해외"] },
    { field: "format", label: "형식", values: ["사이트·서비스", "GitHub·오픈소스", "MCP·API", "논문", "보고서", "기사·발표"] },
    { field: "orgType", label: "주체", values: ["공공기관", "기업", "학계·연구", "개인·커뮤니티"] },
  ];

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

  const state = { q: "", cat: null, region: null, format: null, orgType: null, sort: "recent" };
  let cases = [];

  // ---------- cover art ----------
  function art(cat, seed, word) {
    const c = CAT[cat] || CATS[0];
    const h = hash(seed);
    const a = 100 + (h % 80), x1 = 10 + (h % 50), y1 = 10 + ((h >> 3) % 50), x2 = 50 + ((h >> 5) % 40);
    return `<div class="art" style="background:linear-gradient(${a}deg, ${c.c[0]}, ${c.c[1]})">
      <span class="blob" style="width:60%;height:80%;left:${x1}%;top:${y1 - 30}%;background:${c.c[1]};opacity:.9"></span>
      <span class="blob" style="width:45%;height:60%;left:${x2}%;top:${40 + (h % 30)}%;background:#fff;opacity:.35"></span>
      <svg class="icon" viewBox="0 0 24 24">${c.icon}</svg>
      ${word ? `<span class="word">${esc(word)}</span>` : ""}
      <span class="grain"></span></div>`;
  }

  function imageFor(item) {
    if (item.image) return item.image;
    const m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/.exec(item.url || "");
    return m ? `https://opengraph.githubassets.com/1/${m[1]}/${m[2]}` : null;
  }

  function cover(item) {
    const img = imageFor(item);
    const fallback = art(item.category, item.id, shortOrg(item.org));
    if (!img) return fallback;
    // 이미지가 실패하면 생성 커버로 대체
    return `${fallback}<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
  }

  const shortOrg = o => { const s = String(o || "").split(/[·,(/]/)[0].trim(); return s.length > 22 ? s.slice(0, 21) + "…" : s; };
  const titleOf = it => it.titleKo || it.title;

  // ---------- render ----------
  function renderStats() {
    const orgs = new Set(cases.map(c => c.org)).size;
    const countries = new Set(cases.map(c => c.country)).size;
    const dom = cases.filter(c => c.region === "국내").length;
    $("#stats").innerHTML = [
      ["전체 사례", cases.length], ["국내", dom], ["해외", cases.length - dom], ["기관·주체", orgs], ["국가", countries],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  }

  function renderCategories() {
    $("#catGrid").innerHTML = CATS.map(c => {
      const n = cases.filter(x => x.category === c.key).length;
      return `<button class="cat-tile" data-cat="${esc(c.key)}">
        ${art(c.key, c.key)}
        <span class="label"><span><b>${esc(c.key)}</b><small>${esc(c.en)}</small></span><span class="n">${n}</span></span>
      </button>`;
    }).join("");
    $("#catGrid").onclick = e => {
      const t = e.target.closest("[data-cat]"); if (!t) return;
      state.cat = t.dataset.cat; update();
      $("#archive").scrollIntoView({ behavior: "smooth" });
    };
  }

  function renderChips() {
    const base = filtered({ ignore: "cat" });
    const allBtn = `<button class="chip" data-cat="" aria-pressed="${!state.cat}">전체<span class="c">${base.length}</span></button>`;
    $("#catChips").innerHTML = allBtn + CATS.map(c => {
      const n = base.filter(x => x.category === c.key).length;
      return `<button class="chip" data-cat="${esc(c.key)}" aria-pressed="${state.cat === c.key}"><span class="dot" style="background:${c.c[0]}"></span>${esc(c.key)}<span class="c">${n}</span></button>`;
    }).join("");

    $("#facetChips").innerHTML = FACETS.map((f, i) => {
      const pool = filtered({ ignore: f.field });
      return (i ? '<span class="sep"></span>' : "") + f.values.map(v => {
        const n = pool.filter(x => x[f.field] === v).length;
        return `<button class="chip" data-field="${f.field}" data-val="${esc(v)}" aria-pressed="${state[f.field] === v}">${esc(v)}<span class="c">${n}</span></button>`;
      }).join("");
    }).join("");
  }

  function filtered({ ignore } = {}) {
    const q = state.q.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    return cases.filter(it => {
      if (ignore !== "cat" && state.cat && it.category !== state.cat) return false;
      for (const f of FACETS) if (ignore !== f.field && state[f.field] && it[f.field] !== state[f.field]) return false;
      if (terms.length) {
        const hay = it._hay;
        return terms.every(t => hay.includes(t));
      }
      return true;
    });
  }

  function sorted(list) {
    const s = [...list];
    if (state.sort === "title") s.sort((a, b) => titleOf(a).localeCompare(titleOf(b), "ko"));
    else s.sort((a, b) => ((state.sort === "old" ? 1 : -1) * ((a.year || 0) - (b.year || 0))) || titleOf(a).localeCompare(titleOf(b), "ko"));
    return s;
  }

  function renderGrid() {
    const list = sorted(filtered());
    const parts = [];
    if (state.cat) parts.push(state.cat);
    for (const f of FACETS) if (state[f.field]) parts.push(state[f.field]);
    if (state.q) parts.push(`“${state.q}”`);
    $("#resultInfo").textContent = `${parts.length ? parts.join(" · ") + " — " : ""}${list.length}건의 사례`;
    $("#empty").hidden = list.length > 0;
    $("#grid").innerHTML = list.map(it => `
      <article class="card" tabindex="0" data-id="${esc(it.id)}">
        <div class="thumb">${cover(it)}
          <div class="badges"><span class="pill">${esc(it.category)}</span><span class="pill">${esc(it.apiType || it.format)}</span></div>
        </div>
        <div class="body">
          <div class="meta"><span>${esc(it.region === "국내" ? "국내" : it.country)}</span><i></i><span>${esc(shortOrg(it.org))}</span>${it.year ? `<i></i><span class="en">${it.year}</span>` : ""}</div>
          <h3>${esc(titleOf(it))}</h3>
          <p>${esc(it.summary)}</p>
        </div>
      </article>`).join("");
  }

  function update() {
    renderChips(); renderGrid();
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.cat) p.set("cat", state.cat);
    for (const f of FACETS) if (state[f.field]) p.set(f.field, state[f.field]);
    history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
  }

  // ---------- detail ----------
  function openDetail(id) {
    const it = cases.find(c => c.id === id); if (!it) return;
    $("#dCover").innerHTML = cover(it);
    $("#dMeta").innerHTML = [it.category, it.format, it.apiType, it.orgType, it.region === "국내" ? "국내" : it.country, it.year]
      .filter(Boolean).map(v => `<span class="pill">${esc(v)}</span>`).join("");
    $("#dTitle").textContent = titleOf(it);
    $("#dSub").textContent = [it.titleKo ? it.title : null, it.org].filter(Boolean).join(" — ");
    $("#dSummary").textContent = it.summary;
    $("#dTags").innerHTML = (it.tags || []).map(t => `<span>${esc(t)}</span>`).join("");
    $("#dLink").href = it.url;
    $("#detail").showModal();
  }

  // ---------- events ----------
  function bind() {
    let t;
    $("#q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; update(); }, 120); });
    $("#sort").addEventListener("change", e => { state.sort = e.target.value; renderGrid(); });
    $("#catChips").addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b) return;
      state.cat = b.dataset.cat || null; update();
    });
    $("#facetChips").addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b) return;
      const f = b.dataset.field; state[f] = state[f] === b.dataset.val ? null : b.dataset.val; update();
    });
    $("#grid").addEventListener("click", e => { const c = e.target.closest(".card"); if (c) openDetail(c.dataset.id); });
    $("#grid").addEventListener("keydown", e => { if (e.key === "Enter") { const c = e.target.closest(".card"); if (c) openDetail(c.dataset.id); } });
    $("#closeDetail").addEventListener("click", () => $("#detail").close());
    $("#detail").addEventListener("click", e => { if (e.target === $("#detail")) $("#detail").close(); });
    document.addEventListener("keydown", e => {
      if (e.key === "/" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
    });
    bindSubmit();
  }

  // ---------- submit ----------
  function openSubmit(e) {
    e?.preventDefault();
    if (!SUBMIT_ENDPOINT) { window.open(ISSUE_URL, "_blank", "noopener"); return; }
    $("#submitForm").hidden = false; $("#submitDone").hidden = true; $("#submitMsg").textContent = "";
    $("#submitDialog").showModal();
    $("#submitForm [name=title]").focus();
  }

  function bindSubmit() {
    $("#submitCat").insertAdjacentHTML("beforeend", CATS.map(c => `<option>${esc(c.key)}</option>`).join(""));
    $("#submitLink").addEventListener("click", openSubmit);
    $("#footerSubmit").addEventListener("click", openSubmit);
    if (location.hash === "#submit") setTimeout(openSubmit, 300);
    $("#closeSubmit").addEventListener("click", () => $("#submitDialog").close());
    $("#submitDialog").addEventListener("click", e => { if (e.target === $("#submitDialog")) $("#submitDialog").close(); });
    $("#submitAgain").addEventListener("click", () => { $("#submitForm").reset(); $("#submitForm").hidden = false; $("#submitDone").hidden = true; });

    $("#submitForm").addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.target, msg = $("#submitMsg"), btn = $("#submitBtn");
      const data = Object.fromEntries(new FormData(f));
      f.title.setAttribute("aria-invalid", !data.title.trim());
      const urlOk = /^https?:\/\/\S+\.\S+/.test(data.url.trim());
      f.url.setAttribute("aria-invalid", !urlOk);
      if (!data.title.trim()) { msg.textContent = "사례 제목을 적어 주세요."; f.title.focus(); return; }
      if (!urlOk) { msg.textContent = "링크는 http:// 또는 https:// 로 시작하는 주소로 적어 주세요."; f.url.focus(); return; }
      if (cases.some(c => c.url.replace(/\/$/, "") === data.url.trim().replace(/\/$/, ""))) {
        msg.textContent = "이미 아카이브에 있는 사례예요. 검색창에서 찾아보세요."; return;
      }
      msg.textContent = ""; btn.disabled = true; btn.textContent = "보내는 중…";
      const body = JSON.stringify(data);
      try {
        // Apps Script는 다른 출처에서 응답을 읽기 어려워 no-cors로 한 번만 보낸다 (검증은 위에서 끝냄)
        await fetch(SUBMIT_ENDPOINT, { method: "POST", mode: "no-cors", body });
        done();
      } catch (err) {
        msg.textContent = "보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
      } finally {
        btn.disabled = false; btn.textContent = "제보하기";
      }
      function done() { f.reset(); f.hidden = true; $("#submitDone").hidden = false; }
    });
  }

  function readParams() {
    const p = new URLSearchParams(location.search);
    state.q = p.get("q") || ""; $("#q").value = state.q;
    state.cat = CAT[p.get("cat")] ? p.get("cat") : null;
    for (const f of FACETS) state[f.field] = f.values.includes(p.get(f.field)) ? p.get(f.field) : null;
  }

  async function init() {
    bind(); readParams();
    try {
      const res = await fetch("data/cases.json", { cache: "no-cache" });
      cases = (await res.json()).map(c => ({
        ...c,
        _hay: [c.title, c.titleKo, c.org, c.country, c.category, c.format, c.orgType, c.apiType, c.summary, ...(c.tags || [])].join(" ").toLowerCase(),
      }));
    } catch (err) {
      $("#resultInfo").textContent = "사례 데이터를 불러오지 못했습니다.";
      return;
    }
    renderStats(); renderCategories(); update();
  }
  init();
})();
