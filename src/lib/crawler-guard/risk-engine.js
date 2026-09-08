const POLICY_CHANGE_DATE = new Date('2026-09-15T00:00:00Z');

export const CRAWLER_GROUPS = {
  search: ['Googlebot', 'Bingbot', 'Applebot'],
  aiAgents: ['ChatGPT-User', 'Claude-User', 'PerplexityBot'],
  aiTraining: [
    'GPTBot',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
    'ClaudeBot',
    'meta-externalagent',
    'Bytespider'
  ]
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, pass: 3 };

function parseDirective(line) {
  const separator = line.indexOf(':');
  if (separator === -1) {
    return null;
  }

  return {
    name: line.slice(0, separator).trim().toLowerCase(),
    value: line.slice(separator + 1).trim()
  };
}

function parseContentSignal(value) {
  const signals = {};
  for (const part of value.split(',')) {
    const [rawKey, rawValue] = part.split('=', 2);
    const key = rawKey?.trim().toLowerCase();
    const signalValue = rawValue?.trim().toLowerCase();
    if (key && signalValue) {
      signals[key] = signalValue;
    }
  }
  return signals;
}

export function parseRobotsTxt(body = '') {
  const groups = [];
  const contentSignals = {};
  let current = null;
  let currentHasRules = false;

  for (const rawLine of String(body).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      continue;
    }

    const directive = parseDirective(line);
    if (!directive) {
      continue;
    }

    if (directive.name === 'user-agent') {
      if (!current || currentHasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        currentHasRules = false;
      }
      current.agents.push(directive.value.toLowerCase());
      continue;
    }

    if (directive.name === 'content-signal') {
      Object.assign(contentSignals, parseContentSignal(directive.value));
    }

    if (current) {
      current.rules.push(directive);
      currentHasRules = true;
    }
  }

  return {
    groups,
    contentSignals,
    hasCloudflareManagedMarker: /#\s*BEGIN Cloudflare Managed content/i.test(body)
  };
}

function matchingGroups(groups, userAgent) {
  const normalizedAgent = userAgent.toLowerCase();
  let bestLength = -1;
  const matches = [];

  for (const group of groups) {
    const groupBest = group.agents.reduce((length, token) => {
      if (token === '*') {
        return Math.max(length, 0);
      }
      return normalizedAgent.includes(token) ? Math.max(length, token.length) : length;
    }, -1);

    if (groupBest > bestLength) {
      bestLength = groupBest;
      matches.length = 0;
      matches.push(group);
    } else if (groupBest === bestLength && groupBest >= 0) {
      matches.push(group);
    }
  }

  return bestLength >= 0 ? matches : [];
}

export function evaluateCrawlerAccess(parsed, userAgent, path = '/') {
  const groups = matchingGroups(parsed.groups, userAgent);
  if (!groups.length) {
    return { state: 'allowed', rule: null };
  }

  const candidates = groups
    .flatMap((group) => group.rules)
    .filter((rule) => (rule.name === 'allow' || rule.name === 'disallow') && rule.value)
    .filter((rule) => path.startsWith(rule.value))
    .sort((left, right) => {
      const lengthDifference = right.value.length - left.value.length;
      if (lengthDifference !== 0) {
        return lengthDifference;
      }
      return left.name === 'allow' ? -1 : 1;
    });

  if (!candidates.length) {
    return { state: 'allowed', rule: null };
  }

  return {
    state: candidates[0].name === 'disallow' ? 'blocked' : 'allowed',
    rule: `${candidates[0].name}: ${candidates[0].value}`
  };
}

function summarizeCrawlerGroup(parsed, crawlers, robotsAvailable) {
  if (!robotsAvailable) {
    return {
      state: 'unknown',
      crawlers: crawlers.map((name) => ({ name, state: 'unknown', rule: null }))
    };
  }

  const results = crawlers.map((name) => ({ name, ...evaluateCrawlerAccess(parsed, name) }));
  const blocked = results.filter((result) => result.state === 'blocked').length;

  return {
    state: blocked === 0 ? 'allowed' : blocked === results.length ? 'blocked' : 'partial',
    crawlers: results
  };
}

function addFinding(findings, finding) {
  if (!findings.some((existing) => existing.id === finding.id)) {
    findings.push(finding);
  }
}

