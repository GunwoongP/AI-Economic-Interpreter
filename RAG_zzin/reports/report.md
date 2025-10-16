# RAG 재구축 결과 리포트

## 1. 구조 개편 요약
- 기본 임베더를 TF-IDF로 정비하고 sentence-transformers는 선택형으로 문서화했습니다.
- FAISS 기본 스펙을 Flat로 완화하고, 데이터가 많아지면 자동으로 IVF4096으로 승격되도록 조정했습니다.
- 중복 컨텍스트 제거 및 키워드 패널티 완화 등 검색 품질을 개선했습니다.

## 2. 데이터 커버리지
| 파일 | 데이터셋 | 문서 수 |
| --- | --- | ---: |
| bok_terms_full.jsonl | bok_terms | 698 |
| chunks_flat.jsonl | document_chunks | 8,696 |
| hangkookeconterms_jung.json | econ_terms | 12,637 |
| maileconterms_jung.json | econ_terms | 11,420 |
| naver_terms_name_summary_profile.json | naver_terms | 3,030 |
| wisereport_all copy.json | wise_reports | 2,763 |
| 알기_쉬운_경제지표해설(2023)F.jsonl | document_chunks | 650 |
| 알기쉬운 경제이야기.jsonl | document_chunks | 484 |
| 초보투자자를위한 증권과 투자 따라잡기.jsonl | document_chunks | 129 |

| 데이터셋 | 총 문서 수 |
| --- | ---: |
| bok_terms | 698 |
| document_chunks | 9,959 |
| econ_terms | 24,057 |
| naver_terms | 3,030 |
| wise_reports | 2,763 |

## 3. RAG 질의 결과 (10건)
### 3.1 GDP의 정의는?

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: 알기_쉬운_경제지표해설(2023)F.pdf | score: 0.998]  \n45알기 쉬운 경제지표해설Ⅰ. 실물, 고용 및 기업경영 지표가 구입하는 최종적인 재화 및 서비스의 물가 수준만을 나타내는 반면 GDP디플레이터는 소비뿐만 아니라 GDP를 구성하는 투자, 수출입 등과 관련된 모든 물가지표가 활용된다는 점에서 차이가 있다. 또한 생산 측면에서 보면 GDP디플레이터는 부가가치(=총산출-중간투입)관점에서 측정되기 때문에 국내에서 생산되는 최종재 가격과 생산에 투입된 중간재 가격이반영되어 산출된다.1.5.9. 잠재GDP잠재GDP19)(potential GDP)란 한 나라가 단기적 호황 및 불황에 관계없이 완전고용 수준(자연실업률 상태)의 노동력과 정상 가동상태의 자본이 투입되어 생산되는 GDP를 말한다.즉, 잠재GDP는 실제GDP(actual GDP)와 달리 장기적 개념으로서 완전고용 산출량(full-employment output) 또는 자연산출량(natural level of output)에 해당하는 GDP이다.실제GDP와 잠재GDP의 차이를 GDP갭(gap)이라고 한다. 실제GDP가 잠재GDP에 미달하여 GDP갭이 마이너스(-)이면 노동, 자본 등 생산요소가 정상적으로 사용되지 못하고 있음을의미하므로 경기가 침체인 상태이다. 반대로 GDP갭이 플러스(+)이면…
- **Top Contexts:**
  - dataset=document_chunks, source=알기_쉬운_경제지표해설(2023)F.pdf (chunk=46), score=0.998, snippet="45알기 쉬운 경제지표해설Ⅰ. 실물, 고용 및 기업경영 지표가 구입하는 최종적인 재화 및 서비스의 물가 수준만을 나타내는 반면 GDP디플레이터는 소비뿐만 아니라 GDP를 구성하는 투자, 수출입 등과 관련된 모든 물가지표가 활용된다는 점에서 차이가 있다. 또한 생산 측면에서 보면 GDP디플레이터는 부가가치(=총산출-중간투입)관점에서 측정되기 때문에 국내에서…"

