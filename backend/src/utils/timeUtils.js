const { config } = require('../config');

function formatTimestamp(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    return d.toLocaleString('en-GB', {
      timeZone: config.appTimezone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' (' + getTimezoneAbbr() + ')';
  } catch {
    return String(date);
  }
}

function getTimezoneAbbr() {
  try {
    return new Intl.DateTimeFormat('en', {
      timeZone: config.appTimezone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')
      ?.value || config.appTimezone;
  } catch {
    return config.appTimezone;
  }
}

module.exports = { formatTimestamp, getTimezoneAbbr };
