# RAG 테스트 결과

## 1. 데이터 커버리지
| 파일 | 데이터셋 | 문서 수 |
| --- | --- | ---: |

| 데이터셋 | 총 문서 수 |
| --- | ---: |

## 2. 질의 결과
### 2.1 GDP의 정의는?

- **Answer:**  Summary based on top 5 contexts:  
  
[source: bok_terms_full.jsonl | score: 5.000]  
국내총생산(GDP)  
국내총생산(GDP; Gross Domestic Product)은 한 나라의 영역 내에서 가계, 기업, 정부 등 모든 경제 주체가 일정 기간 동안 생산활동에 참여하여 창출한 부가가치 또는 최종 생산물을 시장가격으로 평가한 합계로서 여기에는 국내에 거주하는 비거주자(외국인)에게 지급되는 소득도 포함된다. 한편 가격의 적용방법에 따라 명목GDP(Nominal GDP)와 실질GDP(Real GDP)로 구분되며, 명목GDP는 국가경제의 규모나 구조 등을 파악하는 데 사용되며 실질GDP는 경제성장, 경기변동 등 전반적인 경제활동의 흐름을 분석하는 데 이용된다.  
  
[source: bok_terms_full.jsonl | score: 5.000]  
Beyond GDP  
인간의 복지(well-being)와 후생, 사회적 발전을 제대로 반영한 측정지표를 의미한다. 지금까지 널리 이용해 온 GDP(국내총생산)는 한 국가의 거시경제 성과를 파악하기 위해 고안된 경제지표이지 인간의 후생복지를 측정하기에는 여러 가지 한계가 있다는 지적을 받아 왔다. 사실 GDP는 인간의 복지나 행복에 중요한 여가, 건강, 직업의 안정성, 사회 안전과 자연환경 등의 요소를 감안할 수 없다.  
  
[source: 알기_쉬운_…
- **Top Contexts:**
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=75-0), score=5.000, snippet="국내총생산(GDP) 국내총생산(GDP; Gross Domestic Product)은 한 나라의 영역 내에서 가계, 기업, 정부 등 모든 경제 주체가 일정 기간 동안 생산활동에 참여하여 창출한 부가가치 또는 최종 생산물을 시장가격으로 평가한 합계로서 여기에는 국내에 거주하는 비거주자(외국인)에게 지급되는 소득도 포함된다. 한편 가격의 적용방법에 따라 명목GD…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=667-0), score=5.000, snippet="Beyond GDP 인간의 복지(well-being)와 후생, 사회적 발전을 제대로 반영한 측정지표를 의미한다. 지금까지 널리 이용해 온 GDP(국내총생산)는 한 국가의 거시경제 성과를 파악하기 위해 고안된 경제지표이지 인간의 후생복지를 측정하기에는 여러 가지 한계가 있다는 지적을 받아 왔다. 사실 GDP는 인간의 복지나 행복에 중요한 여가, 건강, 직업의…"
  - dataset=document_chunks, source=알기_쉬운_경제지표해설(2023)F.pdf (chunk_id=46), score=0.900, snippet="45알기 쉬운 경제지표해설Ⅰ. 실물, 고용 및 기업경영 지표가 구입하는 최종적인 재화 및 서비스의 물가 수준만을 나타내는 반면 GDP디플레이터는 소비뿐만 아니라 GDP를 구성하는 투자, 수출입 등과 관련된 모든 물가지표가 활용된다는 점에서 차이가 있다. 또한 생산 측면에서 보면 GDP디플레이터는 부가가치(=총산출-중간투입)관점에서 측정되기 때문에 국내에서…"
  - dataset=document_chunks, source=알기_쉬운_경제지표해설(2023)F.pdf (chunk_id=12), score=0.845, snippet="201.2. 명목GDP와 실질GDP어느 해의 GDP가 그 전년에 비해 증가했다면 ① 총 산출량이 증가했거나 ② 산출물의 가격이 상승했거나 아니면 ③ 둘 다였을 가능성이 있다. 국가경제에서 생산한 재화와 서비스의 총량이 시간의 흐름에 따라 어떻게 변화하는지(경제성장)를 정확하게 측정하기 위해서는물량과 가격 요인이 분리되어야 한다. 이에 따라 GDP는 명목GD…"
  - dataset=document_chunks, source=알기_쉬운_경제지표해설(2023)F.pdf (chunk_id=13), score=0.795, snippet="21알기 쉬운 경제지표해설Ⅰ. 실물, 고용 및 기업경영 지표우리나라의 2022년 중 명목GDP는 2,161.8조 원으로 전년보다 3.9% 늘어났으며 실질GDP는 1,968.8조 원으로 전년대비 2.6% 증가하였다. 2022년 중 명목GDP 성장률이 실질GDP 성장률보다 1.3%p 높은 것은 전반적인 물가가 1.3% 상승한 데 따른 것이다. 그리고 명목GDP…"

