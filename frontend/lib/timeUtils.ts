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
      second: '2-digit',
      hour12: false,
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
    }).formatToParts(new Date(dateStr!))
      .find(p => p.type === 'timeZoneName')
      ?.value || '';
    return `${formatted} ${abbr}`;
  } catch {
    return formatted;
  }
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      timeZone: getTz(),
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatIp(ip: string | null | undefined): string {
  if (!ip) return '—';
  return ip.replace(/^::ffff:/i, '');
}