### 3.2 IS-LM 모형은 어떤 균형을 설명하나요?

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: maileconterms_jung.json | score: 0.870]  \n'균형가격'란 무엇인가요?  \n상품의 수요와 공급이 균형할 때에 성립하는 가격을 균형가격이라 한다. 그러나 전제하는 시간의 장단에 따라 균형가격의 내용은 달라진다. 그러므로 어떤 시간적 관점에서 보면 균형가격이지만 다른 시간적 관점에서 보면 불균형 가격이 되는 것이다. 일찍이 Marshall,A.은 시간적 시야의 장단에 따라 균형을 일시적 균형, 단기적 균형, 장기적 균형으로 구분하였다. 이에 대응하여 균형가격도 일시적 균형가격, 단기적 균형가격 및 장기적 균형으로 구분하였다.
- **Top Contexts:**
  - dataset=econ_terms, source=maileconterms_jung.json (chunk=26884-0), score=0.870, snippet="'균형가격'란 무엇인가요? 상품의 수요와 공급이 균형할 때에 성립하는 가격을 균형가격이라 한다. 그러나 전제하는 시간의 장단에 따라 균형가격의 내용은 달라진다. 그러므로 어떤 시간적 관점에서 보면 균형가격이지만 다른 시간적 관점에서 보면 불균형 가격이 되는 것이다. 일찍이 Marshall,A.은 시간적 시야의 장단에 따라 균형을 일시적 균형, 단기적 균형,…"

### 3.3 필립스 곡선은 무엇을 의미해?

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: maileconterms_jung.json | score: 0.062]  \n'선비'란 무엇인가요?  \n협의 의미로는 선박의 의장에 소요되는 비용 특히 항해중 소비되는 연료, 윤활유, 식료품 등의 비용을 말하나 광의 의미로는 선박화물 운임에 속하지 않는 피보험 이익을 의미한다.
- **Top Contexts:**
  - dataset=econ_terms, source=maileconterms_jung.json (chunk=31013-0), score=0.062, snippet="'선비'란 무엇인가요? 협의 의미로는 선박의 의장에 소요되는 비용 특히 항해중 소비되는 연료, 윤활유, 식료품 등의 비용을 말하나 광의 의미로는 선박화물 운임에 속하지 않는 피보험 이익을 의미한다."

### 3.4 GNI와 GDP의 차이를 알려줘.

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: 알기_쉬운_경제지표해설(2023)F.pdf | score: 1.062]  \n45알기 쉬운 경제지표해설Ⅰ. 실물, 고용 및 기업경영 지표가 구입하는 최종적인 재화 및 서비스의 물가 수준만을 나타내는 반면 GDP디플레이터는 소비뿐만 아니라 GDP를 구성하는 투자, 수출입 등과 관련된 모든 물가지표가 활용된다는 점에서 차이가 있다. 또한 생산 측면에서 보면 GDP디플레이터는 부가가치(=총산출-중간투입)관점에서 측정되기 때문에 국내에서 생산되는 최종재 가격과 생산에 투입된 중간재 가격이반영되어 산출된다.1.5.9. 잠재GDP잠재GDP19)(potential GDP)란 한 나라가 단기적 호황 및 불황에 관계없이 완전고용 수준(자연실업률 상태)의 노동력과 정상 가동상태의 자본이 투입되어 생산되는 GDP를 말한다.즉, 잠재GDP는 실제GDP(actual GDP)와 달리 장기적 개념으로서 완전고용 산출량(full-employment output) 또는 자연산출량(natural level of output)에 해당하는 GDP이다.실제GDP와 잠재GDP의 차이를 GDP갭(gap)이라고 한다. 실제GDP가 잠재GDP에 미달하여 GDP갭이 마이너스(-)이면 노동, 자본 등 생산요소가 정상적으로 사용되지 못하고 있음을의미하므로 경기가 침체인 상태이다. 반대로 GDP갭이 플러스(+)이면…
- **Top Contexts:**
  - dataset=document_chunks, source=알기_쉬운_경제지표해설(2023)F.pdf (chunk=46), score=1.062, snippet="45알기 쉬운 경제지표해설Ⅰ. 실물, 고용 및 기업경영 지표가 구입하는 최종적인 재화 및 서비스의 물가 수준만을 나타내는 반면 GDP디플레이터는 소비뿐만 아니라 GDP를 구성하는 투자, 수출입 등과 관련된 모든 물가지표가 활용된다는 점에서 차이가 있다. 또한 생산 측면에서 보면 GDP디플레이터는 부가가치(=총산출-중간투입)관점에서 측정되기 때문에 국내에서…"

