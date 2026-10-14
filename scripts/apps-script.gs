/**
 * RAX 사례 제보 수신용 Google Apps Script
 *
 * 설치: 'RAX 사례 제보' 시트 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *       → 배포 → 새 배포 → 유형: 웹 앱 → 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포
 *       → 나온 웹 앱 URL을 assets/app.js의 SUBMIT_ENDPOINT에 넣는다.
 */
const FIELDS = ["title", "url", "org", "category", "region", "summary", "contact"];
const MAX_LEN = { title: 300, url: 1000, org: 200, category: 40, region: 10, summary: 2000, contact: 200 };

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    if (data.website) return json({ ok: true }); // 스팸 봇용 숨김 칸이 채워졌으면 조용히 버린다
    const row = {};
    for (const f of FIELDS) row[f] = clean(data[f], MAX_LEN[f]);
    if (!row.title || !/^https?:\/\//i.test(row.url)) return json({ ok: false, error: "제목과 링크(http로 시작)는 필수입니다." });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow([
        new Date(), row.title, row.url, row.org, row.category, row.region, row.summary, row.contact, "접수",
      ]);
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
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