### 2.2 IS-LM 모형은 어떤 균형을 설명하나요?

- **Answer:**  Summary based on top 5 contexts:  
  
[source: bok_terms_full.jsonl | score: 5.000]  
산업연관표(I/O Tables)  
일정기간(보통1년) 동안 국민경제 내에서 발생하는 재화와 서비스의 생산 및 처분과 관련 된 모든 거래내역을 일정한 원칙과 형식에 따라 기록한 종합적인 통계표이다. 이 표의 세로 방향은 각 산업에서 생산활동을 위해 사용한 중간재, 노동, 자본 등 생산요소의 내역을 나타내는 투입 구조를, 가로방향은 각 산업에서 생산된 산출물의 처분내역을 나타내는 배분구조를 의미한다. 이 표를 통해 산업간에 그물같이 복잡하게 얽혀있는 상호연관관계를 파악할 수 있다.  
  
[source: events_catalog_v2.json | score: 4.500]  
미국 S&L(저축대부) 위기·RTC 설립  
FIRREA로 FSLIC 폐지·RTC 신설, 747개 S&L 정리 및 막대한 재정비용 발생.  
year: 1989  
region: US  
  
[source: maileconterms_jung.json | score: 0.684]  
'정태균형'란 무엇인가요?  
모든 여건이 일정할 때 여러 경제량이 상호의존 관계를 통해 도달할 것으로 생각되는 균형상태를 말한다. 정태균형에서는 일체의 시간적 요소는 무시된다. 좀 더 확대하면 여건불변이라는 것을 전제로 동일 규모의 생산, 교환, 소비가 순환적으로 반복되는 경우이…
- **Top Contexts:**
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=281-0), score=5.000, snippet="산업연관표(I/O Tables) 일정기간(보통1년) 동안 국민경제 내에서 발생하는 재화와 서비스의 생산 및 처분과 관련 된 모든 거래내역을 일정한 원칙과 형식에 따라 기록한 종합적인 통계표이다. 이 표의 세로 방향은 각 산업에서 생산활동을 위해 사용한 중간재, 노동, 자본 등 생산요소의 내역을 나타내는 투입 구조를, 가로방향은 각 산업에서 생산된 산출물의…"
  - dataset=events_catalog, source=events_catalog_v2.json (name=미국 S&L(저축대부) 위기·RTC 설립, chunk_id=9495-0), score=4.500, snippet="미국 S&L(저축대부) 위기·RTC 설립 FIRREA로 FSLIC 폐지·RTC 신설, 747개 S&L 정리 및 막대한 재정비용 발생. year: 1989 region: US"
  - dataset=econ_terms, source=maileconterms_jung.json (chunk_id=29057-0), score=0.684, snippet="'정태균형'란 무엇인가요? 모든 여건이 일정할 때 여러 경제량이 상호의존 관계를 통해 도달할 것으로 생각되는 균형상태를 말한다. 정태균형에서는 일체의 시간적 요소는 무시된다. 좀 더 확대하면 여건불변이라는 것을 전제로 동일 규모의 생산, 교환, 소비가 순환적으로 반복되는 경우이다. 이 상태를 정상상태(stationary state)라고 한다. 사회학적으로…"
  - dataset=document_chunks, source=chunks_flat.jsonl (chunk_id=5819-0), score=0.544, snippet="nVIDIA와 협력할 가능성이 높음. Q. 덱스트러스를 개발하는 과정에서 겪는 어려움이 어떤 것이며, 향후 지향하는 덱스트러스는 어떤 모습인지? 덱스트러스를 개발하는 과정은 분명 어렵고, 센서 구성 및 하드웨어 설계 등 여러 측면에서 난관이 있다. 또한 덱스트러스를 휴머노이드 플랫폼에 연결하는 것도 굉장히 까다로운 작업. 향후 지향하는 덱스트러스가 Tesl…"
  - dataset=econ_terms, source=maileconterms_jung.json (chunk_id=22264-0), score=0.543, snippet="'퀀텀점프'란 무엇인가요? 퀀텀점프는 물리학 용어로, 양자세계에서 양자가 어떤 단계에서 다음단계로 갈 때 계단의 차이만큼 뛰어오르는 현상을 뜻하는 말이다. 즉 어떤 일이 연속적으로 조금씩 발전하는 것이 아니라 계단을 뛰어오르듯이 다음단계로 올라가는 것을 말한다. 경제학에서는 이러한 개념을 차용하여 기업이 사업구조나 사업방식 등의 혁신을 통해 단기간에 비약적…"

### 2.3 필립스 곡선은 무엇을 의미해?

- **Answer:**  Summary based on top 5 contexts:  
  
