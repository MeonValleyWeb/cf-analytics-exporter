import { env } from 'cloudflare:workers';
import { handleExport } from '../../lib/exporter.js';

export function ALL({ request }) {
  return handleExport(request, env);
}
