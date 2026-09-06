import { env } from 'cloudflare:workers';
import { handleCapabilities } from '../../lib/exporter.js';

export function ALL({ request }) {
  return handleCapabilities(request, env);
}
