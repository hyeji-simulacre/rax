"""data/cases.json·orgs.json·guides.json의 형식을 점검한다. 문제가 있으면 종료 코드 1."""
import json
import re
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

ORG_TYPES = ENUMS["orgType"]
ORG_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

errors, warnings = [], []

# --- data/orgs.json (기관·개인 디렉터리) ---
org_ids = set()
try:
    orgs = json.loads(Path("data/orgs.json").read_text(encoding="utf-8"))
except (OSError, ValueError) as e:
    orgs = []
    errors.append(f"orgs.json 읽기 실패: {e}")
if not isinstance(orgs, list):
    errors.append("orgs.json은 배열이어야 함")
    orgs = []
for o in orgs:
    oid = o.get("id")
    where = f"org {oid or '?'}"
    if not isinstance(oid, str) or not ORG_ID_RE.match(oid):
        errors.append(f"{where}: id는 kebab-case(영소문자·숫자·-)여야 함")
    if oid in org_ids:
        errors.append(f"{where}: 중복 id")
    org_ids.add(oid)
    if not o.get("name"):
        errors.append(f"{where}: 'name' 누락")
    if o.get("type") not in ORG_TYPES:
        errors.append(f"{where}: type='{o.get('type')}' 허용되지 않은 값")
    if not o.get("country"):
        errors.append(f"{where}: 'country' 누락")
    links = o.get("links", [])
    if not isinstance(links, list):
        errors.append(f"{where}: links는 배열이어야 함")
        links = []
    for ln in links:
        if not isinstance(ln, dict) or not ln.get("label"):
            errors.append(f"{where}: 링크 label 누락")
        if not str((ln or {}).get("url", "")).startswith("https://"):
            errors.append(f"{where}: 링크 url은 https://로 시작해야 함 ({(ln or {}).get('url')})")

cases = json.loads(Path("data/cases.json").read_text(encoding="utf-8"))
ids, urls, used_orgs = set(), set(), set()
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
    oids = c.get("orgIds")
    if not isinstance(oids, list) or not oids:
        errors.append(f"{where}: 'orgIds' 누락(1개 이상 필요)")
    else:
        if len(set(oids)) != len(oids):
            errors.append(f"{where}: orgIds 중복")
        for oid in oids:
            if oid not in org_ids:
                errors.append(f"{where}: orgs.json에 없는 orgId '{oid}'")
            used_orgs.add(oid)

guides_path = Path("data/guides.json")
if guides_path.exists():
    for g in json.loads(guides_path.read_text(encoding="utf-8")):
        for k in ["id", "q", "intro", "filter", "picks", "keywords"]:
            if k not in g:
                errors.append(f"guide {g.get('id', '?')}: '{k}' 누락")
        for pk in g.get("picks", []):
            pid = pk.get("id") if isinstance(pk, dict) else pk
            if pid not in ids:
                errors.append(f"guide {g.get('id')}: 없는 사례 id {pid}")

for oid in sorted(org_ids - used_orgs):
    warnings.append(f"경고: org {oid}를 쓰는 사례가 없음")

if warnings:
    print("\n".join(warnings))
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"OK: {len(cases)}건, 기관·개인 {len(org_ids)}곳")
