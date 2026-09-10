const SECRET_BINDING_TYPES = new Set(['secret_key', 'secret_text']);

const OBSERVABILITY_PATHS = [
  ['enabled'],
  ['head_sampling_rate'],
  ['logs', 'enabled'],
  ['logs', 'head_sampling_rate'],
  ['logs', 'invocation_logs'],
  ['logs', 'persist'],
  ['traces', 'enabled'],
  ['traces', 'head_sampling_rate'],
  ['traces', 'persist'],
  ['traces', 'propagation_policy']
];

function getPath(object, path) {
  let current = object;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function normalizeCompatibilityDate(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
}

export function normalizeWorkerSettings(settings) {
  const bindings = [];
  const seen = new Set();
  for (const binding of Array.isArray(settings?.bindings) ? settings.bindings : []) {
    if (
      typeof binding?.name !== 'string' ||
      typeof binding?.type !== 'string' ||
      SECRET_BINDING_TYPES.has(binding.type) ||
      seen.has(binding.name)
    ) {
      continue;
    }
    seen.add(binding.name);
    bindings.push({ name: binding.name, type: binding.type });
  }
  bindings.sort((left, right) => left.name.localeCompare(right.name));

  const observability = {};
  for (const path of OBSERVABILITY_PATHS) {
    const value = getPath(settings?.observability, path);
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      observability[path.join('.')] = value;
    }
  }

  return {
    compatibilityDate: normalizeCompatibilityDate(settings?.compatibility_date),
    compatibilityFlags: Array.isArray(settings?.compatibility_flags)
      ? [...new Set(settings.compatibility_flags.filter((flag) => typeof flag === 'string'))].sort(
          (left, right) => left.localeCompare(right)
        )
      : [],
    observability,
    bindings
  };
}

export function normalizeWorkerSecrets(secrets) {
  const normalized = [];
  const seen = new Set();

  for (const secret of Array.isArray(secrets) ? secrets : []) {
    if (typeof secret?.name !== 'string' || !secret.name || seen.has(secret.name)) {
      continue;
    }
    seen.add(secret.name);
    normalized.push({
      name: secret.name,
      type: typeof secret.type === 'string' ? secret.type : 'secret'
    });
  }

  return normalized.sort((left, right) => left.name.localeCompare(right.name));
}
