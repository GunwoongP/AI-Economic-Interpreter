import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const reportPath = path.resolve(__dirname, 'report.md');
  const sections: string[] = [
    '# RAG Retrieval Sanity Check',
    '탐색 일시: ' + new Date().toISOString(),
    '',
    'RAG 모듈이 비활성화되어 검색 리포트를 생성하지 않습니다.',
  ];

  fs.writeFileSync(reportPath, sections.join('\n'), 'utf-8');
  console.log(`Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
