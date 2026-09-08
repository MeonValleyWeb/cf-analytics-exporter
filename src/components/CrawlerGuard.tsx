import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/astro/react';

type Zone = {
  id: string;
  name: string;
  status: string;
  account: { id: string; name: string };
  plan: { name: string; isPaid: boolean };
};

type Account = {
  id: string;
  name: string;
  zoneCount: number;
};

type VisibilityState = 'allowed' | 'blocked' | 'partial' | 'unknown';

type CrawlerResult = {
  name: string;
  state: VisibilityState;
  rule: string | null;
};

type VisibilityResult = {
  state: VisibilityState;
  crawlers: CrawlerResult[];
};

type Finding = {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'pass';
  title: string;
  detail: string;
  remediation: string;
};

type ScanResult = {
  scan: {
    scannedAt: string;
    readOnly: boolean;
    botManagement: {
      status: string;
      message: string | null;
      config: Record<string, unknown> | null;
    };
    robots: {
      status: string;
      url: string;
      httpStatus: number | null;
      contentType: string | null;
      fetchedAt: string;
      location: string | null;
      excerpt: string | null;
    };
  };
  assessment: {
    zone: Zone;
    visibility: {
      search: VisibilityResult;
      aiAgents: VisibilityResult;
      aiTraining: VisibilityResult;
    };
    managedRobots: {
      state: 'enabled' | 'disabled' | 'unknown';
      markerPresent: boolean;
      preferenceSync: boolean | null;
      conflict: boolean;
    };
    policyChange: {
      effectiveDate: string;
      phase: 'upcoming' | 'active';
      daysUntil: number;
      state: 'risk' | 'clear' | 'unknown';
      legacyPolicy: string | null;
    };
    contentSignals: Record<string, string>;
    findings: Finding[];
  };
};

const visibilityLabels: Record<VisibilityState, string> = {
  allowed: 'Allowed',
  blocked: 'Blocked',
  partial: 'At risk',
  unknown: 'Unknown'
};

const visibilityClasses: Record<VisibilityState, string> = {
  allowed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blocked: 'border-red-200 bg-red-50 text-red-800',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
  unknown: 'border-gray-200 bg-gray-100 text-gray-700'
};

const findingClasses: Record<Finding['severity'], string> = {
  critical: 'border-red-200 bg-red-50',
  warning: 'border-amber-200 bg-amber-50',
  info: 'border-sky-200 bg-sky-50',
  pass: 'border-emerald-200 bg-emerald-50'
};