[source: bok_terms_full.jsonl | score: 5.000]  
필립스곡선  
임금상승률과 실업률 사이의 반비례 관계를 나타내는 곡선을 필립스 곡선이라 한다. 뉴질랜드 출신의 영국인 경제학자 필립스(W. Phillips)는 1958년 명목 임금상승률과 실업률이 역의 상관관계를 나타낸다는 것을 처음으로 관찰하였다.  
  
[source: events_catalog_v2.json | score: 4.500]  
미·중 무역전쟁  
관세 인상으로 교역둔화·불확실성 확대, 제조업 위축.  
year: 2018  
region: US  
  
[source: events_catalog_v2.json | score: 4.500]  
미 연준 0.75%p 자이언트스텝  
40년 만의 고물가 억제를 위해 대규모 금리 인상 개시.  
year: 2022  
region: US  
  
[source: events_catalog_v2.json | score: 4.500]  
미·중 1단계 무역합의 서명  
IP·기술이전·구매 확대 등 구조 약속 포함, 일부 관세 인하.  
year: 2020  
region: US  
  
[source: maileconterms_jung.json | score: 0.044]  
'포크배럴'란 무엇인가요?  
포크배럴(Pork Barrel)은 본래 사전적 의미는 돼지여물통이란 의미다. 이 용어는 미국 의회에서 정부보조금…
- **Top Contexts:**
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=631-0), score=5.000, snippet="필립스곡선 임금상승률과 실업률 사이의 반비례 관계를 나타내는 곡선을 필립스 곡선이라 한다. 뉴질랜드 출신의 영국인 경제학자 필립스(W. Phillips)는 1958년 명목 임금상승률과 실업률이 역의 상관관계를 나타낸다는 것을 처음으로 관찰하였다."
  - dataset=events_catalog, source=events_catalog_v2.json (name=미·중 무역전쟁, chunk_id=9412-0), score=4.500, snippet="미·중 무역전쟁 관세 인상으로 교역둔화·불확실성 확대, 제조업 위축. year: 2018 region: US"
  - dataset=events_catalog, source=events_catalog_v2.json (name=미 연준 0.75%p 자이언트스텝, chunk_id=9416-0), score=4.500, snippet="미 연준 0.75%p 자이언트스텝 40년 만의 고물가 억제를 위해 대규모 금리 인상 개시. year: 2022 region: US"
  - dataset=events_catalog, source=events_catalog_v2.json (name=미·중 1단계 무역합의 서명, chunk_id=9456-0), score=4.500, snippet="미·중 1단계 무역합의 서명 IP·기술이전·구매 확대 등 구조 약속 포함, 일부 관세 인하. year: 2020 region: US"
  - dataset=econ_terms, source=maileconterms_jung.json (chunk_id=30660-0), score=0.044, snippet="'포크배럴'란 무엇인가요? 포크배럴(Pork Barrel)은 본래 사전적 의미는 돼지여물통이란 의미다. 이 용어는 미국 의회에서 정부보조금을 타내기 위해 경쟁하는 의원들의 행태를 비꼬기 위해 사용됐다. 여물통에 먹이를 던져주면 돼지들이 몰려드는 장면을 빗댄 것이다."

### 2.4 GNI와 GDP의 차이를 알려줘.

- **Answer:**  Summary based on top 5 contexts:  
  
[source: bok_terms_full.jsonl | score: 5.000]  
국내총생산(GDP)  
국내총생산(GDP; Gross Domestic Product)은 한 나라의 영역 내에서 가계, 기업, 정부 등 모든 경제 주체가 일정 기간 동안 생산활동에 참여하여 창출한 부가가치 또는 최종 생산물을 시장가격으로 평가한 합계로서 여기에는 국내에 거주하는 비거주자(외국인)에게 지급되는 소득도 포함된다. 한편 가격의 적용방법에 따라 명목GDP(Nominal GDP)와 실질GDP(Real GDP)로 구분되며, 명목GDP는 국가경제의 규모나 구조 등을 파악하는 데 사용되며 실질GDP는 경제성장, 경기변동 등 전반적인 경제활동의 흐름을 분석하는 데 이용된다.  
  
[source: bok_terms_full.jsonl | score: 5.000]  
Beyond GDP  
인간의 복지(well-being)와 후생, 사회적 발전을 제대로 반영한 측정지표를 의미한다. 지금까지 널리 이용해 온 GDP(국내총생산)는 한 국가의 거시경제 성과를 파악하기 위해 고안된 경제지표이지 인간의 후생복지를 측정하기에는 여러 가지 한계가 있다는 지적을 받아 왔다. 사실 GDP는 인간의 복지나 행복에 중요한 여가, 건강, 직업의 안정성, 사회 안전과 자연환경 등의 요소를 감안할 수 없다.  
  
