// 사례 링크의 첫 화면을 찍어 thumbs/<id>.jpg 로 저장하고, 결과를 data/thumbs.json 에 기록한다.
// GitHub Actions(인터넷이 되는 환경)에서 배포 전에 실행된다. 이미 찍은 사례는 건너뛴다.
// 실패한 사례는 "fail" 로 남겨 두고 30일 뒤에 다시 시도한다. 사이트는 썸네일이 없으면 흰 카탈로그 카드를 보여 준다.
import { chromium } from "playwright";
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const cases = JSON.parse(await readFile("data/cases.json", "utf8"));
let thumbs = {};
try { thumbs = JSON.parse(await readFile("data/thumbs.json", "utf8")); } catch {}
await mkdir("thumbs", { recursive: true });

const RETRY_DAYS = 30;
const today = new Date().toISOString().slice(0, 10);
const daysSince = d => (Date.now() - new Date(d)) / 864e5;
const isFile = url => /\.(pdf|docx?|hwp|zip)(\?|#|$)/i.test(url);
const todo = cases.filter(c => {
  const t = thumbs[c.id];
  if (typeof t === "string" && t.startsWith("thumbs/")) return false;
  if (t && t.fail && daysSince(t.date) < RETRY_DAYS) return false;
  return !isFile(c.url);
});
console.log(`capture: ${todo.length} of ${cases.length}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "ko-KR",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 RAX-thumbnail",
});

async function shoot(c) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(c.url, { waitUntil: "domcontentloaded", timeout: 25000 });
    if (!res || res.status() >= 400) throw new Error(`status ${res && res.status()}`);
    const type = res.headers()["content-type"] || "";
    if (!type.includes("html")) throw new Error(`not html: ${type}`);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const png = await page.screenshot({ type: "png" });
    const out = `thumbs/${c.id}.jpg`;
    await sharp(png).resize(720, 450, { fit: "cover", position: "top" }).jpeg({ quality: 72, mozjpeg: true }).toFile(out);
    thumbs[c.id] = out;
    console.log("ok  ", c.id, c.url);
  } catch (err) {
    thumbs[c.id] = { fail: true, date: today, reason: String(err.message || err).slice(0, 120) };
    console.log("fail", c.id, c.url, String(err.message || err).slice(0, 80));
  } finally {
    await page.close();
  }
}

// 4개씩 나눠서 찍는다
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await shoot(queue.shift()); }));
await browser.close();

// 사이트가 읽기 쉽게: 성공한 것은 경로, 실패한 것은 객체 그대로
const sorted = Object.fromEntries(Object.entries(thumbs).sort(([a], [b]) => a.localeCompare(b)));
await writeFile("data/thumbs.json", JSON.stringify(sorted, null, 1) + "\n");
const ok = Object.values(sorted).filter(v => typeof v === "string").length;
console.log(`thumbs: ${ok} ok / ${Object.keys(sorted).length} recorded`);