function VisibilityCard({
  title,
  description,
  result
}: {
  title: string;
  description: string;
  result: VisibilityResult;
}) {
  return (
    <article className={`rounded-xl border p-5 ${visibilityClasses[result.state]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm opacity-80">{description}</p>
        </div>
        <span className="rounded-full border border-current/20 px-2.5 py-1 text-xs font-semibold">
          {visibilityLabels[result.state]}
        </span>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {result.crawlers.map((crawler) => (
          <li key={crawler.name} className="flex items-center justify-between gap-3">
            <span>{crawler.name}</span>
            <span className="text-xs font-medium">
              {visibilityLabels[crawler.state]}
              {crawler.rule ? ` · ${crawler.rule}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export default function CrawlerGuard() {
  const { isLoaded, userId } = useAuth();
  const [zones, setZones] = useState<Zone[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [loadingZones, setLoadingZones] = useState(false);
  const [zonesError, setZonesError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    if (!isLoaded || !userId) {
      return;
    }

    let cancelled = false;
    const loadZones = async () => {
      setLoadingZones(true);
      setZonesError('');

      try {
        const response = await fetch('/api/cf-zones');
        const data = await response.json();
        if (!response.ok || data?.error) {
          throw new Error(data?.error || 'Could not load Cloudflare zones.');
        }

        if (cancelled) {
          return;
        }

        const nextZones: Zone[] = data.zones || [];
        setZones(nextZones);
        setAccounts(data.accounts || []);

        const stored = localStorage.getItem('cf_selected_zone');
        const storedZoneId = stored ? JSON.parse(stored)?.zoneId : null;
        const initialZone = nextZones.find((zone) => zone.id === storedZoneId) || nextZones[0];
        setSelectedZoneId(initialZone?.id || '');
      } catch (error) {
        if (!cancelled) {
          setZonesError(
            error instanceof Error ? error.message : 'Could not load Cloudflare zones.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingZones(false);
        }
      }
    };

    loadZones();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId]);

  const zonesByAccount = useMemo(() => {
    return accounts.map((account) => ({
      account,
      zones: zones.filter((zone) => zone.account.id === account.id)
    }));
  }, [accounts, zones]);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || null;

  const runScan = async () => {
    if (!selectedZoneId) {
      return;
    }

    setScanning(true);
    setScanError('');
    setResult(null);

    try {
      const response = await fetch(
        `/api/crawler-guard?zoneId=${encodeURIComponent(selectedZoneId)}`
      );
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || 'Crawler Guard scan failed.');
      }
      setResult(data);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Crawler Guard scan failed.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                Crawler Guard v0.7
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                Read-only
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-950">
              See who can crawl your site — and why
            </h1>
            <p className="mt-3 text-base leading-7 text-gray-600">
              Compare Cloudflare bot controls with the public robots.txt response. The scan reports
              evidence and manual fixes; it never changes Cloudflare settings.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 lg:max-w-sm">
            <p className="font-semibold">September 15 policy change</p>
            <p className="mt-1 leading-6">
              Training blocks can also affect mixed-purpose Search and Training crawlers. Scan each
              zone before relying on the legacy AI-bot setting.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label htmlFor="crawler-zone" className="block text-sm font-semibold text-gray-900">
              Cloudflare zone
            </label>
            <select
              id="crawler-zone"
              value={selectedZoneId}
              onChange={(event) => {
                setSelectedZoneId(event.target.value);
                setResult(null);
                setScanError('');
              }}
              disabled={loadingZones || !zones.length}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
            >
              <option value="">
                {loadingZones
                  ? 'Loading zones…'
                  : zones.length
                    ? 'Select a zone'
                    : 'No zones found'}
              </option>
              {zonesByAccount.map(({ account, zones: accountZones }) => (
                <optgroup key={account.id} label={`${account.name} · ${account.zoneCount} zones`}>
                  {accountZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} · {zone.plan.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedZone && (
              <p className="mt-2 text-xs text-gray-500">
                {selectedZone.account.name} · {selectedZone.status} · {selectedZone.plan.name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={runScan}
            disabled={!selectedZoneId || scanning || loadingZones}
            className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning ? 'Scanning…' : 'Scan selected zone'}
          </button>
        </div>

        {zonesError && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Zones could not be loaded</p>
            <p className="mt-1">{zonesError}</p>
            <a href="/settings" className="mt-2 inline-block font-semibold underline">
              Check the stored Cloudflare token
            </a>
          </div>
        )}

        {scanError && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Scan failed</p>
            <p className="mt-1">{scanError}</p>
          </div>
        )}
      </section>

      {result && (
        <>
          <section aria-labelledby="visibility-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-orange-700">
                  {result.assessment.zone.name}
                </p>
                <h2 id="visibility-heading" className="text-2xl font-bold text-gray-950">
                  Crawler visibility
                </h2>
              </div>
              <p className="text-xs text-gray-500">Scanned {formatDate(result.scan.scannedAt)}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <VisibilityCard
                title="Search"
                description="Traditional indexing and discovery"
                result={result.assessment.visibility.search}
              />
              <VisibilityCard
                title="AI search & agents"
                description="Live answers and user-initiated fetches"
                result={result.assessment.visibility.aiAgents}
              />
              <VisibilityCard
                title="AI training"
                description="Model training and fine-tuning crawlers"
                result={result.assessment.visibility.aiTraining}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-500">
              Allowed and blocked results describe the evidence visible to this scan. robots.txt is
              advisory; Cloudflare enforcement can only be confirmed when Bot Management Read is
              available.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Managed robots.txt
              </p>
              <p className="mt-2 text-lg font-semibold text-gray-950">
                {result.assessment.managedRobots.state === 'enabled'
                  ? 'Enabled'
                  : result.assessment.managedRobots.state === 'disabled'
                    ? 'Disabled'
                    : 'Unknown'}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-600">Public managed marker</dt>
                  <dd className="font-medium text-gray-900">
                    {result.assessment.managedRobots.markerPresent ? 'Present' : 'Not found'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-600">Bot Preference Sync</dt>
                  <dd className="font-medium text-gray-900">
                    {result.assessment.managedRobots.preferenceSync === null
                      ? 'Unknown'
                      : result.assessment.managedRobots.preferenceSync
                        ? 'Enabled'
                        : 'Disabled'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-600">Conflict</dt>
                  <dd
                    className={`font-medium ${result.assessment.managedRobots.conflict ? 'text-red-700' : 'text-emerald-700'}`}
                  >
                    {result.assessment.managedRobots.conflict ? 'Needs review' : 'Not detected'}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Mixed-purpose crawler policy
              </p>
              <p className="mt-2 text-lg font-semibold text-gray-950">
                {result.assessment.policyChange.state === 'risk'
                  ? 'Action recommended'
                  : result.assessment.policyChange.state === 'clear'
                    ? 'No legacy block detected'
                    : 'Could not verify'}
              </p>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                {result.assessment.policyChange.phase === 'upcoming'
                  ? `Effective September 15, 2026 · ${result.assessment.policyChange.daysUntil} days remaining at scan time.`
                  : 'The September 15, 2026 behavior is now active.'}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                Legacy setting:{' '}
                <span className="font-medium text-gray-900">
                  {result.assessment.policyChange.legacyPolicy || 'Unknown'}
                </span>
              </p>
            </article>
          </section>

          <section aria-labelledby="findings-heading">
            <h2 id="findings-heading" className="text-2xl font-bold text-gray-950">
              Findings and manual remediation
            </h2>
            <div className="mt-4 space-y-4">
              {result.assessment.findings.map((finding) => (
                <article
                  key={finding.id}
                  className={`rounded-xl border p-5 ${findingClasses[finding.severity]}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-gray-700">
                      {finding.severity}
                    </span>
                    <h3 className="font-semibold text-gray-950">{finding.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-gray-700">{finding.detail}</p>
                  <div className="mt-4 rounded-lg border border-white/70 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Manual remediation
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-800">{finding.remediation}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-gray-950">Scan evidence</h2>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="font-medium text-gray-900">Cloudflare Bot Management</p>
                <p className="mt-1 text-gray-600">Status: {result.scan.botManagement.status}</p>
                {result.scan.botManagement.message && (
                  <p className="mt-1 text-gray-600">{result.scan.botManagement.message}</p>
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">Public robots.txt</p>
                <p className="mt-1 text-gray-600">
                  Status: {result.scan.robots.status}
                  {result.scan.robots.httpStatus ? ` · HTTP ${result.scan.robots.httpStatus}` : ''}
                </p>
                <a
                  href={result.scan.robots.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-orange-700 underline"
                >
                  {result.scan.robots.url}
                </a>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {result.scan.botManagement.config && (
                <details className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                    Bot configuration evidence
                  </summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-700">
                    {JSON.stringify(result.scan.botManagement.config, null, 2)}
                  </pre>
                </details>
              )}
              {result.scan.robots.excerpt && (
                <details className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                    robots.txt excerpt
                  </summary>
                  <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-700">
                    {result.scan.robots.excerpt}
                  </pre>
                </details>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