[source: bok_te…
- **Top Contexts:**
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=75-0), score=5.000, snippet="국내총생산(GDP) 국내총생산(GDP; Gross Domestic Product)은 한 나라의 영역 내에서 가계, 기업, 정부 등 모든 경제 주체가 일정 기간 동안 생산활동에 참여하여 창출한 부가가치 또는 최종 생산물을 시장가격으로 평가한 합계로서 여기에는 국내에 거주하는 비거주자(외국인)에게 지급되는 소득도 포함된다. 한편 가격의 적용방법에 따라 명목GD…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=667-0), score=5.000, snippet="Beyond GDP 인간의 복지(well-being)와 후생, 사회적 발전을 제대로 반영한 측정지표를 의미한다. 지금까지 널리 이용해 온 GDP(국내총생산)는 한 국가의 거시경제 성과를 파악하기 위해 고안된 경제지표이지 인간의 후생복지를 측정하기에는 여러 가지 한계가 있다는 지적을 받아 왔다. 사실 GDP는 인간의 복지나 행복에 중요한 여가, 건강, 직업의…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=83-0), score=5.000, snippet="국민총소득(GNI) 국민총소득(GNI; Gross National Income)은 한 나라의 국민이 생산활동에 참여한 대가로 받은 소득의 합계로서 외국으로부터 국민(거주자)이 받은 소득(국외수취 요소소득)은 포함되고 국내총생산 중에서 외국인에게 지급한 소득(국외지급 요소소득)은 제외된다. 한편, 국내총생산은 국내에 거주하는 모든 생산자가 생산한 부가가치를…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=281-0), score=5.000, snippet="산업연관표(I/O Tables) 일정기간(보통1년) 동안 국민경제 내에서 발생하는 재화와 서비스의 생산 및 처분과 관련 된 모든 거래내역을 일정한 원칙과 형식에 따라 기록한 종합적인 통계표이다. 이 표의 세로 방향은 각 산업에서 생산활동을 위해 사용한 중간재, 노동, 자본 등 생산요소의 내역을 나타내는 투입 구조를, 가로방향은 각 산업에서 생산된 산출물의…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=689-0), score=5.000, snippet="N-B SRS N-B SRS(Network-Based Systemic Risk Scoring)은 특정은행의 도산확률이 여타 은행과의 상호거래 익스포저를 통해 확대되어 나타나는 리스크 총량으로, 개별은행의 도산확률과 거래상대방과의 상호거래 규모를 곱한 값의 제곱근으로 정의한다(Das, 2015)."

### 2.5 005930 per

- **Answer:**  Summary based on top 5 contexts:  
  
[source: wisereport_all copy.json | score: 5.500]  
code: 005930  
name: 삼성전자  
market: KOSPI  
eps: 4,950 | bps: 57,981 | per: 19.07 | industry_per: 17.38 | pbr: 1.63 | dividend_yield: 1.53% | previous_close: 94,400  
  
[source: bok_terms_full.jsonl | score: 5.000]  
주가수익비율(PER)  
주가가 실제 기업의 가치에 비해 고평가되어 있는지, 아니면 저평가되어 있는지 여부를 판단할 때 활용하는 대표적인 지표로 주가수익비율(PER; Price Earning Ratio)이 있다. PER는 기업의 주가를 주당순이익(EPS; Earning Per Share)으로 나눈 값으로, 해당기업의 주가가 그 기업 1주당 수익의 몇 배 수준으로 거래되는지를 나타낸다. 이에 따라 특정 기업의 현재 PER가 과거 추이 또는 수익구조가 유사한 타기업 등과 비교해 높을 경우 주가가 기업가치에 비해 고평가되었다고 판단할 수 있다.  
  
[source: events_catalog_v2.json | score: 4.500]  
9·11 테러  
항공·관광산업 급격히 침체, 연준은 즉각 금리인하로 경기부양 시도.  
year: 2001  
r…
- **Top Contexts:**
  - dataset=wise_reports, source=wisereport_all copy.json (code=005930, name=삼성전자, chunk_id=36668-0), score=5.500, snippet="code: 005930 name: 삼성전자 market: KOSPI eps: 4,950 | bps: 57,981 | per: 19.07 | industry_per: 17.38 | pbr: 1.63 | dividend_yield: 1.53% | previous_close: 94,400"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=516-0), score=5.000, snippet="주가수익비율(PER) 주가가 실제 기업의 가치에 비해 고평가되어 있는지, 아니면 저평가되어 있는지 여부를 판단할 때 활용하는 대표적인 지표로 주가수익비율(PER; Price Earning Ratio)이 있다. PER는 기업의 주가를 주당순이익(EPS; Earning Per Share)으로 나눈 값으로, 해당기업의 주가가 그 기업 1주당 수익의 몇 배 수준으…"
  - dataset=events_catalog, source=events_catalog_v2.json (name=9·11 테러, chunk_id=9403-0), score=4.500, snippet="9·11 테러 항공·관광산업 급격히 침체, 연준은 즉각 금리인하로 경기부양 시도. year: 2001 region: US"
  - dataset=document_chunks, source=chunks_flat.jsonl (chunk_id=8816-0), score=0.134, snippet="하나증권•10 Coverage/Global Peer Performance & Valuation Global Steel Producer / Non-ferrous Metal PEER Performance 분야 국가 기업명 통화 종가 1D% 1W% 3M% 6M% 1Y% YTD% 52HIGH 52LOW"
  - dataset=document_chunks, source=chunks_flat.jsonl (chunk_id=7734-0), score=0.122, snippet="하나증권•11 Coverage/Global Peer Performance & Valuation Global Steel Producer / Non-ferrous Metal PEER Performance 분야 국가 기업명 통화 종가 1D% 1W% 3M% 6M% 1Y% YTD% 52HIGH 52LOW"

