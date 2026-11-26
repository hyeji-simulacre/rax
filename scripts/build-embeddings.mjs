// 의미 검색용 사례 벡터를 만든다 (배포 때 GitHub Actions가 실행).
// - 사례마다 제목·기관·분야·요약·태그를 한 글로 묶어, Apps Script의 embed 기능(NVIDIA 임베딩 API)으로 숫자 벡터로 바꾼다.
// - API 키는 Apps Script의 스크립트 속성에만 있다. 이 스크립트와 저장소에는 키가 없다.
// - 글이 바뀐 사례만 다시 계산하고, 지워진 사례는 뺀다.
// - 결과: data/embeddings.json  { model, dims, items: { 사례id: { h: 글 해시, v: int8 벡터(base64) } } }
// 실패해도 사이트 배포는 계속된다(브라우저는 키워드 검색으로 돌아간다).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

// 앞 모델이 없어졌으면(404·410) 다음 모델을 쓴다. 쓸 수 있는 모델을 찾으면 그 모델로 전부 계산한다.
const MODELS = (process.env.EMBED_MODEL || "nvidia/llama-nemotron-embed-1b-v2,baai/bge-m3,nvidia/nv-embedqa-e5-v5")
  .split(",").map(m => m.trim()).filter(Boolean);
let MODEL = MODELS[0];
const DIMS = Number(process.env.EMBED_DIMS || 1024);
const OUT = "data/embeddings.json";
const BATCH = 16;

const endpoint = process.env.RAX_ENDPOINT
  || (readFileSync("assets/app.js", "utf8").match(/SUBMIT_ENDPOINT\s*=\s*"([^"]+)"/) || [])[1];
if (!endpoint) { console.log("Apps Script 주소가 없어 건너뜁니다."); process.exit(0); }

export const textOf = c => [c.title, c.titleKo, c.org, c.category, c.format, c.country, c.summary, (c.tags || []).join(", ")]
  .filter(Boolean).join("\n");

const cases = JSON.parse(readFileSync("data/cases.json", "utf8"));
let prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
if (prev && MODELS.includes(prev.model)) MODEL = prev.model; // 지난번에 쓴 모델을 먼저 쓴다
if (prev && (prev.model !== MODEL || prev.req !== DIMS)) prev = null; // 모델이 바뀌면 전부 다시 만든다
const items = {};
const todo = [];
for (const c of cases) {
  const text = textOf(c);
  const h = createHash("sha1").update(text).digest("hex").slice(0, 12);
  if (prev && prev.items[c.id] && prev.items[c.id].h === h) items[c.id] = prev.items[c.id];
  else todo.push({ id: c.id, h, text });
}
console.log(`사례 ${cases.length}건 중 새로 계산할 것 ${todo.length}건`);

async function embed(input) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "embed", type: "passage", model: MODEL, dims: DIMS, input }),
      });
      const out = await res.json();
      if (out.ok && Array.isArray(out.vectors) && out.vectors.length === input.length) return out;
      throw new Error(out.error || `HTTP ${res.status}`);
    } catch (err) {
      if (/embed_(404|410)/.test(String(err))) throw err; // 모델이 없으면 다시 시도해도 소용없다
      console.log(`  시도 ${attempt} 실패: ${String(err).slice(0, 200)}`);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
}

// 벡터를 길이 1로 맞춘 뒤 -127~127 정수로 줄여 파일을 작게 한다
function pack(vec) {
  const n = Math.hypot(...vec) || 1;
  const q = Int8Array.from(vec, x => Math.max(-127, Math.min(127, Math.round((x / n) * 127))));
  return Buffer.from(q.buffer).toString("base64");
}

let dims = DIMS, failed = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const part = todo.slice(i, i + BATCH);
  try {
    let out;
    for (;;) {
      try { out = await embed(part.map(p => p.text)); break; } catch (err) {
        const gone = /embed_(404|410)/.test(String(err)) && Object.keys(items).length === 0;
        const next = MODELS[MODELS.indexOf(MODEL) + 1];
        if (!gone || !next) throw err;
        console.log(`  모델 ${MODEL}을 쓸 수 없어 ${next}로 바꿉니다`); MODEL = next;
      }
    }
    out.vectors.forEach((v, k) => { items[part[k].id] = { h: part[k].h, v: pack(v) }; dims = v.length; });
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  } catch { failed += part.length; }
}
if (failed) console.log(`벡터를 만들지 못한 사례 ${failed}건 (다음 배포 때 다시 시도)`);
if (!Object.keys(items).length) { console.log("만든 벡터가 없어 파일을 쓰지 않습니다."); process.exit(0); }
writeFileSync(OUT, JSON.stringify({ model: MODEL, req: DIMS, dims, items }));
console.log(`저장: ${OUT} (${Object.keys(items).length}건, ${dims}차원)`);
