export function Sparkline({
  values,
  width = 160,
  height = 40,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const data = values.slice(-120);
  if (data.length < 2) {
    return <div className="h-10 w-full rounded bg-muted/50" />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`)
    .join(" ");
  const rising = (data[data.length - 1] as number) >= (data[0] as number);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Recent price movement"
    >
      <polyline
        points={points}
        fill="none"
        stroke={rising ? "var(--signal)" : "var(--danger)"}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