### 2.6 000660 eps

- **Answer:**  Summary based on top 5 contexts:  
  
[source: wisereport_all copy.json | score: 5.500]  
code: 000660  
name: SK하이닉스  
market: KOSPI  
eps: 27,182 | bps: 107,256 | per: 15.75 | industry_per: 17.38 | pbr: 3.99 | dividend_yield: 0.51% | previous_close: 428,000  
  
[source: bok_terms_full.jsonl | score: 5.000]  
주당순이익(EPS)  
주당순이익(EPS; Earning Per Share)은 기업이 벌어들인 당기순이익을 동 기업이 발행한 총 주식수로 나눈 값을 말한다. 당기순이익(net income)은 손익계산서상의 당기순손익(net income or loss)을 뜻한다. 당기순손익은 계속사업손익에 중단사업손익을 가감하여 산출되며, 당해 회계연도의 최종적인 경영성과를 나타낸다.  
  
[source: events_catalog_v2.json | score: 4.500]  
IMF SDR 6,500억달러 상당 배분(2021)  
팬데믹 충격 대응을 위한 사상 최대의 SDR 일반 배분 실시.  
year: 2021  
region: GLOBAL  
  
[source: chunks_flat.jsonl | score: 0.107]  
EPS증가율 N/A 적지 적지…
- **Top Contexts:**
  - dataset=wise_reports, source=wisereport_all copy.json (code=000660, name=SK하이닉스, chunk_id=36669-0), score=5.500, snippet="code: 000660 name: SK하이닉스 market: KOSPI eps: 27,182 | bps: 107,256 | per: 15.75 | industry_per: 17.38 | pbr: 3.99 | dividend_yield: 0.51% | previous_close: 428,000"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=521-0), score=5.000, snippet="주당순이익(EPS) 주당순이익(EPS; Earning Per Share)은 기업이 벌어들인 당기순이익을 동 기업이 발행한 총 주식수로 나눈 값을 말한다. 당기순이익(net income)은 손익계산서상의 당기순손익(net income or loss)을 뜻한다. 당기순손익은 계속사업손익에 중단사업손익을 가감하여 산출되며, 당해 회계연도의 최종적인 경영성과를 나…"
  - dataset=events_catalog, source=events_catalog_v2.json (name=IMF SDR 6,500억달러 상당 배분(2021), chunk_id=9579-0), score=4.500, snippet="IMF SDR 6,500억달러 상당 배분(2021) 팬데믹 충격 대응을 위한 사상 최대의 SDR 일반 배분 실시. year: 2021 region: GLOBAL"
  - dataset=document_chunks, source=chunks_flat.jsonl (chunk_id=5725-0), score=0.107, snippet="EPS증가율 N/A 적지 적지 적지 적지 자본조정 0 7 20 30 28 수익성(%) 기타포괄이익누계액 0 0 0 0 0 투자지표 현금흐름표 (단위:억원)"
  - dataset=document_chunks, source=알기_쉬운_경제지표해설(2023)F.pdf (chunk_id=510), score=0.096, snippet="<그림 17-3> 국제원자재가격 추이00232015100502004006008001,00002,0003,0004,0005,000(1967년 = 100)(1931년 = 100)CRB선물가격지수(좌축)로이터상품가격지수(우축)"

### 2.7 구글(Alphabet) 회사 개요 알려줘

- **Answer:**  Summary based on top 5 contexts:  
  
[source: naver_terms_name_summary_profile.json | score: 5.000]  
구글  
2015년 8월에 설립된 지주회사 알파벳(Alphabet Inc.)의 자회사로 편입됐다. 현재 전 세계에서 가장 큰 인터넷 기업 중 하나이자 인터넷 관련 서비스와 제품을 전문으로 하는 미국의 다국적 기술 기업이다. 세계에서 가장 많이 방문하는 웹사이트 '구글닷컴(Google.com)'을 운영한다.  
  
