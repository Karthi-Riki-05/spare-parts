interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-bg-card rounded-[10px] border border-border p-3 ${className}`}>
      {children}
    </div>
  );
}
