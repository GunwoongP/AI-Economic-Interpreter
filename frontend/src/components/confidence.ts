export function getConfidenceMeta(conf?: number) {
  if (conf == null || Number.isNaN(conf)) return null;
  const pct = conf > 1 ? conf : conf * 100;
  const normalized = Math.max(0, Math.min(pct, 100));

  if (normalized >= 75) {
    return {
      className: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/40',
      label: `Conf ${normalized.toFixed(0)}%`,
      title: '높은 신뢰도: 데이터 및 맥락 일치',
    };
  }
  if (normalized >= 50) {
    return {
      className: 'bg-amber-500/15 text-amber-600 border border-amber-500/40',
      label: `Conf ${normalized.toFixed(0)}%`,
      title: '중간 신뢰도: 보조 검증 권장',
    };
  }
  return {
    className: 'bg-rose-500/15 text-rose-500 border border-rose-500/40',
    label: `Conf ${normalized.toFixed(0)}%`,
    title: '낮은 신뢰도: 추가 확인 필요',
  };
}