[source: bok_terms_full.jsonl | score: 5.000]  
갑기금(Capital A)  
외국은행 국내지점의 대차대조표상 자본금계정으로 ① 외국은행 국내지점의 설치 및 영업행위를 위하여 본점이 한국은행 등에 외화자금을 매각하여 해당 지점에 공급한 원화 자금 ② 해당 외국은행 국내지점의 적립금에서 전입하는 자금 ③ 외국은행 국내지점을 추가로 설치하기 위하여 이미 국내에 설치된 외국은행 국내지점의 이월이익잉여금에서 전입하는 자금 등이 이에 해당한다. 갑기금은 금융위원회로부터 인정받은 금액에 한하여 지점별로 관리하되 각 외은지점의 갑기금은 30억원 이상이어야 한다.([은행법 시행령] 제26조, [은행업 감독규정] 제11조)  
  
[source: bok_terms_full.jsonl | score: 5.000]  
을기금(Capital B)  
외국은행 국내지점…
- **Top Contexts:**
  - dataset=naver_terms, source=naver_terms_name_summary_profile.json (name=구글, chunk_id=33638-0), score=5.000, snippet="구글 2015년 8월에 설립된 지주회사 알파벳(Alphabet Inc.)의 자회사로 편입됐다. 현재 전 세계에서 가장 큰 인터넷 기업 중 하나이자 인터넷 관련 서비스와 제품을 전문으로 하는 미국의 다국적 기술 기업이다. 세계에서 가장 많이 방문하는 웹사이트 '구글닷컴(Google.com)'을 운영한다."
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=14-0), score=5.000, snippet="갑기금(Capital A) 외국은행 국내지점의 대차대조표상 자본금계정으로 ① 외국은행 국내지점의 설치 및 영업행위를 위하여 본점이 한국은행 등에 외화자금을 매각하여 해당 지점에 공급한 원화 자금 ② 해당 외국은행 국내지점의 적립금에서 전입하는 자금 ③ 외국은행 국내지점을 추가로 설치하기 위하여 이미 국내에 설치된 외국은행 국내지점의 이월이익잉여금에서 전입하…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=437-0), score=5.000, snippet="을기금(Capital B) 외국은행 국내지점의 동일인 및 동일계열기업군 여신한도 등 은행법상의 영업규제와 관련하여 자기자본을 확대해줌으로써 여신기능이 원활히 수행될 수 있도록 하기 위한 명목상의 자본금으로 대차대조표에는 나타나지 않는다. 현재 을기금은 [은행업 감독규정] 제11조에 의거 외국은행 국내지점이 외화자금을 환매조건부로 한국은행에 매각하여 보유·운…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=689-0), score=5.000, snippet="N-B SRS N-B SRS(Network-Based Systemic Risk Scoring)은 특정은행의 도산확률이 여타 은행과의 상호거래 익스포저를 통해 확대되어 나타나는 리스크 총량으로, 개별은행의 도산확률과 거래상대방과의 상호거래 규모를 곱한 값의 제곱근으로 정의한다(Das, 2015)."
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=694-0), score=5.000, snippet="Treasury Bill(T/B) Treasury Bill(T/B)은 미국 재무성이 발행하는 만기 4주(1개월), 13주(3개월), 26주(6개월), 52주(1년) 등 1년 이하의 국채로서 이자지급이 없는 할인채(zero coupon bond)의 형태로 발행된다. 단기금융시장의 여타 투자대상보다 수익률은 다소 낮지만, 이자소득에 대한 주세(州稅)가 면제되며…"

### 2.8 카카오 회사 요약

- **Answer:**  Summary based on top 5 contexts:  
  
[source: wisereport_all copy.json | score: 4.000]  
code: 035720  
name: 카카오  
market: KOSPI  
eps: 124 | bps: 23,100 | per: 498.84 | industry_per: 30.22 | pbr: 2.69 | dividend_yield: 0.11% | previous_close: 62,100  
  
[source: naver_terms_name_summary_profile.json | score: 0.783]  
아르셀로미탈  
룩셈부르크의 다국적 철강 회사  
  
[source: naver_terms_name_summary_profile.json | score: 0.758]  
론풀랑크  
제약기업으로 프랑스 회사  
  
[source: naver_terms_name_summary_profile.json | score: 0.694]  
카메룬항공  
카메룬의 국영항공회사  
  
