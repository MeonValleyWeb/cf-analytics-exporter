import { env } from 'cloudflare:workers';
import { handleBilling } from '../../lib/billing.js';

export function ALL({ request }) {
  return handleBilling(request, env);
}