### 3.5 005930 per

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: wisereport_all copy.json | score: 5.500]  \ncode: 005930  \nname: 삼성전자  \nmarket: KOSPI  \neps: 4,950 | bps: 57,981 | per: 19.07 | industry_per: 17.38 | pbr: 1.63 | dividend_yield: 1.53% | previous_close: 94,400
- **Top Contexts:**
  - dataset=wise_reports, source=wisereport_all copy.json (code=005930, name=삼성전자, chunk=27785-0), score=5.500, snippet="code: 005930 name: 삼성전자 market: KOSPI eps: 4,950 | bps: 57,981 | per: 19.07 | industry_per: 17.38 | pbr: 1.63 | dividend_yield: 1.53% | previous_close: 94,400"

### 3.6 000660 eps

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: wisereport_all copy.json | score: 5.500]  \ncode: 000660  \nname: SK하이닉스  \nmarket: KOSPI  \neps: 27,182 | bps: 107,256 | per: 15.75 | industry_per: 17.38 | pbr: 3.99 | dividend_yield: 0.51% | previous_close: 428,000
- **Top Contexts:**
  - dataset=wise_reports, source=wisereport_all copy.json (code=000660, name=SK하이닉스, chunk=27786-0), score=5.500, snippet="code: 000660 name: SK하이닉스 market: KOSPI eps: 27,182 | bps: 107,256 | per: 15.75 | industry_per: 17.38 | pbr: 3.99 | dividend_yield: 0.51% | previous_close: 428,000"

### 3.7 구글(Alphabet) 회사 개요 알려줘

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: naver_terms_name_summary_profile.json | score: 5.000]  \n구글  \n2015년 8월에 설립된 지주회사 알파벳(Alphabet Inc.)의 자회사로 편입됐다. 현재 전 세계에서 가장 큰 인터넷 기업 중 하나이자 인터넷 관련 서비스와 제품을 전문으로 하는 미국의 다국적 기술 기업이다. 세계에서 가장 많이 방문하는 웹사이트 '구글닷컴(Google.com)'을 운영한다.
- **Top Contexts:**
  - dataset=naver_terms, source=naver_terms_name_summary_profile.json (name=구글, chunk=24755-0), score=5.000, snippet="구글 2015년 8월에 설립된 지주회사 알파벳(Alphabet Inc.)의 자회사로 편입됐다. 현재 전 세계에서 가장 큰 인터넷 기업 중 하나이자 인터넷 관련 서비스와 제품을 전문으로 하는 미국의 다국적 기술 기업이다. 세계에서 가장 많이 방문하는 웹사이트 '구글닷컴(Google.com)'을 운영한다."

### 3.8 카카오 회사 요약

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: wisereport_all copy.json | score: 4.000]  \ncode: 035720  \nname: 카카오  \nmarket: KOSPI  \neps: 124 | bps: 23,100 | per: 498.84 | industry_per: 30.22 | pbr: 2.69 | dividend_yield: 0.11% | previous_close: 62,100
- **Top Contexts:**
  - dataset=wise_reports, source=wisereport_all copy.json (code=035720, name=카카오, chunk=27804-0), score=4.000, snippet="code: 035720 name: 카카오 market: KOSPI eps: 124 | bps: 23,100 | per: 498.84 | industry_per: 30.22 | pbr: 2.69 | dividend_yield: 0.11% | previous_close: 62,100"