[source: naver_terms_name_summary_profile.json | score: 0.686]  
비방디유니버설  
프랑스 통신회사 비방디가 미국 유니버설스튜디오를 합병해 세운 회사
- **Top Contexts:**
  - dataset=wise_reports, source=wisereport_all copy.json (code=035720, name=카카오, chunk_id=36687-0), score=4.000, snippet="code: 035720 name: 카카오 market: KOSPI eps: 124 | bps: 23,100 | per: 498.84 | industry_per: 30.22 | pbr: 2.69 | dividend_yield: 0.11% | previous_close: 62,100"
  - dataset=naver_terms, source=naver_terms_name_summary_profile.json (name=아르셀로미탈, chunk_id=35460-0), score=0.783, snippet="아르셀로미탈 룩셈부르크의 다국적 철강 회사"
  - dataset=naver_terms, source=naver_terms_name_summary_profile.json (name=론풀랑크, chunk_id=36242-0), score=0.758, snippet="론풀랑크 제약기업으로 프랑스 회사"
  - dataset=naver_terms, source=naver_terms_name_summary_profile.json (name=카메룬항공, chunk_id=36032-0), score=0.694, snippet="카메룬항공 카메룬의 국영항공회사"
  - dataset=naver_terms, source=naver_terms_name_summary_profile.json (name=비방디유니버설, chunk_id=34197-0), score=0.686, snippet="비방디유니버설 프랑스 통신회사 비방디가 미국 유니버설스튜디오를 합병해 세운 회사"

### 2.9 통화정책이 경제에 미치는 영향은?

- **Answer:**  Summary based on top 5 contexts:  
  
[source: bok_terms_full.jsonl | score: 5.000]  
거시건전성 정책  
개별 금융회사의 부실 방지를 목적으로 하는 미시건전성정책(microprudential policy)과 달리 경제전체의 금융안정을 위해 시스템 리스크(systemic risk)를 억제하는 정책을 의미한다. 구체적으로 거시건전성정책(macroprudential policy)의 목표는 시스템 리스크에 대한 선제적 대응, 과도한 금융불균형 축적 억제, 급격한 되돌림 현상(unwinding) 완화, 금융시스템의 복원력(resilience) 강화, 금융연계성 제어 등을 통해 금융위기의 발생가능성과 실물경제에 미치는 부정적인 영향(spillover effects)을 최소화하는 데 있다. 거시건전성정책은 통화정책과 재정정책 등 여러 다른 정책과 긴밀히 관련되어 있으므로, 거시건전성정책의 수립과 집행에는 여러 정책당국 간 정보 공유와 협력 및 조정이 긴요하다.  
  
[source: bok_terms_full.jsonl | score: 5.000]  
교환성 통화  
국제적인 통용력을 가진 특정국가의 통화를 말한다. 현재는 외환시장에서 미국의 달러화와 자유로이 교환 가능한 통화라는 의미로 사용되고 있다. 현재 국제통화기금(IMF)에서는 IMF 협정에 따라 IMF 회원은 자국통화에 교환성을 부여할 의무를 부…
- **Top Contexts:**
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=15-0), score=5.000, snippet="거시건전성 정책 개별 금융회사의 부실 방지를 목적으로 하는 미시건전성정책(microprudential policy)과 달리 경제전체의 금융안정을 위해 시스템 리스크(systemic risk)를 억제하는 정책을 의미한다. 구체적으로 거시건전성정책(macroprudential policy)의 목표는 시스템 리스크에 대한 선제적 대응, 과도한 금융불균형 축적 억…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=60-0), score=5.000, snippet="교환성 통화 국제적인 통용력을 가진 특정국가의 통화를 말한다. 현재는 외환시장에서 미국의 달러화와 자유로이 교환 가능한 통화라는 의미로 사용되고 있다. 현재 국제통화기금(IMF)에서는 IMF 협정에 따라 IMF 회원은 자국통화에 교환성을 부여할 의무를 부여받고 있다."
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=99-0), score=5.000, snippet="규모의 경제 일반적인 경우 기업이 재화 및 서비스 생산량을 늘려감에 따라 추가적으로 소요되는 평균 생산비용도 점차 늘어난다. 그런데 일부 재화 및 서비스 생산의 경우에는 생산량이 늘어날수록 평균비용이 감소하는 현상이 나타나는데 이를 규모의 경제(economies of scale)라고 한다. 이런 현상은 초기 생산단계에서 막대한 투자비용이 필요하지만 생산에는…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=237-0), score=5.000, snippet="범위의 경제 한 기업이 여러 제품을 같이 생산할 경우가 개별 기업이 한 종류의 제품만을 생산하는 경우보다 평균 생산비용이 적게 들 때 범위의 경제(economies of scope)가 존재한다고 말한다. 승용차와 트럭을 같이 생산하는 기업의 경우 소재부품이나 조립라인 등의 생산시설을 공동으로 사용할 수 있는 이점을 갖게 된다. 이러한 현상은 동일한 생산요소…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=605-0), score=5.000, snippet="통화정책 통화정책이란 독점적 발권력을 지닌 중앙은행이 통화량이나 금리에 영향을 미쳐 물가안정, 금융안정 등을 달성함으로써 경제가 지속가능한 성장을 이룰 수 있도록 하는 정책을 말한다. 중앙은행이 처음부터 이와 같은 통화정책을 수행한 것은 아니었다. 초기 정부자금 관리나 은행제도 보호 등의 역할을 주로 하던 중앙은행이 경제상황 변화에 대응하여 적정 수준의 통…"

