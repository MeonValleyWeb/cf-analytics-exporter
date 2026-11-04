export const DAY_MS = 86_400_000;
export const STATUS_FAMILIES = ['1xx', '2xx', '3xx', '4xx', '5xx', 'Unknown'];

const METRICS = [
  ['requests', 'Requests', 'count', 'traffic'],
  ['bytes', 'Edge response bytes', 'bytes', 'traffic'],
  ['cacheHitRate', 'Cache hit share', 'percent', 'cache'],
  ['clientErrorRate', '4xx response rate', 'percent', 'statuses'],
  ['serverErrorRate', '5xx response rate', 'percent', 'statuses']
];

export function reportWindows(now) {
  const end = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  const middle = end - 30 * DAY_MS;
  return {
    current: { start: middle, end },
    previous: { start: middle - 30 * DAY_MS, end: middle }
  };
}

export function ratio(part, whole) {
  return whole > 0 ? (part / whole) * 100 : null;
}

export function metricRows(report) {
  return METRICS.map(([key, label, unit, source]) => {
    const current = report.current.metrics?.[key] ?? null;
    const previous = report.previous.metrics?.[key] ?? null;
    let change = null;
    if (current !== null && previous !== null) {
      if (unit === 'percent') change = current - previous;
      else if (previous > 0) change = ((current - previous) / previous) * 100;
      else if (current === 0) change = 0;
    }
    return {
      key,
      label,
      unit,
      current,
      previous,
      change,
      currentNote: report.current.notes?.[source],
      previousNote: report.previous.notes?.[source]
    };
  });
}

export function reportCsv(report) {
  const date = (value) => new Date(value).toISOString();
  const rows = [
    [
      'site',
      'period',
      'start_utc_inclusive',
      'end_utc_exclusive',
      'generated_at_utc',
      'metric',
      'value',
      'unit',
      'evidence',
      'note'
    ]
  ];

  for (const period of ['current', 'previous']) {
    const window = report[period];
    const prefix = [
      report.zone.name,
      period,
      date(window.start),
      date(window.end),
      report.generatedAt
    ];
    for (const [key, , unit, source] of METRICS) {
      const value = window.metrics?.[key];
      rows.push([
        ...prefix,
        key,
        value ?? '',
        unit,
        value == null ? 'unavailable' : 'potentially sampled',
        window.notes?.[source] ?? (value == null ? 'No eligible requests for this rate.' : '')
      ]);
    }
    for (const family of STATUS_FAMILIES) {
      const value = window.statusCounts?.[family];
      rows.push([
        ...prefix,
        `edge_http_${family.toLowerCase()}`,
        value ?? '',
        'count',
        value == null ? 'unavailable' : 'potentially sampled',
        window.notes?.statuses ?? ''
      ]);
    }
  }

  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            if (typeof value === 'number') return String(value);
            const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(',')
      )
      .join('\r\n') + '\r\n'
  );
}
