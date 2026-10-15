/**
 * RAX 사례 제보 수신 + 추가질문 채팅 중계용 Google Apps Script
 *
 * 설치: 'RAX 사례 제보' 시트 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *       → 배포 → 새 배포 → 유형: 웹 앱 → 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포
 *       → 나온 웹 앱 URL을 assets/app.js의 SUBMIT_ENDPOINT에 넣는다.
 * 코드를 고친 뒤에는: 배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포 (URL이 그대로 유지된다)
 *
 * 채팅을 켜려면: 프로젝트 설정(톱니바퀴) → 스크립트 속성에 아래를 추가한다.
 *   LLM_API_KEY   : NVIDIA(build.nvidia.com) 등에서 받은 API 키
 *   LLM_MODEL     : 모델 ID. 쉼표로 여러 개 적으면 앞 모델이 사라졌을 때 다음 모델을 쓴다. 맞는 ID는 아래 findModels()로 찾는다
 *   LLM_BASE_URL  : (선택) 기본값 https://integrate.api.nvidia.com/v1  — OpenAI 호환 주소면 무엇이든 된다
 *   CHAT_DAILY_MAX: (선택) 하루 최대 채팅 호출 수, 기본 300
 */
const FIELDS = ["title", "url", "org", "category", "region", "summary", "contact"];
const MAX_LEN = { title: 300, url: 1000, org: 200, category: 40, region: 40, summary: 2000, contact: 200 };

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    if (data.action === "chat") return json(chat(data));
    return json(submit(data));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- 사례 제보 ----------
function submit(data) {
  if (data.website) return { ok: true }; // 스팸 봇용 숨김 칸이 채워졌으면 조용히 버린다
  const row = {};
  for (const f of FIELDS) row[f] = clean(data[f], MAX_LEN[f]);
  if (!row.title || !/^https?:\/\//i.test(row.url)) return { ok: false, error: "제목과 링크(http로 시작)는 필수입니다." };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow([
      new Date(), row.title, row.url, row.org, row.category, row.region, row.summary, row.contact, "접수",
    ]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ---------- 추가질문 채팅 ----------
const SYSTEM_PROMPT = [
  "너는 기록관리·아카이브 분야의 AI 전환(AX) 사례 아카이브 'RAX'의 안내자다.",
  "아래 [사례] 목록에 있는 내용만 근거로 한국어로 답한다. 목록에 없는 사실, 수치, 기관명은 지어내지 않는다.",
  "근거로 쓴 사례는 문장 끝에 [1], [2]처럼 번호로 표시한다.",
  "답은 3~6문장으로 짧게 쓰고, 기록관리 실무자가 바로 이해할 수 있게 쉬운 말로 쓴다. 말투는 '~예요/~어요'를 쓴다.",
  "사례 목록으로 답할 수 없는 질문이면 그렇다고 솔직히 말하고, 목록에서 가장 가까운 사례를 안내한다.",
  "기록관리·아카이브·AI와 관계없는 요청에는 답하지 말고 RAX에서 다루는 주제를 안내한다.",
].join("\n");

function chat(data) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty("LLM_API_KEY");
  // LLM_MODEL에 쉼표로 여러 개를 적으면, 앞 모델이 없어졌을 때(404·410) 다음 모델로 넘어간다
  const models = String(props.getProperty("LLM_MODEL") || "").split(",").map(m => m.trim()).filter(Boolean);
  if (!key || !models.length) return { ok: false, error: "not_configured" };
  const base = (props.getProperty("LLM_BASE_URL") || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");

  const question = clean(data.question, 500);
  if (!question) return { ok: false, error: "질문이 비어 있습니다." };
  if (!underDailyLimit(props)) return { ok: false, error: "daily_limit" };

  const cases = (Array.isArray(data.cases) ? data.cases : []).slice(0, 8).map((c, i) =>
    `[${i + 1}] ${clean(c.title, 200)} — ${clean(c.org, 120)}${c.year ? ` (${clean(c.year, 4)})` : ""}\n${clean(c.summary, 700)}`);
  const history = (Array.isArray(data.history) ? data.history : []).slice(-6)
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .map(m => ({ role: m.role, content: clean(m.content, 1200) }));

  const messages = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n[사례]\n${cases.join("\n\n") || "(관련 사례 없음)"}` },
    ...history,
    { role: "user", content: question },
  ];
  // DeepSeek·Qwen 같은 추론 모델은 '생각' 단계를 끄면 훨씬 빨리 답한다. 이 옵션을 모르는 모델이면 빼고 한 번 더 보낸다.
  const send = (model, extra) => UrlFetchApp.fetch(`${base}/chat/completions`, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${key}` },
    payload: JSON.stringify(Object.assign({ model, messages, temperature: 0.3, max_tokens: 700 }, extra)),
    muteHttpExceptions: true,
  });
  let res;
  for (const model of models) {
    res = send(model, { chat_template_kwargs: { thinking: false, enable_thinking: false } });
    if (res.getResponseCode() === 400) res = send(model, {});
    if (res.getResponseCode() !== 404 && res.getResponseCode() !== 410) break;
  }
  // 실패하면 응답 앞부분을 함께 돌려줘서 원인(모델 이름 오류 등)을 화면에서 바로 볼 수 있게 한다
  if (res.getResponseCode() !== 200) return { ok: false, error: `llm_${res.getResponseCode()} ${res.getContentText().slice(0, 160)}` };
  const out = JSON.parse(res.getContentText());
  const msg = (out.choices && out.choices[0] && out.choices[0].message) || {};
  let answer = msg.content || "";
  answer = answer.replace(/<think>[\s\S]*?<\/think>/g, "").trim(); // 추론 모델의 생각 과정은 버린다
  return { ok: true, answer };
}