function addVisibilityFinding(findings, type, summary) {
  const labels = {
    search: 'Search crawlers',
    aiAgents: 'AI search and user agents',
    aiTraining: 'AI training crawlers'
  };
  const blockedNames = summary.crawlers
    .filter((crawler) => crawler.state === 'blocked')
    .map((crawler) => crawler.name)
    .join(', ');

  if (summary.state === 'blocked' || summary.state === 'partial') {
    addFinding(findings, {
      id: `${type}-robots-block`,
      severity: type === 'search' ? 'critical' : 'warning',
      title: `${labels[type]} are ${summary.state === 'blocked' ? 'blocked' : 'partially blocked'} by robots.txt`,
      detail: `Root crawling is disallowed for ${blockedNames}. robots.txt is advisory and does not itself enforce access.`,
      remediation:
        type === 'search'
          ? 'Edit the origin robots.txt so required search crawler groups can access /. If Cloudflare manages robots.txt, review Security > Settings > Bot traffic before changing the origin file.'
          : 'Review the named user-agent groups in the origin robots.txt and decide whether each crawler should be allowed. If Cloudflare manages robots.txt, make the preference in Security > Settings > Bot traffic.'
    });
  }
}

export function assessCrawlerRisk({ zone, botManagement, robots, now = new Date() }) {
  const robotsAvailable = robots?.status === 'available' && typeof robots.body === 'string';
  const parsed = parseRobotsTxt(robotsAvailable ? robots.body : '');
  const config = botManagement?.status === 'available' ? botManagement.config || {} : null;
  const findings = [];

  const visibility = {
    search: summarizeCrawlerGroup(parsed, CRAWLER_GROUPS.search, robotsAvailable),
    aiAgents: summarizeCrawlerGroup(parsed, CRAWLER_GROUPS.aiAgents, robotsAvailable),
    aiTraining: summarizeCrawlerGroup(parsed, CRAWLER_GROUPS.aiTraining, robotsAvailable)
  };

  addVisibilityFinding(findings, 'search', visibility.search);
  addVisibilityFinding(findings, 'aiAgents', visibility.aiAgents);
  addVisibilityFinding(findings, 'aiTraining', visibility.aiTraining);

  if (!robotsAvailable) {
    const descriptions = {
      missing: 'No robots.txt was found.',
      blocked: 'The robots.txt request was denied.',
      redirected: 'The robots.txt URL redirected and was not followed for safety.',
      too_large: 'The robots.txt response exceeded the 256 KiB safety limit.',
      timeout: 'The robots.txt request timed out.',
      network_error: 'The robots.txt request failed.',
      http_error: 'The robots.txt endpoint returned an error.'
    };
    addFinding(findings, {
      id: 'robots-unavailable',
      severity: robots?.status === 'missing' ? 'warning' : 'critical',
      title: 'Crawler directives could not be verified',
      detail: descriptions[robots?.status] || 'Crawler Guard could not inspect robots.txt.',
      remediation:
        'Serve a plain-text /robots.txt over HTTPS with a 200 response. Check origin routing and Cloudflare WAF rules if the request is blocked or redirected.'
    });
  }

  const signals = parsed.contentSignals;
  const signalChecks = [
    ['search', visibility.search, 'search'],
    ['ai-input', visibility.aiAgents, 'AI input'],
    ['ai-train', visibility.aiTraining, 'AI training']
  ];
  for (const [signal, summary, label] of signalChecks) {
    if (signals[signal] === 'yes' && summary.state !== 'allowed') {
      addFinding(findings, {
        id: `${signal}-signal-conflict`,
        severity: signal === 'search' ? 'critical' : 'warning',
        title: `${label} signal conflicts with crawler directives`,
        detail: `Content-signal declares ${signal}=yes, but one or more representative crawlers are blocked at /.`,
        remediation:
          'Align the Content-signal value and user-agent rules in robots.txt. When Bot Preference Sync is enabled, make the corresponding change in Cloudflare Security > Settings > Bot traffic.'
      });
    }
  }

  const managedRobots = {
    state: config ? (config.is_robots_txt_managed ? 'enabled' : 'disabled') : 'unknown',
    markerPresent: parsed.hasCloudflareManagedMarker,
    preferenceSync: config?.bot_preference_sync_enabled ?? null,
    conflict: false
  };

  if (config?.is_robots_txt_managed && robotsAvailable && !parsed.hasCloudflareManagedMarker) {
    managedRobots.conflict = true;
    addFinding(findings, {
      id: 'managed-robots-marker-missing',
      severity: 'warning',
      title: 'Managed robots.txt is enabled but its public output is not evident',
      detail:
        'Cloudflare reports managed robots.txt enabled, but the fetched file does not contain the Cloudflare managed-content marker.',
      remediation:
        'Open Cloudflare Security > Settings > Bot traffic, confirm the managed robots preference, then purge cache and re-fetch /robots.txt. Check Worker or origin routing that may bypass the managed response.'
    });
  }

  if (
    config?.bot_preference_sync_enabled &&
    !signals.search &&
    !signals['ai-input'] &&
    !signals['ai-train']
  ) {
    managedRobots.conflict = true;
    addFinding(findings, {
      id: 'preference-sync-signals-missing',
      severity: 'warning',
      title: 'Bot Preference Sync is enabled but no Content Signals were found',
      detail: 'The public robots.txt does not expose search, ai-input, or ai-train preferences.',
      remediation:
        'Review Bot Preference Sync and managed robots.txt in Cloudflare Security > Settings > Bot traffic, then confirm the public /robots.txt contains the intended Content-signal directive.'
    });
  }

  if (config?.sbfm_verified_bots === 'block') {
    visibility.search.state = 'blocked';
    addFinding(findings, {
      id: 'verified-bots-blocked',
      severity: 'critical',
      title: 'Verified bots are blocked by Super Bot Fight Mode',
      detail:
        'Cloudflare reports sbfm_verified_bots=block, which can block legitimate search crawlers.',
      remediation:
        'In Cloudflare Security > Settings > Bot traffic, set Verified bots to Allow, or add a narrowly scoped skip rule after reviewing existing WAF policy.'
    });
  }

  const legacyPolicy = config?.ai_bots_protection;
  const policyActive = now >= POLICY_CHANGE_DATE;
  const legacyBlocking = legacyPolicy === 'block' || legacyPolicy === 'only_on_ad_pages';
  const daysUntil = Math.max(
    0,
    Math.ceil((POLICY_CHANGE_DATE.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  );
  const policyChange = {
    effectiveDate: '2026-09-15',
    phase: policyActive ? 'active' : 'upcoming',
    daysUntil,
    state: config ? (legacyBlocking ? 'risk' : 'clear') : 'unknown',
    legacyPolicy: legacyPolicy ?? null
  };

  if (legacyBlocking) {
    if (visibility.search.state === 'allowed') {
      visibility.search.state = 'partial';
    }
    if (legacyPolicy === 'block') {
      visibility.aiTraining.state = 'blocked';
    } else if (legacyPolicy === 'only_on_ad_pages') {
      visibility.aiTraining.state = 'partial';
    }

    addFinding(findings, {
      id: 'mixed-purpose-policy-change',
      severity: 'critical',
      title: policyActive
        ? 'Mixed-purpose crawler blocking is now active'
        : `Mixed-purpose crawler blocking changes in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
      detail:
        'Cloudflare reports the legacy AI-bot blocking setting enabled. From September 15, 2026, Cloudflare says configurations that block AI training also block mixed-purpose Search and Training crawlers.',
      remediation:
        'Before relying on the current behavior, open Cloudflare Security > Settings > Configure AI bot policies. Set Search to Allow if search visibility is required, then choose Agent and Training policies deliberately. Review the legacy Block AI bots control as well.'
    });
  }

  if (botManagement?.status !== 'available') {
    addFinding(findings, {
      id: 'bot-config-unavailable',
      severity: 'warning',
      title: 'Cloudflare enforcement policy is unknown',
      detail: botManagement?.message || 'Bot Management configuration was not available.',
      remediation:
        botManagement?.status === 'permission_required'
          ? 'Create or update the stored API token with Zone:Read, Zone Analytics:Read, and Bot Management:Read, then scan again.'
          : 'Review Security > Settings > Bot traffic in the Cloudflare dashboard for this zone and scan again after confirming API availability.'
    });
  } else if (!legacyBlocking && visibility.aiTraining.state === 'allowed') {
    addFinding(findings, {
      id: 'ai-training-allowed',
      severity: 'info',
      title: 'AI training crawlers are not blocked by the visible controls',
      detail:
        'Representative AI training crawlers are allowed by robots.txt and the legacy AI-bot block is not enabled. This is an exposure state, not automatically an error.',
      remediation:
        'If training access is not intended, set Training in Cloudflare Security > Settings > Configure AI bot policies and publish matching robots.txt or Content Signal preferences.'
    });
  }

  if (
    !findings.some((finding) => finding.severity === 'critical' || finding.severity === 'warning')
  ) {
    addFinding(findings, {
      id: 'no-high-risk-findings',
      severity: 'pass',
      title: 'No high-risk crawler visibility conflict was detected',
      detail: 'The available read-only evidence does not show a critical or warning condition.',
      remediation: 'Re-scan after Cloudflare policy, Worker routing, or robots.txt changes.'
    });
  }

  findings.sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]);

  return {
    zone: {
      id: zone.id,
      name: zone.name,
      account: zone.account,
      plan: zone.plan
    },
    visibility,
    managedRobots,
    policyChange,
    contentSignals: signals,
    findings
  };
}
