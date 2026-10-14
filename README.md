# RAX — 기록관리 AX 사례 아카이브

국내외 공공기관·기업·연구자·개인이 **기록관리와 아카이브에 AI를 적용한 사례(AX, AI Transformation)** 를 모아
카테고리별로 보여주는 정적 웹사이트입니다. 서비스, GitHub 저장소, MCP 서버·API, 논문, 보고서, 기사까지 함께 담습니다.

- 사이트: **https://hyeji-simulacre.github.io/rax/**

영감: [PAX — 모두의 공공AX 사례 아카이브](https://hollobit.github.io/PAX/)

## 카테고리

| 카테고리 | 다루는 내용 |
|---|---|
| 분류·평가 | 자동 분류, 보존기간 부여, 평가·선별, 폐기 심사 |
| 공개·비식별 | 비공개 재분류, 비밀해제 심사, 개인정보 탐지·가림 |
| OCR·고문서 | 타자·필기체·한문 고문서 인식, 손글씨 인식(HTR), 기계번역 |
| 메타데이터·기술 | 메타데이터 자동 생성, 개체명 인식, 전거 연계 |
| 검색·챗봇 | 의미 검색, RAG, 기록정보서비스 챗봇, AI 에이전트 |
| 음성·영상 | 구술·회의 음성 전사, 시청각 기록 메타데이터 |
| 보존·관리 자동화 | 디지털 보존, 이관·관리 업무 자동화, 웹 아카이빙 |
| 정책·가이드 | 정책, 지침, 연구 동향, 윤리 |

형식은 `사이트·서비스`, `GitHub·오픈소스`, `MCP·API`, `논문`, `보고서`, `기사·발표` 여섯 가지입니다.

## 사례 추가하기

- **제보:** 사이트의 '사례 제보' 버튼으로 보내면 구글 시트 'RAX 사례 제보'에 쌓입니다. GitHub 이슈의 [사례 제보 양식](../../issues/new?template=case.yml)도 쓸 수 있습니다.
- **주간 업데이트:** 매주 Claude 예약 작업이 [절차서](docs/update-procedure.md)에 따라 제보와 새 사례를 정리해 PR로 올립니다. PR을 검토하고 병합하면 사이트에 반영됩니다.
- **직접 추가:** `data/cases.json`에 항목을 넣으면 됩니다.

```json
{
  "id": "고유한 짧은 문자열",
  "title": "원제목",
  "titleKo": "한국어 제목 (원제가 외국어일 때)",
  "org": "기관·기업·개인",
  "orgType": "공공기관 | 기업 | 학계·연구 | 개인·커뮤니티",
  "region": "국내 | 해외",
  "country": "대한민국",
  "year": 2026,
  "format": "사이트·서비스 | GitHub·오픈소스 | MCP·API | 논문 | 보고서 | 기사·발표",
  "apiType": "MCP | REST API | SPARQL | IIIF (MCP·API일 때만)",
  "category": "위 여덟 카테고리 중 하나",
  "summary": "2~3문장 요약 (원문을 옮기지 말고 새로 쓰기)",
  "tags": ["태그"],
  "url": "https://…",
  "image": "선택: 대표 이미지 URL"
}
```

`image`가 없으면 카테고리 색으로 표지가 자동으로 만들어집니다. GitHub 저장소는 GitHub 미리보기 이미지를 씁니다.
형식 점검은 `python3 scripts/validate.py`로 할 수 있습니다.

## 배포

`main` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 데이터를 점검한 뒤 GitHub Pages로 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔야 합니다.

로컬에서 보려면:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## 주의

각 사례의 요약은 공개된 원문을 바탕으로 새로 쓴 글입니다. 연도나 수치는 원문 보도 기준이므로, 인용할 때는 원문을 확인해 주세요.
