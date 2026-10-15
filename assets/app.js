(() => {
  // 사례 제보를 받는 Google Apps Script 웹 앱 주소 (scripts/apps-script.gs 참고)
  // 비어 있으면 GitHub 이슈 양식으로 대신 연결한다
  const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbxX87E9EWyTEdpv6V-K8oH5MqfjljS5fP9HmDvJAiGsq0aijcNDjbk-xUhej3NH5-_JYw/exec";
  const ISSUE_URL = "https://github.com/hyeji-simulacre/rax/issues/new?template=case.yml";

  // 카테고리: 색상 두 개(그라데이션)와 라인 아이콘
  const CATS = [
    { key: "분류·평가", en: "Classification & Appraisal", c: ["#5c1716", "#7e201f"],
      icon: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><rect x="3" y="11" width="18" height="5" rx="1.5"/><path d="M8 20h8M7 6.5h3M7 13.5h3"/>' },
    { key: "공개·비식별", en: "Access & Privacy", c: ["#7e201f", "#a02928"],
      icon: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 20 4"/>' },
    { key: "OCR·고문서", en: "OCR & Manuscripts", c: ["#a02928", "#c23634"],
      icon: '<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 13h8M8 17h5"/>' },
    { key: "메타데이터·기술", en: "Metadata & Description", c: ["#c23634", "#d54746"],
      icon: '<path d="M20 12 12 20l-8-8V4h8z"/><circle cx="8.5" cy="8.5" r="1.5"/>' },
    { key: "검색·챗봇", en: "Discovery & Chat", c: ["#d54746", "#df6b6a"],
      icon: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/>' },
    { key: "음성·영상", en: "Audio & Video", c: ["#df6b6a", "#e88f8e"],
      icon: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>' },
    { key: "보존·관리 자동화", en: "Preservation & Automation", c: ["#e88f8e", "#efacab"],
      icon: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>' },
    { key: "정책·가이드", en: "Policy & Guidance", c: ["#efacab", "#f5c9c8"],
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

  const state = { q: "", cat: null, region: null, format: null, orgType: null, sort: "relevance", guide: null };
  let guides = [];

  // ---------- 문장형 질문 검색 ----------
  // 질문 문장에서 조사·어미·군더더기를 떼고, 기록관리 용어의 동의어로 넓혀 관련도를 매긴다
  const STOP = new Set(["ai", "인공지능", "기록", "기록관리", "사례", "관련", "대한", "대해", "어디", "어디서", "무엇", "뭐", "뭘", "어떤", "어떻게",
    "알려", "알려줘", "알려주세요", "있나요", "있을까", "있는", "있어", "하는", "하고", "싶어", "궁금", "궁금해", "곳", "좀", "쓰는", "쓴", "쓰고", "써서",
    "활용", "적용", "도입", "방법", "가능", "할까", "수", "것", "등", "및", "the", "and", "for", "how", "what"]);
  const ENDINGS = ["해주세요", "하려면", "하려고", "되나요", "인가요", "있나요", "에서는", "으로는", "해줘", "하는", "하기", "했던", "되는", "할까",
    "에서", "으로", "에게", "까지", "부터", "처럼", "이나", "은", "는", "이", "가", "을", "를", "에", "의", "로", "도", "와", "과", "요"];
  const SYN = {
    "손글씨": ["필기체", "htr", "필사"], "필기체": ["손글씨", "htr"], "한문": ["한자", "고문헌", "고문서"], "한자": ["한문", "고문헌"],
    "고문서": ["고문헌", "htr", "한문", "ocr"], "글자": ["ocr", "문자인식"], "문자인식": ["ocr"], "스캔": ["ocr", "디지털화"],
    "챗봇": ["rag", "질의응답", "대화형", "에이전트"], "검색": ["rag", "시맨틱", "의미 검색", "통합검색"], "질문": ["챗봇", "rag"],
    "녹음": ["음성", "전사", "stt", "whisper", "구술"], "구술": ["구술사", "전사", "whisper"], "전사": ["stt", "whisper", "음성인식", "asr"],
    "음성": ["stt", "asr", "음성인식", "whisper"], "영상": ["시청각", "방송", "얼굴 인식"], "회의록": ["전사", "속기", "음성"],
    "비공개": ["공개재분류", "비밀해제", "공개 전환", "비식별"], "개인정보": ["비식별", "pii", "가림", "민감정보"], "재분류": ["공개재분류"],
    "폐기": ["평가", "선별", "처분"], "평가": ["선별", "폐기"], "분류": ["자동분류", "분류기"], "보존기간": ["보존 레이블", "처분"],
    "메타데이터": ["기술", "색인", "목록", "태그"], "목록": ["카탈로그", "서지", "메타데이터"], "태그": ["태깅", "주석"],
    "보존": ["디지털 보존", "웹아카이빙"], "웹": ["웹아카이빙", "wayback"], "연결": ["mcp", "api"], "무료": ["오픈소스"],
    "정책": ["지침", "가이드", "거버넌스"], "윤리": ["책임", "투명성"], "생성형": ["llm", "gpt", "생성형ai"], "llm": ["대형언어모델", "gpt", "rag"],
  };
  const stripEnding = t => { for (const e of ENDINGS) if (t.endsWith(e) && t.length - e.length >= 2) return t.slice(0, -e.length); return t; };
  const tokenize = q => [...new Set(String(q).toLowerCase().split(/[^0-9a-z가-힣]+/).map(stripEnding)
    .filter(t => t.length >= 2 && !STOP.has(t)))];
  function scoreOf(it, toks) {
    let score = 0, hit = 0;
    for (const t of toks) {
      let best = 0;
      for (const v of [t, ...(SYN[t] || [])]) {
        if (it._title.includes(v)) best = Math.max(best, 3);
        else if (it._tags.includes(v)) best = Math.max(best, 2);
        else if (it._hay.includes(v)) best = Math.max(best, 1);
      }
      score += best; if (best) hit++;
    }
    return hit ? score + hit * 2 : 0;
  }
  function guideFor(toks) {
    let best = null, top = 0;
    for (const g of guides) {
      const n = g.keywords.filter(k => toks.some(t => t.includes(k) || (t.length >= 2 && k.includes(t)))).length;
      if (n > top) { top = n; best = g; }
    }
    return best;
  }
  let cases = [];

  // ---------- 부드러운 스크롤 (Lenis) ----------
  // 움직임 줄이기를 켠 사용자에게는 쓰지 않는다. 내부 스크롤 영역과 창(dialog)은 data-lenis-prevent 로 제외한다.
  let lenis = null;
  if (window.Lenis && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    lenis = new window.Lenis({ autoRaf: true, anchors: { offset: -80 }, lerp: 0.09, wheelMultiplier: 0.95 });
  }
  function goTo(target) {
    const el = typeof target === "string" ? $(target) : target;
    if (lenis) return lenis.scrollTo(el || 0, { offset: el ? -80 : 0, duration: 1.1 });
    if (el) el.scrollIntoView({ behavior: "smooth" }); else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- 표지: 원문 화면 썸네일, 없으면 흰 카탈로그 카드 ----------
  let thumbs = {};
  const CC = { "대한민국": "KR", "미국": "US", "영국": "UK", "호주": "AU", "캐나다": "CA", "네덜란드": "NL", "일본": "JP", "중국": "CN", "대만": "TW",
    "독일": "DE", "프랑스": "FR", "스웨덴": "SE", "핀란드": "FI", "덴마크": "DK", "에스토니아": "EE", "뉴질랜드": "NZ", "노르웨이": "NO", "오스트리아": "AT",
    "벨기에": "BE", "스위스": "CH", "싱가포르": "SG", "슬로베니아": "SI", "국제": "INT" };
  const ccOf = it => CC[it.country] || (it.region === "국내" ? "KR" : "INT");
  function imageFor(item) {
    if (thumbs[item.id]) return thumbs[item.id];
    if (item.image) return item.image;
    const m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/.exec(item.url || "");
    return m ? `https://opengraph.githubassets.com/1/${m[1]}/${m[2]}` : null;
  }
  function catalog(it) {
    const c = CAT[it.category] || CATS[0];
    return `<div class="catalog" style="--cat:${c.c[0]}">
      <b class="org">${esc(shortOrg(it.org))}</b>
      <span class="rules"></span>
      <span class="yr">${it.year || "—"}</span><span class="cc">${ccOf(it)}</span></div>`;
  }
  function cover(item) {
    const img = imageFor(item);
    // 이미지가 실패하면 카탈로그 카드가 그대로 남는다
    return catalog(item) + (img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "");
  }
  function mini(it) {
    const c = CAT[it.category] || CATS[0], img = imageFor(it);
    const initials = shortOrg(it.org).replace(/[^0-9A-Za-z가-힣]/g, "").slice(0, 2).toUpperCase();
    return `<span class="mini-art" style="--cat:${c.c[0]}"><i></i>${esc(initials)}${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>`;
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
      return `<button class="cat-tile" data-cat="${esc(c.key)}" style="--cat:${c.c[0]}">
        <svg class="ic" viewBox="0 0 24 24">${c.icon}</svg>
        <span class="n">${n}</span>
        <span class="label"><b>${esc(c.key)}</b><small>${esc(c.en)}</small></span>
      </button>`;
    }).join("");
    $("#catGrid").onclick = e => {
      const t = e.target.closest("[data-cat]"); if (!t) return;
      state.cat = t.dataset.cat; state.guide = null; update();
      goTo("#archive");
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
    const toks = tokenize(state.q);
    const pool = cases.filter(it => {
      if (ignore !== "cat" && state.cat && it.category !== state.cat) return false;
      for (const f of FACETS) if (ignore !== f.field && state[f.field] && it[f.field] !== state[f.field]) return false;
      it._score = toks.length ? scoreOf(it, toks) : 0;
      return true;
    });
    if (!toks.length) return pool;
    // 가장 잘 맞는 사례의 1/3에도 못 미치는 약한 일치는 뺀다
    const top = Math.max(0, ...pool.map(it => it._score));
    const cut = Math.max(1, top / 3);
    return pool.filter(it => it._score >= cut);
  }

  function sorted(list) {
    const s = [...list];
    const byYear = (a, b) => (b.year || 0) - (a.year || 0) || titleOf(a).localeCompare(titleOf(b), "ko");
    if (state.sort === "title") s.sort((a, b) => titleOf(a).localeCompare(titleOf(b), "ko"));
    else if (state.sort === "old") s.sort((a, b) => -byYear(a, b));
    else if (state.sort === "relevance") s.sort((a, b) => (b._score || 0) - (a._score || 0) || byYear(a, b));
    else s.sort(byYear);
    return s;
  }

  // ---------- 이번 주의 사례 (Awwwards의 Site of the Day 자리) ----------
  // 매주 바뀌는 질문 제시어의 '먼저 볼 사례' 가운데, 주차에 따라 하나를 고른다. 썸네일이 있는 사례를 먼저 쓴다.
  function renderFeature() {
    if (!guides.length) return;
    const d = new Date(), week = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 6048e5);
    const g = guides[week % guides.length];
    const picks = picksFor(g);
    const it = picks.find(p => imageFor(p)) || picks[0];
    if (!it) return;
    const c = CAT[it.category] || CATS[0];
    const box = $("#feature");
    box.innerHTML = `
      <div class="feature-media" data-open="${esc(it.id)}">${cover(it)}</div>
      <div class="feature-info">
        <p class="kicker en">Case of the Week</p>
        <h2>${esc(titleOf(it))}</h2>
        <p class="feature-by">by <b>${esc(it.org)}</b></p>
        <dl class="feature-meta">
          <div><dt>카테고리</dt><dd>${esc(it.category)}</dd></div>
          <div><dt>형식</dt><dd>${esc(it.apiType || it.format)}</dd></div>
          <div><dt>지역</dt><dd>${esc(it.region === "국내" ? "국내" : it.country)}</dd></div>
          <div><dt>연도</dt><dd>${it.year || "—"}</dd></div>
        </dl>
        <p class="feature-why">${esc(it._why || it.summary)}</p>
        <div class="feature-actions">
          <a class="glass-btn solid" href="${esc(it.url)}" target="_blank" rel="noopener">원문 보기 <svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
          <button class="glass-btn" type="button" data-open="${esc(it.id)}">자세히</button>
          <button class="glass-btn" type="button" data-guide="${esc(g.id)}">관련 질문: ${esc(g.q)}</button>
        </div>
      </div>`;
    box.hidden = false;
  }

  // ---------- 질문 제시어 · 안내 패널 ----------
  function renderPrompts() {
    $("#prompts").innerHTML = guides.map(g => {
      return `<button class="prompt" type="button" data-guide="${esc(g.id)}">${esc(g.q)}</button>`;
    }).join("");
  }

  // 제시어로 걸린 필터는 새 질문을 쓰면 함께 풀어 준다 (직접 고른 필터는 그대로 둔다)
  function leaveGuide() {
    if (!state.guide) return;
    state.guide = null; state.cat = null;
    for (const f of FACETS) state[f.field] = null;
  }

  function applyGuide(id) {
    const g = guides.find(x => x.id === id); if (!g) return;
    state.guide = g.id; state.cat = g.filter.cat || null;
    for (const f of FACETS) state[f.field] = g.filter[f.field] || null;
    state.q = g.filter.q || ""; $("#q").value = state.q;
    update();
    goTo("#archive");
  }

  // 먼저 볼 사례: 주간 작업이 고른 화제·흐름 사례를 쓰되, 3주 넘게 갱신이 없으면 해당 주제의 최신 사례로 대신한다
  const STALE_DAYS = 21;
  const isStale = g => !g.updated || (Date.now() - new Date(g.updated + "T00:00:00+09:00")) / 864e5 > STALE_DAYS;
  function picksFor(g) {
    if (!isStale(g)) {
      return g.picks.map(p => typeof p === "string" ? { id: p } : p)
        .map(p => { const it = cases.find(x => x.id === p.id); return it && { ...it, _why: p.why }; }).filter(Boolean);
    }
    return cases.filter(it => (!g.filter.cat || it.category === g.filter.cat) && (!g.filter.format || it.format === g.filter.format)
        && (!g.filter.q || it._hay.includes(g.filter.q.toLowerCase())))
      .sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 3)
      .map(it => ({ ...it, _why: it.year ? `${it.year}년 사례` : "" }));
  }
  function picksLabel(g) {
    if (isStale(g)) return "· 최신순";
    const [, m, d] = g.updated.split("-").map(Number);
    return `· ${m}월 ${d}일 기준, 매주 화제와 흐름에 맞춰 바뀌어요`;
  }

  function renderAnswer(list) {
    const box = $("#answer");
    let g = state.guide && guides.find(x => x.id === state.guide), matched = false;
    if (!g && state.q.trim()) { g = guideFor(tokenize(state.q)); matched = !!g; }
    if (!g) { box.hidden = true; box.innerHTML = ""; return; }
    const c = CAT[g.filter.cat];
    const picks = picksFor(g);
    const others = guides.filter(x => x.id !== g.id).slice(0, 10).sort((a, b) => hash(a.id + g.id) - hash(b.id + g.id)).slice(0, 3);
    box.style.setProperty("--accent", c ? c.c[0] : "#0f1115");
    box.innerHTML = `
      <p class="kicker">${matched ? "이 질문과 가까운 안내" : "Quick answer"}</p>
      <h3>${esc(g.q)}</h3>
      ${state.guide ? `<button class="glass-btn icon close" type="button" data-close aria-label="안내 닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ""}
      <p class="intro">${esc(g.intro)}</p>
      ${picks.length ? `<p class="picks-title">먼저 볼 사례 <span>${esc(picksLabel(g))}</span></p>
      <div class="picks">${picks.map(it => `
        <button class="pick" type="button" data-id="${esc(it.id)}">
          <span class="mini">${mini(it)}</span>
          <span><b>${esc(titleOf(it))}</b>${it._why ? `<em>${esc(it._why)}</em>` : ""}<small>${esc(it.region === "국내" ? "국내" : it.country)} · ${esc(shortOrg(it.org))}</small></span>
        </button>`).join("")}</div>` : ""}
      <p class="more">${matched ? `<a href="#" data-guide="${esc(g.id)}">이 안내로 사례 모아 보기</a> · ` : ""}아래에서 관련 사례 ${list.length}건을 더 볼 수 있어요.</p>
      <div class="related">${others.map(o => `<button class="prompt" type="button" data-guide="${esc(o.id)}">${esc(o.q)}</button>`).join("")}</div>`;
    box.hidden = false;
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
          <h3>${esc(titleOf(it))}</h3>
          <div class="by"><span>by <b>${esc(shortOrg(it.org))}</b></span><span class="where">${esc(it.region === "국내" ? "국내" : it.country)}${it.year ? ` · ${it.year}` : ""}</span></div>
        </div>
      </article>`).join("");
  }

  function update() {
    renderChips(); renderGrid();
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.guide) p.set("guide", state.guide);
    else {
      if (state.cat) p.set("cat", state.cat);
      for (const f of FACETS) if (state[f.field]) p.set(f.field, state[f.field]);
    }
    history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
  }

  // ---------- 질문과 답 (왼쪽 대화 · 오른쪽 관련 사례) ----------
  const conv = { turns: [], ids: [], lastQ: "" };

  function retrieve(q, prevQ) {
    // '국내/해외'는 검색어가 아니라 지역 조건으로 읽는다
    const region = /국내|한국|우리나라/.test(q) ? "국내" : /해외|외국|국외/.test(q) ? "해외" : null;
    let toks = tokenize(q).filter(t => !/^(국내|한국|우리나라|해외|외국|국외|만|것만)/.test(t));
    if (!toks.length && prevQ) toks = tokenize(prevQ);
    const inRegion = list => region ? list.filter(it => it.region === region) : list;
    const rank = tk => {
      if (!tk.length) return [];
      const scored = cases.map(it => ({ it, s: scoreOf(it, tk) })).filter(x => x.s > 0);
      const top = Math.max(0, ...scored.map(x => x.s));
      return scored.filter(x => x.s >= Math.max(1, top / 3))
        .sort((a, b) => b.s - a.s || (b.it.year || 0) - (a.it.year || 0)).map(x => x.it);
    };
    let list = inRegion(rank(toks));
    // 짧은 추가 질문은 앞 질문과 합쳐서 찾는다
    if (list.length < 3 && prevQ) list = inRegion(rank([...new Set([...toks, ...tokenize(prevQ)])]));
    if (!list.length && region && !toks.length) list = inRegion(cases);
    return list;
  }

  function startAsk(q, guide) {
    conv.turns = []; conv.lastQ = "";
    $("#avThread").innerHTML = "";
    $("#askView").hidden = false;
    document.body.classList.add("asking");
    $("#q").value = guide ? "" : q;
    setPane("chat");
    goTo(0);
    ask(q, guide);
  }

  async function ask(q, guide) {
    const prevQ = conv.lastQ; conv.lastQ = q;
    addMsg("user", esc(q));
    let list = retrieve(q, prevQ);
    const g = guide || (!prevQ && guideFor(tokenize(q)));
    if (guide) {
      const picks = picksFor(guide);
      list = [...picks, ...list.filter(it => !picks.some(p => p.id === it.id))];
    }
    const ids = list.slice(0, 8).map(it => it.id);
    renderResults(list, guide ? guide.q : q);
    $("#askView").style.setProperty("--accent", (g && CAT[g.filter.cat]) ? CAT[g.filter.cat].c[0] : "#5b7cff");
    renderSuggest(g);

    // 제시어를 고른 경우: 큐레이션된 안내를 바로 보여 준다 (AI 호출 없음)
    if (guide) {
      const n = picksFor(guide).length;
      const refs = Array.from({ length: n }, (_, i) => `[${i + 1}]`).join("");
      return addBot(`${guide.intro}\n\n먼저 볼 사례 ${refs}`, ids, "RAX 안내");
    }
    const wait = addMsg("bot", '<span class="typing"><i></i><i></i><i></i></span>');
    const out = await callChat(q, list.slice(0, 8));
    wait.remove();
    if (out.ok) return addBot(out.answer, ids, "AI 답변", true);
    // AI를 쓸 수 없으면: 가까운 안내 또는 관련 사례 요약으로 답한다
    const why = { daily_limit: "오늘 AI 답변 한도를 다 썼어요", not_configured: "" }[out.error] ?? `AI 답변 오류: ${out.error}`;
    if (why) $("#avNote").textContent = `${why} — 검색 결과로 안내해요.`;
    if (g && !prevQ) return addBot(`${g.intro}`, ids, "가까운 안내");
    if (!list.length) return addBot("RAX에 실린 사례 중에서는 딱 맞는 것을 찾지 못했어요. 아래 질문으로 시작해 보거나, 다른 표현으로 물어보세요.", [], "", false, true);
    const top = list.slice(0, 3).map((it, i) => `${titleOf(it)} [${i + 1}]`).join(", ");
    addBot(`관련 사례 ${list.length}건을 찾았어요. 가장 가까운 사례는 ${top}예요. 오른쪽 목록에서 자세히 볼 수 있어요.`, ids, "검색 요약");

  }

  async function callChat(question, list) {
    if (!SUBMIT_ENDPOINT) return { ok: false, error: "not_configured" };
    const history = conv.turns.slice(0, -1).slice(-6);
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const res = await fetch(SUBMIT_ENDPOINT, {
        method: "POST", signal: ctl.signal,
        body: JSON.stringify({ action: "chat", question, history,
          cases: list.map(it => ({ title: titleOf(it), org: it.org, year: it.year, summary: it.summary })) }),
      });
      return await res.json();
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally { clearTimeout(timer); }
  }

  function addMsg(role, html) {
    const el = document.createElement("div");
    el.className = `msg ${role}`; el.innerHTML = html;
    $("#avThread").appendChild(el);
    el.scrollIntoView({ block: "nearest" });
    if (role === "user") conv.turns.push({ role: "user", content: el.textContent });
    return el;
  }

  // 답변 글은 이스케이프한 뒤 **굵게**, 줄바꿈, [n] 출처 번호만 살린다
  function addBot(text, ids, label, isAI, isErr) {
    conv.turns.push({ role: "assistant", content: text });
    conv.ids = ids;
    const html = esc(text).replace(/^#+\s*/gm, "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")
      .replace(/\[(\d{1,2})\]/g, (m, n) => ids[n - 1] ? `<button class="src" type="button" data-src="${esc(ids[n - 1])}" title="${esc(titleOf(cases.find(c => c.id === ids[n - 1])))}">${n}</button>` : "");
    const el = addMsg("bot", `${label ? `<span class="label">${esc(label)}</span>` : ""}${html}`);
    if (isErr) el.classList.add("err");
    return el;
  }

  function renderResults(list, q) {
    conv.listQ = q;
    $("#avCount").textContent = $("#avCount2").textContent = list.length;
    $("#avResults").innerHTML = list.slice(0, 30).map((it, i) => `
      <li><button type="button" data-src="${esc(it.id)}">
        <span class="mini">${mini(it)}${i < 8 ? `<span class="num">${i + 1}</span>` : ""}</span>
        <span><b>${esc(titleOf(it))}</b><small>${esc(it.region === "국내" ? "국내" : it.country)} · ${esc(shortOrg(it.org))}${it.year ? ` · ${it.year}` : ""} · ${esc(it.category)}</small></span>
      </button></li>`).join("") || `<li class="muted" style="padding:12px;font-family:var(--ko)">관련 사례가 없어요.</li>`;
  }

  function renderSuggest(g) {
    const others = guides.filter(x => !g || x.id !== g.id).sort((a, b) => hash(a.id + conv.lastQ) - hash(b.id + conv.lastQ)).slice(0, 3);
    $("#avSuggest").innerHTML = others.map(o => `<button class="prompt" type="button" data-guide="${esc(o.id)}">${esc(o.q)}</button>`).join("");
  }

  function setPane(name) {
    for (const el of document.querySelectorAll(".av-grid > [data-pane]")) el.classList.toggle("on", el.dataset.pane === name);
    for (const b of document.querySelectorAll(".av-tabs [data-pane]")) b.setAttribute("aria-pressed", b.dataset.pane === name);
  }

  function bindAsk() {
    $("#avForm").addEventListener("submit", e => {
      e.preventDefault(); const q = $("#avInput").value.trim(); if (!q) return;
      $("#avInput").value = ""; ask(q);
    });
    $("#avClose").addEventListener("click", () => {
      $("#askView").hidden = true; document.body.classList.remove("asking"); $("#q").value = "";
      goTo(0);
    });
    $("#avAll").addEventListener("click", () => {
      leaveGuide(); state.q = conv.lastQ; update();
      goTo("#archive");
    });
    document.querySelector(".av-tabs").addEventListener("click", e => { const b = e.target.closest("[data-pane]"); if (b) setPane(b.dataset.pane); });
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
    $("#askForm").addEventListener("submit", e => {
      e.preventDefault(); const q = $("#q").value.trim(); if (q) startAsk(q);
    });
    document.addEventListener("click", e => {
      const g = e.target.closest("[data-guide]");
      if (g) { e.preventDefault(); const gd = guides.find(x => x.id === g.dataset.guide); if (gd) startAsk(gd.q, gd); return; }
      const src = e.target.closest("[data-src]"); if (src) { openDetail(src.dataset.src); return; }
      const op = e.target.closest("[data-open]"); if (op) { openDetail(op.dataset.open); return; }
      if (e.target.closest("#headAsk")) { e.preventDefault(); goTo(0); setTimeout(() => $("#q").focus(), 300); return; }
      const pk = e.target.closest(".pick"); if (pk) { openDetail(pk.dataset.id); return; }
      if (e.target.closest("#answer [data-close]")) {
        state.guide = null; state.cat = null; state.q = ""; $("#q").value = "";
        for (const f of FACETS) state[f.field] = null;
        update();
      }
    });
    $("#sort").addEventListener("change", e => { state.sort = e.target.value; renderGrid(); });
    $("#catChips").addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b) return;
      state.cat = b.dataset.cat || null; state.guide = null; update();
    });
    $("#facetChips").addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b) return;
      const f = b.dataset.field; state[f] = state[f] === b.dataset.val ? null : b.dataset.val; state.guide = null; update();
    });
    $("#grid").addEventListener("click", e => { const c = e.target.closest(".card"); if (c) openDetail(c.dataset.id); });
    $("#grid").addEventListener("keydown", e => { if (e.key === "Enter") { const c = e.target.closest(".card"); if (c) openDetail(c.dataset.id); } });
    $("#closeDetail").addEventListener("click", () => $("#detail").close());
    $("#detail").addEventListener("click", e => { if (e.target === $("#detail")) $("#detail").close(); });
    document.addEventListener("keydown", e => {
      // 입력 칸에서 타이핑할 때는 '/'를 그대로 두고, 그 밖에서만 검색창으로 이동한다
      const typing = e.target.closest("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); $("#q").focus(); }
    });
    bindSubmit(); bindAsk();
    // 의견 보내기: 제보와 같은 구글 시트로, 제목 앞에 [의견]을 붙여 구분한다
    const openFb = e => { e?.preventDefault(); $("#feedbackForm").hidden = false; $("#fbDone").hidden = true; $("#fbMsg").textContent = ""; $("#feedbackDialog").showModal(); $("#feedbackForm [name=message]").focus(); };
    $("#feedbackOpen").addEventListener("click", openFb);
    $("#footerFeedback").addEventListener("click", openFb);
    if (location.hash === "#feedback") setTimeout(openFb, 300);
    $("#fbClose").addEventListener("click", () => $("#feedbackDialog").close());
    $("#fbAgain").addEventListener("click", () => $("#feedbackDialog").close());
    $("#feedbackDialog").addEventListener("click", e => { if (e.target === $("#feedbackDialog")) $("#feedbackDialog").close(); });
    $("#feedbackForm").addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.target, msg = $("#fbMsg"), btn = $("#fbBtn"), d = Object.fromEntries(new FormData(f));
      if (!d.message.trim()) { msg.textContent = "내용을 적어 주세요."; f.message.focus(); return; }
      if (!SUBMIT_ENDPOINT) { msg.textContent = "지금은 의견을 받을 수 없어요. GitHub 이슈로 알려주세요."; return; }
      btn.disabled = true; btn.textContent = "보내는 중…"; msg.textContent = "";
      const body = JSON.stringify({ title: `[의견] ${d.kind}`, url: location.href.split("#")[0], category: "의견", region: "",
        org: navigator.userAgent.includes("Mobile") ? "모바일" : "데스크톱", summary: d.message, contact: d.contact, website: d.website });
      try { await fetch(SUBMIT_ENDPOINT, { method: "POST", mode: "no-cors", body }); f.reset(); f.hidden = true; $("#fbDone").hidden = false; }
      catch { msg.textContent = "보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."; }
      finally { btn.disabled = false; btn.textContent = "보내기"; }
    });

    // 개발자 정보
    $("#devOpen").addEventListener("click", () => $("#devDialog").showModal());
    $("#devClose").addEventListener("click", () => $("#devDialog").close());
    $("#devDialog").addEventListener("click", e => { if (e.target === $("#devDialog")) $("#devDialog").close(); });
    $("#coffeeBtn").addEventListener("click", () => {
      const qr = $("#coffeeQr"); qr.hidden = !qr.hidden; $("#coffeeBtn").setAttribute("aria-expanded", String(!qr.hidden));
    });
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
      const [res, gres] = await Promise.all([
        fetch("data/cases.json", { cache: "no-cache" }),
        fetch("data/guides.json", { cache: "no-cache" }).catch(() => null),
        fetch("data/thumbs.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).then(t => { thumbs = Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "string")); }).catch(() => {}),
      ]);
      cases = (await res.json()).map(c => ({
        ...c,
        _title: [c.title, c.titleKo].join(" ").toLowerCase(),
        _tags: (c.tags || []).join(" ").toLowerCase(),
        _hay: [c.title, c.titleKo, c.org, c.country, c.category, c.format, c.orgType, c.apiType, c.summary, ...(c.tags || [])].join(" ").toLowerCase(),
      }));
      guides = gres && gres.ok ? await gres.json() : [];
    } catch (err) {
      $("#resultInfo").textContent = "사례 데이터를 불러오지 못했습니다.";
      return;
    }
    renderStats(); renderCategories(); renderPrompts(); renderFeature();
    const gp = new URLSearchParams(location.search).get("guide");
    update();
    const g0 = guides.find(x => x.id === gp);
    if (g0) startAsk(g0.q, g0);
  }
  init();
})();
