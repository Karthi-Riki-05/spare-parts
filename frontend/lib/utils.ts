export function getScoreClass(score: number | null | undefined): string {
  if (!score || score === 0) return 'score-na';
  if (score >= 90) return 'score-hi';
  if (score >= 70) return 'score-md';
  if (score >= 50) return 'score-lo';
  return 'score-vl';
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return 'High confidence';
  if (score >= 70) return 'Medium confidence';
  if (score >= 50) return 'Low confidence';
  if (score > 0) return 'Very low confidence';
  return 'Not scored';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatETA(seconds: number): string {
  if (seconds < 60) return `~${Math.ceil(seconds)}s remaining`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `~${mins}m ${secs}s remaining`;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