### 3.9 통화정책이 경제에 미치는 영향은?

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: 알기쉬운 경제이야기.pdf | score: 0.932]  \n7부마무리하기14경제안정화정책열넷째 마당● 1. 왜 경제안정화정책이 필요한가?경제안정화정책의 의의경제안정화정책에 관한 논쟁● 2. 경제안정화정책은 어떻게 운영되는가?통화정책과 그 수단통화정책은 어떻게 수행되는가?통화정책은 어떻게 경제에 영향을 미치는가?재정정책과 그 수단재정적자를 메우는 방법● 3. 경제안정화정책이 성공하려면?경제안정화정책의 한계정책의 조화경제안정화정책 성공의 열쇠
- **Top Contexts:**
  - dataset=document_chunks, source=알기쉬운 경제이야기.pdf (chunk=398), score=0.932, snippet="7부마무리하기14경제안정화정책열넷째 마당● 1. 왜 경제안정화정책이 필요한가?경제안정화정책의 의의경제안정화정책에 관한 논쟁● 2. 경제안정화정책은 어떻게 운영되는가?통화정책과 그 수단통화정책은 어떻게 수행되는가?통화정책은 어떻게 경제에 영향을 미치는가?재정정책과 그 수단재정적자를 메우는 방법● 3. 경제안정화정책이 성공하려면?경제안정화정책의 한계정책의 조화…"

### 3.10 소비자물가지수(CPI)는 무엇을 나타내?

- **Answer:**  Summary based on top 1 contexts:  \n  \n[source: maileconterms_jung.json | score: 1.276]  \n'생활물가'란 무엇인가요?  \n소비자가 생활필수품을 구입할 때 피부로 느끼는 체감물가. 쌀, 배추, 라면, 두부, 쇠고기처럼 소비자들이 자주 구입하는 기본적인 생활필수품의 가격을 일컫는 말이다. 생활물가는 또는 체감물가는 소비자들이 일상생활에서 자주 구입하는 품목들의 가격변동을 통해 느끼는 것이므로 개인별 또는 가구별로 차이가 있을 수 있다. 소비자들이 느끼는 물가의 변화를 나타내는 지수에는 소비자물가지수, 근원물가지수, 생활물가지수, 신선식품지수 등 여러 가지가 있다. 소비자물가지수(CPI: consumer price index)는 도시가계가 일상생활을 영위하기 위해 구입하는 상품가격과 서비스 요금의 변동을 종합적으로 측정하기 위해 작성하는 지수이다. 2020년을 기준(100)으로 가계소비지출에서 차지하는 비중이 큰 품목 458개를 대상으로 산출한 종합소비자물가를 나타내는 지표이다. 그러나 통계청이 발표하는 소비자물가지수는 소비자들이 느끼는 물가를 제대로 반영하지 못하는 경우가 많다. 일반 소비자들이 체감하는 물가는 구입품목 및 구입 빈도에 따라 천차만별이기 때문이다. 이에 따라 통계청에서는 소비자들이 주로 소비하고, 지출하는 품목을 대상으로 1998년 4월부터 생활물가통계를 별도로 발표하…
- **Top Contexts:**
  - dataset=econ_terms, source=maileconterms_jung.json (chunk=25592-0), score=1.276, snippet="'생활물가'란 무엇인가요? 소비자가 생활필수품을 구입할 때 피부로 느끼는 체감물가. 쌀, 배추, 라면, 두부, 쇠고기처럼 소비자들이 자주 구입하는 기본적인 생활필수품의 가격을 일컫는 말이다. 생활물가는 또는 체감물가는 소비자들이 일상생활에서 자주 구입하는 품목들의 가격변동을 통해 느끼는 것이므로 개인별 또는 가구별로 차이가 있을 수 있다. 소비자들이 느끼는…"
