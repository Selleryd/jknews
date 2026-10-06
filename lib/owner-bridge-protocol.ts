export const BRIDGE_PROTOCOL = 'jew-knows-owner-v1';
export const MAX_REQUEST_BYTES = 512000;
export const MAX_RESPONSE_BYTES = 2000000;
export const SESSION_MS = 2 * 60 * 60 * 1000;
export function loopbackOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(value)) return null;
  try { const u = new URL(value); return Number(u.port) >= 1024 && Number(u.port) <= 65535 && u.origin === value ? value : null; } catch { return null; }
}
export function validNonce(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function allowedRequest(path: unknown, method: unknown, body?: unknown): boolean {
  if (typeof path !== 'string' || !['GET','POST'].includes(String(method))) return false;
  const get = ['/api/admin','/api/admin/brain','/api/admin/deals','/api/admin/streaming','/api/admin/rewards','/api/admin/videos','/api/admin/distribution','/api/admin/export'];
  const post = ['sources','test-source','ads','headlines','headline','comments','refresh','brain','forecast-resolution','deals','deals-preview','streaming','rewards','videos','distribution','distribution/client','distribution/resolve','distribution/disconnect'].map(p => '/api/admin/' + p);
  if (method === 'GET') return body === undefined && (get.includes(path) || /^\/api\/admin\/distribution\/export\?format=(html|txt|svg)$/.test(path));
  if (!post.includes(path) || typeof body !== 'string' || new TextEncoder().encode(body).length > MAX_REQUEST_BYTES) return false;
  try { const value = JSON.parse(body); return !!value && typeof value === 'object' && !Array.isArray(value); } catch { return false; }
}
