import { Suspense } from 'react';
import SparePartsApp from '@/components/SparePartsApp';

export default function HomePage() {
  return (
    <main className="max-w-screen-xl mx-auto px-4 py-4">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-pulse text-text-secondary">Loading application...</div>
        </div>
      }>
        <SparePartsApp />
      </Suspense>
    </main>
  );
}
