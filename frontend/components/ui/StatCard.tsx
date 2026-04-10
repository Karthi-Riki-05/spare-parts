interface StatCardProps {
  value: number | string;
  label: string;
  color: string;
}

export default function StatCard({ value, label, color }: StatCardProps) {
  return (
    <div className="bg-bg-card rounded-lg p-3 text-center border border-border">
      <div className={`text-[22px] font-bold leading-none mb-1 ${color}`}>
        {value}
      </div>
      <div className="text-[8px] uppercase tracking-[0.06em] text-[#4b5563]">
        {label}
      </div>
    </div>
  );
}
