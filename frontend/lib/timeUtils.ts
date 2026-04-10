const DEFAULT_TZ = 'Europe/Stockholm';

function getTz(): string {
  return (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_TIMEZONE) || DEFAULT_TZ;
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      timeZone: getTz(),
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTimeWithZone(dateStr: string | null | undefined): string {
  const formatted = formatDateTime(dateStr);
  if (formatted === '—') return formatted;
  try {
    const abbr = new Intl.DateTimeFormat('en', {
      timeZone: getTz(),
      timeZoneName: 'short',
    }).formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')
      ?.value || '';
    return `${formatted} ${abbr}`;
  } catch {
    return formatted;
  }
}
