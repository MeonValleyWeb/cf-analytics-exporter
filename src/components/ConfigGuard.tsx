import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/astro/react';

import {
  MAX_WRANGLER_CONFIG_BYTES,
  parseWranglerConfig
} from '../lib/config-guard/wrangler-config.js';

type Account = {
  id: string;
  name: string;
  zoneCount: number;
};

type Binding = {
  name: string;
  type: string;
};

type Declaration = {
  compatibilityDate: string | null;
  compatibilityFlags: string[];
  observability: Record<string, string | number | boolean>;
  secrets: string[];
  bindings: Binding[];
};

type ConfigEnvironment = {
  key: string;
  label: string;
  scriptName: string;
  accountId: string | null;
  declared: Declaration;
  warnings: string[];
};

type ParsedConfig = {
  filename: string;
  format: 'jsonc' | 'toml';
  environments: ConfigEnvironment[];
};

type Difference = {
  id: string;
  category: string;
  kind: string;
  status: 'WARNING' | 'DRIFT';
  field: string;
  name: string | null;
  declared: string | number | boolean | string[] | null;
  deployed: string | number | boolean | string[] | null;
  detail: string;
  remediation: string;
};

type ScanResult = {
  scan: {
    scannedAt: string;
    readOnly: boolean;
    account: Account;
    worker: { name: string };
    sources: {
      settings: { status: string; message: string | null };
      secrets: { status: string; message: string | null };
    };
  };
  deployed: {
    settings: {
      compatibilityDate: string | null;
      compatibilityFlags: string[];
      observability: Record<string, string | number | boolean>;
      bindings: Binding[];
    } | null;
    secrets: { name: string; type: string }[] | null;
  };
  assessment: {
    status: 'PASS' | 'WARNING' | 'DRIFT';
    summary: { drift: number; warnings: number; passed: boolean };
    differences: Difference[];
  };
};

const statusStyles = {
  PASS: {
    badge: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    panel: 'border-emerald-200 bg-emerald-50',
    label: 'No supported drift found'
  },
  WARNING: {
    badge: 'border-amber-300 bg-amber-100 text-amber-900',
    panel: 'border-amber-200 bg-amber-50',
    label: 'Review incomplete evidence'
  },
  DRIFT: {
    badge: 'border-red-300 bg-red-100 text-red-900',
    panel: 'border-red-200 bg-red-50',
    label: 'Declared and deployed state differ'
  }
};

const categoryOrder = ['secrets', 'bindings', 'runtime', 'observability', 'configuration'];

const categoryLabels: Record<string, string> = {
  secrets: 'Secret names',
  bindings: 'Bindings',
  runtime: 'Runtime',
  observability: 'Observability',
  configuration: 'Configuration coverage'
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatValue(value: Difference['declared']) {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : 'None';
  }
  if (value === null || value === '') {
    return 'Not present';
  }
  return String(value);
}

function SourceStatus({ label, status }: { label: string; status: string }) {
  const available = status === 'available';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        available
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      {label}: {status.replaceAll('_', ' ')}
    </span>
  );
}

