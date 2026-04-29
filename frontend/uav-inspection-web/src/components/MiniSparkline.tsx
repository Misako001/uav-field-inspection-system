interface MiniSparklineProps {
  values: number[];
  tone: string;
}

export function MiniSparkline({ values, tone }: MiniSparklineProps) {
  const source = values.length > 1 ? values : [0, values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...source);
  const max = Math.max(...source);
  const range = max - min || 1;

  const points = source
    .map((value, index) => {
      const x = (index / Math.max(source.length - 1, 1)) * 100;
      const y = 28 - ((value - min) / range) * 24;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `0,30 ${points} 100,30`;

  return (
    <svg className="mini-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline className="mini-sparkline__area" points={areaPoints} style={{ color: tone }} />
      <polyline className="mini-sparkline__line" points={points} style={{ color: tone }} />
    </svg>
  );
}
