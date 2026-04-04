interface ProgressBarProps {
  value: number;
}

export default function ProgressBar({ value }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="h-[5px] bg-border rounded overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-brand-cyan to-cyan-300 rounded transition-all duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
