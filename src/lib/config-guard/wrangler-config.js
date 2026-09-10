import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';

export const MAX_WRANGLER_CONFIG_BYTES = 512 * 1024;

const SUPPORTED_FILENAMES = new Map([
  ['wrangler.json', 'jsonc'],
  ['wrangler.jsonc', 'jsonc'],
  ['wrangler.toml', 'toml']
]);

const ARRAY_BINDINGS = [
  ['kv_namespaces', 'binding', 'kv_namespace'],
  ['r2_buckets', 'binding', 'r2_bucket'],
  ['d1_databases', 'binding', 'd1'],
  ['services', 'binding', 'service'],
  ['analytics_engine_datasets', 'binding', 'analytics_engine'],
  ['vectorize', 'binding', 'vectorize'],
  ['hyperdrive', 'binding', 'hyperdrive'],
  ['workflows', 'binding', 'workflow'],
  ['mtls_certificates', 'binding', 'mtls_certificate'],
  ['dispatch_namespaces', 'binding', 'dispatch_namespace'],
  ['pipelines', 'binding', 'pipelines'],
  ['send_email', 'name', 'send_email']
];

const OBJECT_BINDINGS = [
  ['ai', 'binding', 'ai'],
  ['browser', 'binding', 'browser'],
  ['images', 'binding', 'images'],
  ['version_metadata', 'binding', 'version_metadata'],
  ['assets', 'binding', 'assets']
];

const UNSUPPORTED_BINDING_FIELDS = [
  'ai_search',
  'data_blobs',
  'media',
  'ratelimits',
  'secrets_store_secrets',
  'text_blobs',
  'unsafe',
  'wasm_modules',
  'web_search'
];

export class WranglerConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WranglerConfigError';
  }
}

function getBaseName(filename) {
  return String(filename || '')
    .split(/[\\/]/)
    .pop()
    .toLowerCase();
}

function parseSource(filename, source) {
  const format = SUPPORTED_FILENAMES.get(getBaseName(filename));
  if (!format) {
    throw new WranglerConfigError('Choose wrangler.json, wrangler.jsonc, or wrangler.toml.');
  }

  const byteLength = new TextEncoder().encode(source).byteLength;
  if (byteLength > MAX_WRANGLER_CONFIG_BYTES) {
    throw new WranglerConfigError('Wrangler configuration exceeds the 512 KiB safety limit.');
  }

  try {
    if (format === 'toml') {
      return { format, config: parseToml(source) };
    }

    const errors = [];
    const config = parseJsonc(source, errors, {
      allowTrailingComma: true,
      disallowComments: false
    });
    if (errors.length) {
      const first = errors[0];
      throw new WranglerConfigError(
        `Invalid JSONC near character ${first.offset}: ${printParseErrorCode(first.error)}.`
      );
    }
    return { format, config };
  } catch (error) {
    if (error instanceof WranglerConfigError) {
      throw error;
    }
    throw new WranglerConfigError(
      `Could not parse ${getBaseName(filename)}: ${error instanceof Error ? error.message : 'invalid configuration'}`
    );
  }
}

function addBinding(bindings, warnings, name, type, sourceField) {
  if (typeof name !== 'string' || !name.trim()) {
    warnings.push(`${sourceField} contains an entry without a binding name.`);
    return;
  }

  const normalized = { name: name.trim(), type };
  const existing = bindings.find((binding) => binding.name === normalized.name);
  if (existing) {
    if (existing.type !== normalized.type) {
      warnings.push(
        `${normalized.name} is declared as both ${existing.type} and ${normalized.type}; only the first declaration is compared.`
      );
    }
    return;
  }
  bindings.push(normalized);
}

function collectBindings(config, warnings) {
  const bindings = [];

  if (config.vars && typeof config.vars === 'object' && !Array.isArray(config.vars)) {
    for (const [name, value] of Object.entries(config.vars)) {
      addBinding(
        bindings,
        warnings,
        name,
        typeof value === 'string' ? 'plain_text' : 'json',
        'vars'
      );
    }
  }

  for (const [field, nameField, type] of ARRAY_BINDINGS) {
    const entries = config[field];
    if (entries === undefined) {
      continue;
    }
    if (!Array.isArray(entries)) {
      warnings.push(`${field} must be an array to be compared.`);
      continue;
    }
    for (const entry of entries) {
      addBinding(bindings, warnings, entry?.[nameField], type, field);
    }
  }

  const durableBindings = config.durable_objects?.bindings;
  if (durableBindings !== undefined) {
    if (!Array.isArray(durableBindings)) {
      warnings.push('durable_objects.bindings must be an array to be compared.');
    } else {
      for (const entry of durableBindings) {
        addBinding(
          bindings,
          warnings,
          entry?.name,
          'durable_object_namespace',
          'durable_objects.bindings'
        );
      }
    }
  }

  const queueProducers = config.queues?.producers;
  if (queueProducers !== undefined) {
    if (!Array.isArray(queueProducers)) {
      warnings.push('queues.producers must be an array to be compared.');
    } else {
      for (const entry of queueProducers) {
        addBinding(bindings, warnings, entry?.binding, 'queue', 'queues.producers');
      }
    }
  }

  for (const [field, nameField, type] of OBJECT_BINDINGS) {
    const entry = config[field];
    if (entry === undefined) {
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push(`${field} must be an object to be compared.`);
      continue;
    }
    if (entry[nameField] !== undefined) {
      addBinding(bindings, warnings, entry[nameField], type, field);
    }
  }

  for (const field of UNSUPPORTED_BINDING_FIELDS) {
    if (config[field] !== undefined) {
      warnings.push(`${field} bindings are not compared in Config Guard 0.8.0.`);
    }
  }

  return bindings.sort((left, right) =>
    left.name === right.name
      ? left.type.localeCompare(right.type)
      : left.name.localeCompare(right.name)
  );
}

