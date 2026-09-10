const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/i;
const SCRIPT_NAME_PATTERN = /^[a-z0-9._-]{1,255}$/i;
const BINDING_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ALLOWED_BINDING_TYPES = new Set([
  'ai',
  'analytics_engine',
  'assets',
  'browser',
  'd1',
  'dispatch_namespace',
  'durable_object_namespace',
  'hyperdrive',
  'images',
  'json',
  'kv_namespace',
  'mtls_certificate',
  'pipelines',
  'plain_text',
  'queue',
  'r2_bucket',
  'send_email',
  'service',
  'vectorize',
  'version_metadata',
  'workflow'
]);

const OBSERVABILITY_TYPES = new Map([
  ['enabled', 'boolean'],
  ['head_sampling_rate', 'number'],
  ['logs.enabled', 'boolean'],
  ['logs.head_sampling_rate', 'number'],
  ['logs.invocation_logs', 'boolean'],
  ['logs.persist', 'boolean'],
  ['traces.enabled', 'boolean'],
  ['traces.head_sampling_rate', 'number'],
  ['traces.persist', 'boolean']
]);

export class ConfigGuardRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigGuardRequestError';
  }
}

function allowOnlyKeys(value, allowed, label) {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) {
    throw new ConfigGuardRequestError(`${label} contains unsupported field ${unexpected}.`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigGuardRequestError(`${label} must be an object.`);
  }
  return value;
}

function validateNames(values, label, limit) {
  if (!Array.isArray(values) || values.length > limit) {
    throw new ConfigGuardRequestError(`${label} must be an array with at most ${limit} names.`);
  }
  const names = values.map((value) => {
    if (typeof value !== 'string' || !BINDING_NAME_PATTERN.test(value)) {
      throw new ConfigGuardRequestError(`${label} contains an invalid binding name.`);
    }
    return value;
  });
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

function validateFlags(values) {
  if (!Array.isArray(values) || values.length > 100) {
    throw new ConfigGuardRequestError(
      'declared.compatibilityFlags must contain at most 100 strings.'
    );
  }
  const flags = values.map((value) => {
    if (typeof value !== 'string' || !value || value.length > 128) {
      throw new ConfigGuardRequestError('declared.compatibilityFlags contains an invalid flag.');
    }
    return value;
  });
  return [...new Set(flags)].sort((left, right) => left.localeCompare(right));
}

function validateObservability(value) {
  const observability = requireObject(value, 'declared.observability');
  if (Object.keys(observability).length > OBSERVABILITY_TYPES.size) {
    throw new ConfigGuardRequestError('declared.observability has too many fields.');
  }

  const normalized = {};
  for (const [field, fieldValue] of Object.entries(observability)) {
    const expectedType = OBSERVABILITY_TYPES.get(field);
    if (!expectedType || typeof fieldValue !== expectedType) {
      throw new ConfigGuardRequestError(`declared.observability.${field} is not supported.`);
    }
    if (
      expectedType === 'number' &&
      (!Number.isFinite(fieldValue) || fieldValue < 0 || fieldValue > 1)
    ) {
      throw new ConfigGuardRequestError(`declared.observability.${field} must be between 0 and 1.`);
    }
    if (expectedType === 'string' && fieldValue.length > 64) {
      throw new ConfigGuardRequestError(`declared.observability.${field} is too long.`);
    }
    normalized[field] = fieldValue;
  }
  return normalized;
}

function validateBindings(value) {
  if (!Array.isArray(value) || value.length > 512) {
    throw new ConfigGuardRequestError('declared.bindings must contain at most 512 entries.');
  }

  const names = new Set();
  const bindings = value.map((entry) => {
    requireObject(entry, 'declared binding');
    allowOnlyKeys(entry, new Set(['name', 'type']), 'declared binding');
    if (typeof entry.name !== 'string' || !BINDING_NAME_PATTERN.test(entry.name)) {
      throw new ConfigGuardRequestError('declared.bindings contains an invalid name.');
    }
    if (typeof entry.type !== 'string' || !ALLOWED_BINDING_TYPES.has(entry.type)) {
      throw new ConfigGuardRequestError('declared.bindings contains an unsupported type.');
    }
    if (names.has(entry.name)) {
      throw new ConfigGuardRequestError('declared.bindings contains a duplicate name.');
    }
    names.add(entry.name);
    return { name: entry.name, type: entry.type };
  });

  return bindings.sort((left, right) => left.name.localeCompare(right.name));
}

function validateWarnings(value) {
  if (!Array.isArray(value) || value.length > 50) {
    throw new ConfigGuardRequestError('declarationWarnings must contain at most 50 entries.');
  }
  return value.map((warning) => {
    if (typeof warning !== 'string' || !warning || warning.length > 300) {
      throw new ConfigGuardRequestError('declarationWarnings contains an invalid entry.');
    }
    return warning;
  });
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateConfigGuardRequest(payload) {
  requireObject(payload, 'Request body');
  allowOnlyKeys(
    payload,
    new Set(['accountId', 'scriptName', 'declared', 'declarationWarnings']),
    'Request body'
  );
  const declared = requireObject(payload.declared, 'declared');
  allowOnlyKeys(
    declared,
    new Set(['compatibilityDate', 'compatibilityFlags', 'observability', 'secrets', 'bindings']),
    'declared'
  );

  if (typeof payload.accountId !== 'string' || !ACCOUNT_ID_PATTERN.test(payload.accountId)) {
    throw new ConfigGuardRequestError('accountId must be a 32-character hex string.');
  }
  if (typeof payload.scriptName !== 'string' || !SCRIPT_NAME_PATTERN.test(payload.scriptName)) {
    throw new ConfigGuardRequestError('scriptName contains unsupported characters or length.');
  }

  let compatibilityDate = null;
  if (declared.compatibilityDate !== null && declared.compatibilityDate !== undefined) {
    if (!isValidDate(declared.compatibilityDate)) {
      throw new ConfigGuardRequestError('declared.compatibilityDate must use YYYY-MM-DD.');
    }
    compatibilityDate = declared.compatibilityDate;
  }

  return {
    accountId: payload.accountId,
    scriptName: payload.scriptName,
    declared: {
      compatibilityDate,
      compatibilityFlags: validateFlags(declared.compatibilityFlags),
      observability: validateObservability(declared.observability),
      secrets: validateNames(declared.secrets, 'declared.secrets', 256),
      bindings: validateBindings(declared.bindings)
    },
    declarationWarnings: validateWarnings(payload.declarationWarnings || [])
  };
}
