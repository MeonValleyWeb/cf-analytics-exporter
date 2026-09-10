const STATUS_RANK = { PASS: 0, WARNING: 1, DRIFT: 2 };

function safeValue(value) {
  if (value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (['string', 'number', 'boolean'].includes(typeof value) || value === null) {
    return value;
  }
  return String(value);
}

function difference({
  id,
  category,
  kind,
  status = 'DRIFT',
  field,
  name = null,
  declared,
  deployed,
  detail,
  remediation
}) {
  return {
    id,
    category,
    kind,
    status,
    field,
    name,
    declared: safeValue(declared),
    deployed: safeValue(deployed),
    detail,
    remediation
  };
}

function compareSecrets(declared, evidence, differences) {
  if (evidence.status !== 'available') {
    differences.push(
      difference({
        id: 'secrets-evidence-unavailable',
        category: 'secrets',
        kind: 'evidence_unavailable',
        status: 'WARNING',
        field: 'secrets',
        declared: `${declared.length} required`,
        deployed: 'Unknown',
        detail: evidence.message || 'Deployed secret names could not be read.',
        remediation: 'Grant Workers Scripts Read to the stored token, then run the check again.'
      })
    );
    return;
  }

  const remote = new Set((evidence.secrets || []).map((secret) => secret.name));
  const expected = new Set(declared);

  for (const name of [...expected].sort()) {
    if (!remote.has(name)) {
      differences.push(
        difference({
          id: `secret-missing:${name}`,
          category: 'secrets',
          kind: 'missing',
          field: 'secrets.required',
          name,
          declared: 'Required',
          deployed: 'Missing',
          detail: `Required secret ${name} is not bound to the deployed Worker.`,
          remediation: `Set ${name} with Wrangler's secret command for this Worker and environment, then redeploy or recheck.`
        })
      );
    }
  }

  for (const name of [...remote].sort()) {
    if (!expected.has(name)) {
      differences.push(
        difference({
          id: `secret-unexpected:${name}`,
          category: 'secrets',
          kind: 'unexpected',
          field: 'secrets.required',
          name,
          declared: 'Not declared',
          deployed: 'Present',
          detail: `Remote secret ${name} is not listed in secrets.required.`,
          remediation: `Confirm ${name} is obsolete, then delete it manually with Wrangler or add its required name to the selected configuration.`
        })
      );
    }
  }
}

function compareBindings(declared, evidence, differences) {
  if (evidence.status !== 'available') {
    differences.push(
      difference({
        id: 'settings-evidence-unavailable',
        category: 'runtime',
        kind: 'evidence_unavailable',
        status: 'WARNING',
        field: 'settings',
        declared: 'Available',
        deployed: 'Unknown',
        detail: evidence.message || 'Deployed Worker settings could not be read.',
        remediation:
          'Grant Workers Scripts Read to the stored token and confirm the Worker name, then run the check again.'
      })
    );
    return;
  }

  const expected = new Map(
    (declared.bindings || []).map((binding) => [binding.name, binding.type])
  );
  const remote = new Map(
    (evidence.settings.bindings || []).map((binding) => [binding.name, binding.type])
  );

  for (const [name, type] of [...expected].sort(([left], [right]) => left.localeCompare(right))) {
    if (!remote.has(name)) {
      differences.push(
        difference({
          id: `binding-missing:${name}`,
          category: 'bindings',
          kind: 'missing',
          field: 'bindings',
          name,
          declared: type,
          deployed: 'Missing',
          detail: `Declared ${type} binding ${name} is missing from the deployed Worker.`,
          remediation: `Deploy the selected Wrangler configuration or add ${name} in the Worker binding settings.`
        })
      );
    } else if (remote.get(name) !== type) {
      differences.push(
        difference({
          id: `binding-type:${name}`,
          category: 'bindings',
          kind: 'mismatch',
          field: 'bindings',
          name,
          declared: type,
          deployed: remote.get(name),
          detail: `Binding ${name} has a different deployed type.`,
          remediation: `Update ${name} to the intended ${type} binding and deploy the selected configuration.`
        })
      );
    }
  }

  for (const [name, type] of [...remote].sort(([left], [right]) => left.localeCompare(right))) {
    if (!expected.has(name)) {
      differences.push(
        difference({
          id: `binding-unexpected:${name}`,
          category: 'bindings',
          kind: 'unexpected',
          field: 'bindings',
          name,
          declared: 'Not declared',
          deployed: type,
          detail: `Deployed ${type} binding ${name} is not present in the selected configuration.`,
          remediation: `Confirm whether ${name} is framework-generated; otherwise remove it manually or add it to the source configuration.`
        })
      );
    }
  }

  if (declared.compatibilityDate) {
    const deployedDate = evidence.settings.compatibilityDate;
    if (deployedDate !== declared.compatibilityDate) {
      differences.push(
        difference({
          id: 'compatibility-date',
          category: 'runtime',
          kind: 'mismatch',
          field: 'compatibility_date',
          declared: declared.compatibilityDate,
          deployed: deployedDate || 'Missing',
          detail: 'The deployed compatibility date does not match the selected configuration.',
          remediation:
            'Deploy the intended compatibility_date, or update the source only after confirming the deployed runtime target is intentional.'
        })
      );
    }
  }

  const declaredFlags = [...(declared.compatibilityFlags || [])].sort();
  const deployedFlags = [...(evidence.settings.compatibilityFlags || [])].sort();
  if (JSON.stringify(declaredFlags) !== JSON.stringify(deployedFlags)) {
    differences.push(
      difference({
        id: 'compatibility-flags',
        category: 'runtime',
        kind: 'mismatch',
        field: 'compatibility_flags',
        declared: declaredFlags,
        deployed: deployedFlags,
        detail: 'The deployed compatibility flags do not match the selected configuration.',
        remediation:
          'Review runtime compatibility implications, then deploy the intended compatibility_flags list.'
      })
    );
  }

  for (const [field, declaredValue] of Object.entries(declared.observability || {}).sort()) {
    if (!(field in (evidence.settings.observability || {}))) {
      differences.push(
        difference({
          id: `observability-unavailable:${field}`,
          category: 'observability',
          kind: 'evidence_unavailable',
          status: 'WARNING',
          field: `observability.${field}`,
          declared: declaredValue,
          deployed: 'Not returned',
          detail: `Cloudflare did not return observability.${field}, so it cannot be compared.`,
          remediation:
            'Review this value in Worker observability settings and rerun after the API exposes it.'
        })
      );
    } else if (evidence.settings.observability[field] !== declaredValue) {
      differences.push(
        difference({
          id: `observability-mismatch:${field}`,
          category: 'observability',
          kind: 'mismatch',
          field: `observability.${field}`,
          declared: declaredValue,
          deployed: evidence.settings.observability[field],
          detail: `The deployed observability.${field} value differs from the selected configuration.`,
          remediation: `Deploy the intended observability.${field} value or update the source after confirming the dashboard change is intentional.`
        })
      );
    }
  }
}

export function assessConfigDrift({ declared, deployed, declarationWarnings = [] }) {
  const differences = declarationWarnings.map((message, index) =>
    difference({
      id: `declaration-warning:${index + 1}`,
      category: 'configuration',
      kind: 'unsupported',
      status: 'WARNING',
      field: 'wrangler',
      declared: 'Present',
      deployed: 'Not compared',
      detail: message,
      remediation: 'Review this declaration manually or use a supported Config Guard field.'
    })
  );

  compareSecrets(declared.secrets || [], deployed.secrets, differences);
  compareBindings(declared, deployed.settings, differences);

  differences.sort((left, right) => {
    const rank = STATUS_RANK[right.status] - STATUS_RANK[left.status];
    return rank || left.category.localeCompare(right.category) || left.id.localeCompare(right.id);
  });

  const status = differences.reduce(
    (current, item) => (STATUS_RANK[item.status] > STATUS_RANK[current] ? item.status : current),
    'PASS'
  );

  return {
    status,
    summary: {
      drift: differences.filter((item) => item.status === 'DRIFT').length,
      warnings: differences.filter((item) => item.status === 'WARNING').length,
      passed: status === 'PASS'
    },
    differences
  };
}