function collectSecrets(config, warnings) {
  if (config.secrets === undefined) {
    return [];
  }
  const required = config.secrets?.required;
  if (!Array.isArray(required)) {
    warnings.push('secrets.required must be an array of names to be compared.');
    return [];
  }

  const secrets = required.filter((name) => typeof name === 'string' && name.trim()).map(String);
  if (secrets.length !== required.length) {
    warnings.push('secrets.required contains one or more invalid names.');
  }
  return [...new Set(secrets)].sort((left, right) => left.localeCompare(right));
}

function collectObservability(config, warnings) {
  if (config.observability === undefined) {
    return {};
  }
  if (!config.observability || typeof config.observability !== 'object') {
    warnings.push('observability must be an object to be compared.');
    return {};
  }

  const values = {};
  const copy = (path, value, expectedType) => {
    if (value === undefined) {
      return;
    }
    if (typeof value !== expectedType) {
      warnings.push(`observability.${path} must be a ${expectedType}.`);
      return;
    }
    values[path] = value;
  };

  const observability = config.observability;
  copy('enabled', observability.enabled, 'boolean');
  copy('head_sampling_rate', observability.head_sampling_rate, 'number');

  for (const section of ['logs', 'traces']) {
    const current = observability[section];
    if (current === undefined) {
      continue;
    }
    if (!current || typeof current !== 'object') {
      warnings.push(`observability.${section} must be an object to be compared.`);
      continue;
    }
    copy(`${section}.enabled`, current.enabled, 'boolean');
    copy(`${section}.head_sampling_rate`, current.head_sampling_rate, 'number');
    copy(`${section}.persist`, current.persist, 'boolean');
    if (section === 'logs') {
      copy('logs.invocation_logs', current.invocation_logs, 'boolean');
    } else {
      copy('traces.propagation_policy', current.propagation_policy, 'string');
    }
  }

  return values;
}

function normalizeEnvironment(rootConfig, environmentName = null) {
  const environmentConfig = environmentName ? rootConfig.env?.[environmentName] || {} : rootConfig;
  const inheritable = environmentName ? { ...rootConfig, ...environmentConfig } : rootConfig;
  const nonInheritable = environmentName ? environmentConfig : rootConfig;
  const warnings = [];
  const baseName = typeof rootConfig.name === 'string' ? rootConfig.name.trim() : '';
  const explicitName =
    typeof environmentConfig.name === 'string' ? environmentConfig.name.trim() : '';
  const scriptName =
    explicitName || (environmentName && baseName ? `${baseName}-${environmentName}` : baseName);

  if (!scriptName) {
    throw new WranglerConfigError('The selected configuration does not declare a Worker name.');
  }

  const compatibilityDate =
    typeof inheritable.compatibility_date === 'string'
      ? inheritable.compatibility_date.trim()
      : null;
  if (!compatibilityDate) {
    warnings.push('compatibility_date is not declared, so it cannot be compared.');
  }

  const rawFlags = inheritable.compatibility_flags;
  let compatibilityFlags = [];
  if (rawFlags !== undefined) {
    if (Array.isArray(rawFlags) && rawFlags.every((flag) => typeof flag === 'string')) {
      compatibilityFlags = [...new Set(rawFlags)].sort((left, right) => left.localeCompare(right));
    } else {
      warnings.push('compatibility_flags must be an array of strings to be compared.');
    }
  }

  return {
    key: environmentName || 'default',
    label: environmentName ? `Environment: ${environmentName}` : 'Default environment',
    scriptName,
    accountId:
      typeof inheritable.account_id === 'string' && inheritable.account_id.trim()
        ? inheritable.account_id.trim()
        : null,
    declared: {
      compatibilityDate,
      compatibilityFlags,
      observability: collectObservability(inheritable, warnings),
      secrets: collectSecrets(nonInheritable, warnings),
      bindings: collectBindings(nonInheritable, warnings)
    },
    warnings
  };
}

export function parseWranglerConfig(filename, source) {
  if (typeof source !== 'string') {
    throw new WranglerConfigError('Wrangler configuration must be text.');
  }

  const { format, config } = parseSource(filename, source);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new WranglerConfigError('Wrangler configuration must contain an object.');
  }

  const namedEnvironments =
    config.env && typeof config.env === 'object' && !Array.isArray(config.env)
      ? Object.keys(config.env).sort((left, right) => left.localeCompare(right))
      : [];

  return {
    filename: getBaseName(filename),
    format,
    environments: [
      normalizeEnvironment(config),
      ...namedEnvironments.map((name) => normalizeEnvironment(config, name))
    ]
  };
}