### 2.10 소비자물가지수(CPI)는 무엇을 나타내?

- **Answer:**  Summary based on top 5 contexts:  
  
[source: bok_terms_full.jsonl | score: 5.000]  
경직적 물가지수  
소비자물가지수를 구성하는 품목 중에 가격이 경직적으로 움직이는 품목과 신축적으로 움직이는 품목으로 나누어 볼 수 있는데, 그중 경직적으로 움직이는 품목들을 대상으로 만든 물가지수를 경직적 물가지수, 신축적으로 움직이는 품목을 대상으로 한 물가지수를 신축적 물가지수라 한다. 예를 들어 정부의 직·간접적인 영향을 크게 받는 공공서비스, 전기·수도, 담배, 보육·급식 가격이나 개인서비스 요금 등은 대체로 경직적 물가를 구성하는 주요 품목이다. 이러한 경직적 물가는 통화정책 관점에서 소비자물가 예측에 매우 유용한 물가지표이다.  
  
[source: bok_terms_full.jsonl | score: 5.000]  
물가지수  
시장에서 거래되는 여러 가지 상품과 서비스의 가격을 경제생활에서 차지하는 중요도를 고려하여 평균한 종합적인 가격수준을 물가라고 하는데, 이 같은 물가의 변화를 한 눈에 알아볼 수 있도록 기준연도의 물가수준을 100으로 놓고 비교되는 다른 시점의 물가를 지수의 형태로 나타낸 것을 말한다. 물가지수(PI; Price Index)는 경제성장, 국제수지 등과 함께 한 나라 거시경제의 움직임을 나타내는 중요한 경제지표로, 물가지수를 이용하면 일정기간 동안의 생계비 또는 화폐가치의…
- **Top Contexts:**
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=37-0), score=5.000, snippet="경직적 물가지수 소비자물가지수를 구성하는 품목 중에 가격이 경직적으로 움직이는 품목과 신축적으로 움직이는 품목으로 나누어 볼 수 있는데, 그중 경직적으로 움직이는 품목들을 대상으로 만든 물가지수를 경직적 물가지수, 신축적으로 움직이는 품목을 대상으로 한 물가지수를 신축적 물가지수라 한다. 예를 들어 정부의 직·간접적인 영향을 크게 받는 공공서비스, 전기·수…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=224-0), score=5.000, snippet="물가지수 시장에서 거래되는 여러 가지 상품과 서비스의 가격을 경제생활에서 차지하는 중요도를 고려하여 평균한 종합적인 가격수준을 물가라고 하는데, 이 같은 물가의 변화를 한 눈에 알아볼 수 있도록 기준연도의 물가수준을 100으로 놓고 비교되는 다른 시점의 물가를 지수의 형태로 나타낸 것을 말한다. 물가지수(PI; Price Index)는 경제성장, 국제수지…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=138-0), score=5.000, snippet="기업어음(CP) 기업어음(CP; Commercial Paper)은 신용상태가 양호한 기업이 상거래와 관계없이 운전자금 등 단기자금을 조달하기 위하여 자기신용을 바탕으로 발행하는 융통어음을 의미한다. 따라서 상거래에 수반되어 발행되는 상업어음(commercial bill, 진성어음)과는 성격이 다르지만, 법적으로는 상업어음과 같은 약속어음으로 분류된다. CP…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=226-0), score=5.000, snippet="미달러화 지수 미달러화 지수(US dollar Index)는 주요국 통화 대비 미 달러화의 평균적인 가치를 나타내는 지표이다. 브레튼우즈 체제 붕괴로 주요국이 변동환율제로 이행하면서 1973년 미 연준이 교역규모를 반영한 달러환율의 움직임을 나타내기 위해 만들었다. 미달러화 지수는 미 달러화와 교역상대국 통화 간 환율을 교역량 가중치로 평균하여 산출한 것으…"
  - dataset=bok_terms, source=bok_terms_full.jsonl (chunk_id=554-0), score=5.000, snippet="집중도 지수(HHI) 특정 산업에 속한 시장참여자들의 매출액이나 자산규모 등을 기준으로 시장점유율을 백분율(%)로 산출한 후 이들 모두를 각각 제곱한 값을 합산한 수치로, 이 수치가 높을수록 해당 산업이 소수의 참여자들에 의한 지배력이 커짐을 나타낸다. 미국에서는 특정 기업의 지배력이 과다하게 커지는 것을 예방하기 위해 1992년부터 반독점금지국(DOJ)과…"
