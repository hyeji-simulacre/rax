"""data/cases.json의 형식을 점검한다. 문제가 있으면 종료 코드 1."""
import json
import sys
from pathlib import Path

ENUMS = {
    "region": {"국내", "해외"},
    "orgType": {"공공기관", "기업", "학계·연구", "개인·커뮤니티"},
    "format": {"사이트·서비스", "GitHub·오픈소스", "MCP·API", "논문", "보고서", "기사·발표"},
    "apiType": {"MCP", "REST API", "GraphQL", "IIIF", "SPARQL", "SDK"},
    "category": {"분류·평가", "공개·비식별", "OCR·고문서", "메타데이터·기술",
                 "검색·챗봇", "음성·영상", "보존·관리 자동화", "정책·가이드"},
}
REQUIRED = ["id", "title", "org", "region", "country", "orgType", "format", "category", "summary", "url"]

cases = json.loads(Path("data/cases.json").read_text(encoding="utf-8"))
errors, ids, urls = [], set(), set()
for i, c in enumerate(cases):
    where = f"#{i} {c.get('id', '?')}"
    for k in REQUIRED:
        if not c.get(k):
            errors.append(f"{where}: '{k}' 누락")
    for k, allowed in ENUMS.items():
        if c.get(k) and c[k] not in allowed:
            errors.append(f"{where}: {k}='{c[k]}' 허용되지 않은 값")
    if not str(c.get("url", "")).startswith(("http://", "https://")):
        errors.append(f"{where}: url 형식 오류")
    if c.get("year") is not None and not isinstance(c["year"], int):
        errors.append(f"{where}: year는 정수여야 함")
    if c.get("id") in ids:
        errors.append(f"{where}: 중복 id")
    if c.get("url") in urls:
        errors.append(f"{where}: 중복 url")
    ids.add(c.get("id"))
    urls.add(c.get("url"))

if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"OK: {len(cases)}건")
