import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const backendDir = path.resolve(__dirname, '../backend');
  process.chdir(backendDir);

  const { searchRAG } = await import('../backend/src/ai/rag.ts');

  const queries = [
    'GDP는 무엇을 의미하나?',
    '명목 GDP와 실질 GDP의 차이는?',
    '국민소득통계는 어떻게 활용되는가?',
    '산업연관표는 어떤 지표인가?',
    '국민대차대조표가 보여주는 것은?',
    '경기판단지표에는 어떤 것이 있나?',
    '기업경기실사지수(BSI)는 무엇인가?',
    '소비자심리지수는 어떤 의미인가?',
    '뉴스심리지수는 왜 중요하지?',
    '고용 통계를 통해 알 수 있는 것은?',
  ];

  const sections: string[] = ['# RAG Retrieval Sanity Check', '탐색 일시: ' + new Date().toISOString(), '총 질의 수: 10', ''];

  for (let idx = 0; idx < queries.length; idx += 1) {
    const query = queries[idx];
    const hits = await searchRAG(query, ['eco'], 3);

    sections.push(`## Q${idx + 1}. ${query}`);
    if (hits.length === 0) {
      sections.push('- 검색 결과 없음');
      sections.push('');
      continue;
    }

    hits.forEach((hit, hitIdx) => {
      const title = hit.meta?.title ?? '제목 없음';
      const source = hit.meta?.source ? ` (${hit.meta.source})` : '';
      const date = hit.meta?.date ? ` - ${hit.meta.date}` : '';
      const tags = hit.meta?.tags?.length ? `\n  - 태그: ${hit.meta.tags.join(', ')}` : '';
      const score = hit.sim !== undefined ? `\n  - 점수: ${hit.sim.toFixed(3)}` : '';
      const trimmed = hit.text.length > 240 ? `${hit.text.slice(0, 237)}...` : hit.text;
      sections.push(`- Top ${hitIdx + 1}: **${title}**${source}${date}`);
      sections.push(`  - 요약: ${trimmed}${tags}${score}`);
    });
    sections.push('');
  }

  const reportPath = path.resolve(__dirname, 'report.md');
  fs.writeFileSync(reportPath, sections.join('\n'), 'utf-8');
  console.log(`Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
