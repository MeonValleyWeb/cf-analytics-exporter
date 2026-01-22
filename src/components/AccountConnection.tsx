import { useEffect, useState } from 'react';
import { SignedOut, useAuth } from '@clerk/astro/react';

type Zone = {
  id: string;
  name: string;
};

export default function AccountConnection() {
  const { userId } = useAuth();
  const [apiToken, setApiToken] = useState('');
  const [status, setStatus] = useState('');
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [showTokenForm, setShowTokenForm] = useState(true);

  const loadZones = async () => {
    if (!userId) {
      return;
    }

    setStatus('Loading zones...');

    const res = await fetch('/.netlify/functions/cf-zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    const data = await res.json();
    if (data?.error) {
      setStatus(data.error);
      setZones([]);
      return;
    }

    const nextZones: Zone[] = data?.zones || [];
    setZones(nextZones);
    if (nextZones.length > 0) {
      setShowTokenForm(false);
    }

    const stored = localStorage.getItem('cf_selected_zone');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.zoneId) {
          setSelectedZone(parsed.zoneId);
        }
      } catch (error) {
        localStorage.removeItem('cf_selected_zone');
      }
    }

    setStatus(nextZones.length ? 'Zones loaded.' : 'No zones available.');
  };

  const saveToken = async () => {
    if (!userId) {
      setStatus('Sign in required.');
      return;
    }

    if (!apiToken.trim()) {
      setStatus('Enter a token first.');
      return;
    }

    setStatus('Saving token...');

    const res = await fetch('/.netlify/functions/cf-store-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, apiToken: apiToken.trim() })
    });

    const data = await res.json();
    if (data?.error) {
      setStatus(data.error);
      return;
    }

    setApiToken('');
    setStatus('Token saved.');
    await loadZones();
  };

  const handleZoneSelect = (zoneId: string) => {
    setSelectedZone(zoneId);
    const zone = zones.find(item => item.id === zoneId);
    if (!zone) {
      return;
    }

    const payload = { zoneId: zone.id, zoneName: zone.name };
    localStorage.setItem('cf_selected_zone', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('zone-selected', { detail: payload }));
  };

  useEffect(() => {
    if (userId) {
      loadZones();
      return;
    }

    setZones([]);
    setSelectedZone('');
    setShowTokenForm(true);
  }, [userId]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Connect Cloudflare Account</h2>
          <p className="mt-1 text-sm text-gray-600">
            Store an API token to load zones and select a domain.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Create a token with <code className="rounded bg-gray-100 px-1">Zone:Read</code> and{' '}
            <code className="rounded bg-gray-100 px-1">Zone.Analytics:Read</code> permissions from the{' '}
            <a
              href="https://dash.cloudflare.com/profile/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 hover:underline"
            >
              Cloudflare API Tokens
            </a>{' '}
            page.
          </p>
        </div>
      </div>

      <SignedOut>
        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
          Sign in to save a token. <a className="text-orange-600 hover:underline" href="/sign-in">Sign in</a>
        </div>
      </SignedOut>

      <div className="mt-6 space-y-4">
        {showTokenForm ? (
          <>
            <div>
              <label htmlFor="cf-api-token" className="block text-sm font-medium text-gray-700">
                Cloudflare API token
              </label>
              <input
                id="cf-api-token"
                type="password"
                value={apiToken}
                onChange={event => setApiToken(event.target.value)}
                placeholder="Paste a token with Zone:Read + Zone.Analytics:Read"
                className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                id="cf-token-save"
                type="button"
                onClick={saveToken}
                disabled={!userId}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Token
              </button>
              <span className="text-sm text-gray-500">{status}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-600">Token saved. Choose a zone below.</div>
            <button
              type="button"
              onClick={() => setShowTokenForm(true)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Replace token
            </button>
          </div>
        )}
        <div>
          <label htmlFor="cf-zone-select" className="block text-sm font-medium text-gray-700">
            Select a zone
          </label>
          <select
            id="cf-zone-select"
            value={selectedZone}
            onChange={event => handleZoneSelect(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">{zones.length ? 'Select a zone' : 'Save a token to load zones'}</option>
            {zones.map(zone => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
