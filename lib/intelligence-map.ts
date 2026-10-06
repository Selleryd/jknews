import type { IntelligenceEdition } from './intelligence-core';
import { publicIntelligenceUrl } from './intelligence-core';
import { WORLD_LAND_PATH } from './world-map';

function escapeXml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
}
function point(lon: number, lat: number) { return { x: (lon + 180) * 1200 / 360, y: (90 - lat) * 600 / 180 }; }

/** A self-contained, public-source map export, suitable for a newsletter attachment. */
export function renderIntelligenceMap(edition: IntelligenceEdition | null | undefined): string {
  const locations = edition?.conflicts.locations || [];
  const edges = edition?.conflicts.edges || [];
  const points = new Map(locations.map(location => [location.id, point(location.lon, location.lat)]));
  const stamp = edition?.brief.refreshedAt && Number.isFinite(Date.parse(edition.brief.refreshedAt))
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(edition.brief.refreshedAt))
    : 'Awaiting the first source-backed edition';
  const drawnEdges = edges.map(edge => {
    const a = points.get(edge.source), b = points.get(edge.target);
    return a && b ? `<path d="M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}" fill="none" stroke="#cfb797" stroke-width="1" opacity=".4"><title>${escapeXml(edge.relationship)} — ${edge.storyCount} reports</title></path>` : '';
  }).join('');
  const drawnNodes = locations.map(location => {
    const p = points.get(location.id)!;
    const radius = Math.max(4, Math.min(8, 3 + Math.sqrt(location.storyCount)));
    const evidenceUrl = publicIntelligenceUrl(location.evidence[0]?.url);
    const node = `<g transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})"><title>${escapeXml(location.name)} — reporting location, ${location.storyCount} reports</title><circle r="${radius + 5}" fill="none" stroke="#d5ba91" opacity=".4" stroke-width=".8"/><circle r="${radius}" fill="#ddc9a8"/>${locations.length <= 12 ? `<text x="13" y="-12" fill="#e8e2d8" font-size="11" stroke="#192a3e" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${escapeXml(location.name)}</text>` : ''}</g>`;
    return evidenceUrl ? `<a href="${escapeXml(evidenceUrl)}" target="_blank">${node}</a>` : node;
  }).join('');
  const empty = locations.length ? '' : '<g transform="translate(600 280)" text-anchor="middle"><rect x="-230" y="-56" width="460" height="146" fill="#1e3146" opacity=".95" stroke="#7891b8" stroke-opacity=".25"/><text y="-5" fill="#e9e5df" font-family="Georgia,serif" font-size="29">The world, in focus.</text><text y="28" fill="#aebed3" font-size="12">Awaiting source-backed conflict reporting</text><text y="55" fill="#aebed3" font-size="10">Every map point requires a named place in an approved report.</text></g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1030" viewBox="0 0 1600 1030" role="img" aria-labelledby="map-title map-description"><title id="map-title">Jew Knows — A web of intelligence</title><desc id="map-description">Source-reported places and co-mentions in the last 24 hours. Geography identifies places mentioned in reporting, not exact incident locations or frontlines. ${escapeXml(stamp)}.</desc><defs><linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#14283a"/><stop offset=".6" stop-color="#20273b"/><stop offset="1" stop-color="#30263e"/></linearGradient><linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6f8793" stop-opacity=".3"/><stop offset="1" stop-color="#8b7896" stop-opacity=".24"/></linearGradient><pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#a1b6d0" stroke-opacity=".1" stroke-width=".75"/></pattern></defs><rect width="1600" height="1030" fill="url(#background)"/><g font-family="Arial,Helvetica,sans-serif"><text x="92" y="71" fill="#ccb799" font-size="13" letter-spacing="4">JEW KNOWS / OPEN SOURCE INTELLIGENCE</text><text x="90" y="131" fill="#e7eaf1" font-family="Georgia,serif" font-size="51" letter-spacing="-1.3">A web of intelligence.</text><text x="92" y="166" fill="#9fadbf" font-size="14">${escapeXml(stamp)} · Last 24 hours · Source-reported</text><text x="1505" y="165" fill="#c3b299" text-anchor="end" font-size="13">${locations.length} places / ${edges.length} source connections / ${edition?.conflicts.stories.length || 0} reports</text><g transform="translate(92 205) scale(1.18)"><rect width="1200" height="600" fill="#112032" stroke="#7d91ad" stroke-opacity=".3"/><rect width="1200" height="600" fill="url(#grid)"/><path d="${WORLD_LAND_PATH}" fill="url(#land)" stroke="#7189a0" stroke-opacity=".4" stroke-width=".65"/>${drawnEdges}${drawnNodes}${empty}</g><circle cx="98" cy="949" r="4" fill="#ddc9a8"/><text x="112" y="953" fill="#c5d0de" font-size="11">Reporting location</text><path d="M265 949H285" stroke="#cfb797" opacity=".7"/><text x="296" y="953" fill="#c5d0de" font-size="11">Co-mentioned in the same report</text><text x="92" y="986" fill="#95a8c2" font-size="11">The web shows reporting relationships. Source evidence accompanies the live edition. Made with Natural Earth.</text><text x="1505" y="986" fill="#c8b595" text-anchor="end" font-size="11">OSINT, News, and Important World Announcements.</text></g></svg>`;
}