export default function ConfigGuard() {
  const { isLoaded, userId } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState('');
  const [parsedConfig, setParsedConfig] = useState<ParsedConfig | null>(null);
  const [selectedEnvironmentKey, setSelectedEnvironmentKey] = useState('default');
  const [fileError, setFileError] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    if (!isLoaded || !userId) {
      return;
    }

    let cancelled = false;
    const loadAccounts = async () => {
      setLoadingAccounts(true);
      setAccountsError('');
      try {
        const response = await fetch('/api/cf-zones');
        const data = await response.json();
        if (!response.ok || data?.error) {
          throw new Error(data?.error || 'Could not load Cloudflare accounts.');
        }
        if (!cancelled) {
          const nextAccounts: Account[] = data.accounts || [];
          setAccounts(nextAccounts);
          setSelectedAccountId((current) => current || nextAccounts[0]?.id || '');
        }
      } catch (error) {
        if (!cancelled) {
          setAccountsError(
            error instanceof Error ? error.message : 'Could not load Cloudflare accounts.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingAccounts(false);
        }
      }
    };

    loadAccounts();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId]);

  const selectedEnvironment =
    parsedConfig?.environments.find((environment) => environment.key === selectedEnvironmentKey) ||
    null;

  const differencesByCategory = useMemo(() => {
    if (!result) {
      return [];
    }
    return categoryOrder
      .map((category) => ({
        category,
        differences: result.assessment.differences.filter(
          (difference) => difference.category === category
        )
      }))
      .filter((group) => group.differences.length);
  }, [result]);

  const chooseAccountForEnvironment = (environment: ConfigEnvironment, nextAccounts = accounts) => {
    const configured = nextAccounts.find((account) => account.id === environment.accountId);
    setSelectedAccountId(configured?.id || nextAccounts[0]?.id || '');
  };

  const handleFile = async (file: File | null) => {
    setFileError('');
    setCheckError('');
    setResult(null);
    setParsedConfig(null);

    if (!file) {
      return;
    }
    if (file.size > MAX_WRANGLER_CONFIG_BYTES) {
      setFileError('Wrangler configuration exceeds the 512 KiB safety limit.');
      return;
    }

    try {
      const source = await file.text();
      const parsed = parseWranglerConfig(file.name, source) as ParsedConfig;
      const initialEnvironment = parsed.environments[0];
      setParsedConfig(parsed);
      setSelectedEnvironmentKey(initialEnvironment.key);
      chooseAccountForEnvironment(initialEnvironment);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not read this Wrangler file.');
    }
  };

  const runCheck = async () => {
    if (!selectedEnvironment || !selectedAccountId) {
      return;
    }

    setChecking(true);
    setCheckError('');
    setResult(null);
    try {
      const response = await fetch('/api/config-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          scriptName: selectedEnvironment.scriptName,
          declared: selectedEnvironment.declared,
          declarationWarnings: selectedEnvironment.warnings
        })
      });
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || 'Config Guard check failed.');
      }
      setResult(data);
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : 'Config Guard check failed.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
        <div className="absolute inset-y-0 right-0 hidden w-2/5 opacity-20 lg:block">
          <div className="absolute right-12 top-8 h-40 w-40 rounded-full border border-orange-300" />
          <div className="absolute right-24 top-20 h-40 w-40 rounded-full border border-orange-300" />
          <div className="absolute right-36 top-32 h-40 w-40 rounded-full border border-orange-300" />
        </div>
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-orange-400/40 bg-orange-400/10 px-3 py-1 text-xs font-semibold text-orange-200">
              Config Guard v0.8
            </span>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              Read-only
            </span>
          </div>
          <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-orange-300">
            Git intent / deployed reality
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Catch the gap before the next deploy hides it
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Compare a local Wrangler configuration with the live Worker metadata Cloudflare returns.
            Config Guard identifies stale secrets, binding drift, runtime differences, and
            observability changes without applying a fix.
          </p>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 md:grid-cols-3">
        {[
          ['01', 'Choose locally', 'The Wrangler file is parsed in this browser tab.'],
          ['02', 'Read metadata', 'The server requests Worker settings and secret names only.'],
          ['03', 'Review drift', 'Every difference includes a manual, reversible next step.']
        ].map(([step, title, copy]) => (
          <div key={step} className="bg-white p-5">
            <p className="font-mono text-xs font-bold text-orange-600">{step}</p>
            <h2 className="mt-2 font-semibold text-gray-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">{copy}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-orange-600">
                Source of truth
              </p>
              <h2 className="mt-2 text-xl font-bold text-gray-950">Select a Wrangler file</h2>
            </div>
            <svg
              aria-hidden="true"
              className="h-8 w-8 text-orange-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" />
            </svg>
          </div>

          <label className="mt-6 block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center transition hover:border-orange-400 hover:bg-orange-50/40 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-200">
            <span className="block text-sm font-semibold text-gray-900">
              Choose wrangler.json, wrangler.jsonc, or wrangler.toml
            </span>
            <span className="mt-1 block text-xs text-gray-500">Maximum size 512 KiB</span>
            <input
              type="file"
              accept=".json,.jsonc,.toml,application/json,text/plain"
              className="sr-only"
              onChange={(event) => handleFile(event.target.files?.[0] || null)}
            />
          </label>

          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            <p className="font-semibold">The raw file stays in this browser tab.</p>
            <p className="mt-1 leading-6 text-sky-900">
              Only the Worker name, binding names/types, required secret names, runtime date/flags,
              and supported observability values are sent for comparison. Variable values and
              resource IDs are discarded first.
            </p>
          </div>

          {fileError && (
            <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {fileError}
            </div>
          )}

          {parsedConfig && selectedEnvironment && (
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="config-environment"
                    className="text-sm font-semibold text-gray-900"
                  >
                    Wrangler environment
                  </label>
                  <select
                    id="config-environment"
                    value={selectedEnvironmentKey}
                    onChange={(event) => {
                      const key = event.target.value;
                      const environment = parsedConfig.environments.find(
                        (candidate) => candidate.key === key
                      );
                      setSelectedEnvironmentKey(key);
                      setResult(null);
                      setCheckError('');
                      if (environment) {
                        chooseAccountForEnvironment(environment);
                      }
                    }}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  >
                    {parsedConfig.environments.map((environment) => (
                      <option key={environment.key} value={environment.key}>
                        {environment.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="config-account" className="text-sm font-semibold text-gray-900">
                    Cloudflare account
                  </label>
                  <select
                    id="config-account"
                    value={selectedAccountId}
                    onChange={(event) => {
                      setSelectedAccountId(event.target.value);
                      setResult(null);
                      setCheckError('');
                    }}
                    disabled={loadingAccounts || !accounts.length}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
                  >
                    <option value="">
                      {loadingAccounts ? 'Loading accounts…' : 'Select an account'}
                    </option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.zoneCount} zones
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {accountsError && (
                <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  {accountsError}
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-gray-950 p-5 text-gray-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-gray-400">
                      Resolved Worker
                    </p>
                    <p className="mt-1 font-mono text-base font-semibold text-white">
                      {selectedEnvironment.scriptName}
                    </p>
                  </div>
                  <span className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 font-mono text-xs text-gray-300">
                    {parsedConfig.filename}
                  </span>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-gray-400">Bindings</dt>
                    <dd className="mt-1 text-xl font-bold">
                      {selectedEnvironment.declared.bindings.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">Required secrets</dt>
                    <dd className="mt-1 text-xl font-bold">
                      {selectedEnvironment.declared.secrets.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">Flags</dt>
                    <dd className="mt-1 text-xl font-bold">
                      {selectedEnvironment.declared.compatibilityFlags.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">Parser warnings</dt>
                    <dd className="mt-1 text-xl font-bold">
                      {selectedEnvironment.warnings.length}
                    </dd>
                  </div>
                </dl>
              </div>

              {(selectedEnvironment.declared.secrets.length > 0 ||
                selectedEnvironment.declared.bindings.length > 0) && (
                <details className="rounded-xl border border-gray-200 bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                    Review metadata that will be compared
                  </summary>
                  <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Required secret names
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedEnvironment.declared.secrets.length ? (
                          selectedEnvironment.declared.secrets.map((name) => (
                            <code key={name} className="rounded bg-gray-100 px-2 py-1 text-xs">
                              {name}
                            </code>
                          ))
                        ) : (
                          <span className="text-sm text-gray-500">None declared</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Binding names and types
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedEnvironment.declared.bindings.map((binding) => (
                          <code
                            key={binding.name}
                            className="rounded bg-gray-100 px-2 py-1 text-xs"
                          >
                            {binding.name}:{binding.type}
                          </code>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              )}

              <button
                type="button"
                onClick={runCheck}
                disabled={checking || !selectedAccountId || loadingAccounts}
                className="inline-flex w-full items-center justify-center rounded-lg bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {checking ? 'Reading deployed metadata…' : 'Run drift check'}
              </button>
            </div>
          )}

          {checkError && (
            <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {checkError}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-orange-600">
            Comparison contract
          </p>
          <h2 className="mt-2 text-xl font-bold text-gray-950">What Config Guard can prove</h2>
          <ul className="mt-5 space-y-4 text-sm text-gray-700">
            {[
              ['Secrets', 'Names and secret types only — never values.'],
              ['Bindings', 'Declared and remote binding name/type pairs.'],
              ['Runtime', 'Compatibility date and exact flag set.'],
              ['Observability', 'Only values explicitly declared and returned by the API.']
            ].map(([title, copy]) => (
              <li key={title} className="border-l-2 border-orange-300 pl-4">
                <span className="block font-semibold text-gray-950">{title}</span>
                <span className="mt-0.5 block leading-6">{copy}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-xs leading-5 text-gray-600">
            Requires a stored token with <strong>Zone Read</strong> to verify account ownership and{' '}
            <strong>Workers Scripts Read</strong> to inspect the Worker. Accounts are currently
            derived from visible zones.
          </div>
        </aside>
      </section>

      {result && (
        <section className="space-y-6" aria-live="polite">
          <div className={`rounded-2xl border p-6 ${statusStyles[result.assessment.status].panel}`}>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[result.assessment.status].badge}`}
                >
                  {result.assessment.status}
                </span>
                <h2 className="mt-3 text-2xl font-bold text-gray-950">
                  {statusStyles[result.assessment.status].label}
                </h2>
                <p className="mt-2 font-mono text-sm text-gray-700">
                  {result.scan.account.name} / {result.scan.worker.name}
                </p>
              </div>
              <div className="text-sm text-gray-600 sm:text-right">
                <p>{formatDate(result.scan.scannedAt)}</p>
                <p className="mt-1 font-semibold text-emerald-700">Read-only check</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <SourceStatus label="Settings" status={result.scan.sources.settings.status} />
              <SourceStatus label="Secrets" status={result.scan.sources.secrets.status} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-red-200 bg-white p-5">
              <p className="text-sm font-semibold text-gray-600">Drift findings</p>
              <p className="mt-2 text-3xl font-bold text-red-700">
                {result.assessment.summary.drift}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-5">
              <p className="text-sm font-semibold text-gray-600">Warnings</p>
              <p className="mt-2 text-3xl font-bold text-amber-700">
                {result.assessment.summary.warnings}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm font-semibold text-gray-600">Compared metadata</p>
              <p className="mt-2 text-3xl font-bold text-gray-950">
                {(selectedEnvironment?.declared.bindings.length || 0) +
                  (selectedEnvironment?.declared.secrets.length || 0) +
                  2 +
                  Object.keys(selectedEnvironment?.declared.observability || {}).length}
              </p>
            </div>
          </div>

          {result.assessment.status === 'PASS' ? (
            <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-emerald-900">Supported metadata matches</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Required secret names, bindings, runtime settings, and explicitly declared
                observability values match the deployed Worker evidence returned for this check.
              </p>
            </div>
          ) : (
            differencesByCategory.map(({ category, differences }) => (
              <div key={category} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-6 py-4">
                  <h2 className="font-bold text-gray-950">
                    {categoryLabels[category] || category}
                  </h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {differences.map((difference) => (
                    <article key={difference.id} className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                              difference.status === 'DRIFT'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {difference.status}
                          </span>
                          <h3 className="mt-2 font-semibold text-gray-950">
                            {difference.name || difference.field}
                          </h3>
                        </div>
                        <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                          {difference.kind.replaceAll('_', ' ')}
                        </code>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-gray-700">{difference.detail}</p>
                      <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-2">
                        <div className="bg-gray-50 p-3">
                          <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">
                            Declared
                          </dt>
                          <dd className="mt-1 break-words font-mono text-sm text-gray-900">
                            {formatValue(difference.declared)}
                          </dd>
                        </div>
                        <div className="bg-gray-50 p-3">
                          <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">
                            Deployed
                          </dt>
                          <dd className="mt-1 break-words font-mono text-sm text-gray-900">
                            {formatValue(difference.deployed)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 rounded-lg border-l-4 border-orange-400 bg-orange-50 p-4 text-sm text-orange-950">
                        <span className="font-bold">Manual remediation:</span>{' '}
                        {difference.remediation}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}

          <details className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <summary className="cursor-pointer font-bold text-gray-950">
              Safe deployed evidence
            </summary>
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Bindings</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.deployed.settings?.bindings.length ? (
                    result.deployed.settings.bindings.map((binding) => (
                      <code key={binding.name} className="rounded bg-gray-100 px-2 py-1 text-xs">
                        {binding.name}:{binding.type}
                      </code>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">No binding metadata returned.</span>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Secret names</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.deployed.secrets?.length ? (
                    result.deployed.secrets.map((secret) => (
                      <code key={secret.name} className="rounded bg-gray-100 px-2 py-1 text-xs">
                        {secret.name}:{secret.type}
                      </code>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">No secret metadata returned.</span>
                  )}
                </div>
              </div>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