// 하루 호출 수를 세어 무료 한도를 넘지 않게 한다
function underDailyLimit(props) {
  const max = Number(props.getProperty("CHAT_DAILY_MAX") || 300);
  const today = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const [day, n] = (props.getProperty("CHAT_COUNT") || "").split("|");
    const count = day === today ? Number(n) : 0;
    if (count >= max) return false;
    props.setProperty("CHAT_COUNT", `${today}|${count + 1}`);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// 길이를 자르고, 시트에서 수식으로 실행되지 않도록 = + - @ 로 시작하는 값 앞에 ' 를 붙인다
function clean(v, max) {
  let s = String(v == null ? "" : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 처음 한 번, 편집기에서 이 함수를 골라 ▶실행하면 바깥 인터넷 호출(UrlFetchApp) 권한 승인 창이 뜬다.
function authorize() {
  UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
  SpreadsheetApp.getActiveSpreadsheet();
  return "권한 승인 완료";
}

// 편집기에서 이 함수를 골라 ▶실행하면, 지금 NVIDIA에서 쓸 수 있는 대화 모델을 찾아 짧게 말을 걸고
// 응답 시간을 '실행 로그'에 빠른 순서로 보여 준다. 맨 위 모델 ID를 스크립트 속성 LLM_MODEL에 넣으면 된다.
function findModels() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty("LLM_API_KEY");
  const base = (props.getProperty("LLM_BASE_URL") || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const list = JSON.parse(UrlFetchApp.fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, muteHttpExceptions: true }).getContentText());
  const ids = (list.data || []).map(m => m.id)
    .filter(id => /instruct|chat|deepseek|qwen|gemma|kimi|glm|exaone|gpt-oss/i.test(id))
    .filter(id => !/embed|rerank|guard|safety|reward|vision|vl\b|coder|math|parse|ocr|nemoretriever|clip/i.test(id));
  Logger.log(`대화 모델 후보 ${ids.length}개를 시험합니다 (최대 25개)`);
  const results = [];
  for (const id of ids.slice(0, 25)) {
    const t = Date.now();
    const r = UrlFetchApp.fetch(`${base}/chat/completions`, {
      method: "post", contentType: "application/json", headers: { Authorization: `Bearer ${key}` }, muteHttpExceptions: true,
      payload: JSON.stringify({ model: id, messages: [{ role: "user", content: "기록관리를 한 문장으로 설명해 주세요." }], max_tokens: 60 }),
    });
    const sec = (Date.now() - t) / 1000;
    let reply = "";
    try { reply = (JSON.parse(r.getContentText()).choices[0].message.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim().slice(0, 50); } catch (e) {}
    results.push({ id, code: r.getResponseCode(), sec, reply });
  }
  results.filter(x => x.code === 200).sort((a, b) => a.sec - b.sec)
    .forEach(x => Logger.log(`${x.sec.toFixed(1)}초  ${x.id}  →  ${x.reply}`));
  Logger.log(`응답 없음: ${results.filter(x => x.code !== 200).map(x => `${x.id}(${x.code})`).join(", ") || "없음"}`);
}
