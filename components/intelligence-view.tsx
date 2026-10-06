'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, ChevronDown, ChevronRight, Compass, Download, FileText, Focus, Globe2, MapPin, Maximize2, Minus, Network, Plus, Radio, RotateCcw, Search, X } from 'lucide-react';
import type { IntelligenceEdition, IntelligenceEvidence, IntelligenceLocation } from '@/lib/intelligence-core';
import { WORLD_LAND_PATH } from '@/lib/world-map';
import { renderIntelligenceMap } from '@/lib/intelligence-map';

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 600;


function formatStamp(value?: string, compact = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Awaiting first update';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', ...(compact ? {} : { timeZoneName: 'short' as const }),
  }).format(new Date(value));
}

export function OsintBrief({ edition, loading = false }: { edition?: IntelligenceEdition | null; loading?: boolean }) {
  const brief = edition?.brief;
  const waiting = !edition || edition.status === 'waiting';
  const [expandedSources, setExpandedSources] = useState(false);
  const publishers = [...new Set(brief?.items.map(item => item.publisher) || [])];
  const notes = expandedSources ? brief?.items || [] : brief?.items.slice(0, 6) || [];
  const summary = !brief || waiting && !brief.items.length && !(edition?.coverage.approvedSourceCount)
    ? 'A clearer picture starts with the sources. Your first intelligence brief will appear as reporting arrives, with original links attached.'
    : brief.summary;
  return <section className={`osint-brief${waiting ? ' osint-brief-waiting' : ''}`} aria-label="Daily OSINT briefing" aria-busy={loading}>
    <div className="osint-brief-side">
      <span className="intel-kicker"><Radio size={13} aria-hidden="true" /> OSINT / Daily brief</span>
      <h2>The intelligence brief<span>.</span></h2>
      <p>One perspective. Original sources.</p>
      <span className="intel-cadence"><span className="intel-cadence-mark" aria-hidden="true" />Every two hours</span>
    </div>
    <div className="osint-brief-content">
      <div className="intel-brief-meta">
        <span className="intel-status"><i aria-hidden="true" />{loading ? 'Checking the latest edition' : waiting ? 'Waiting for new reporting' : 'Source-reported'}</span>
        <span className="intel-updated-label"><span>{brief ? 'Updated' : 'First edition'}</span><time dateTime={brief?.refreshedAt}>{formatStamp(brief?.refreshedAt)}</time></span>
      </div>
      <p className="intel-brief-summary">{summary}</p>
      <div className="intel-brief-bottom">
        <div className="intel-coverage">{!!publishers.length && <span className="intel-publisher-marks" aria-label={`Reporting from ${publishers.slice(0, 4).join(', ')}`}>{publishers.slice(0, 4).map(name => <span key={name} title={name} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>)}</span>}<span><strong>{brief?.sourceCount || 0}</strong><span>Sources represented</span></span><span><strong>{edition?.coverage.eligibleArticleCount || 0}</strong><span>Reports in 24 hours</span></span></div>
        {brief && <span className="intel-next">Next edition {formatStamp(brief.nextRefreshAt, true)}</span>}
      </div>
      {!!brief?.items.length && <details className="intel-source-details">
        <summary><span><FileText size={14} aria-hidden="true" />Source notes <small>{brief.items.length}</small></span><ChevronDown size={14} aria-hidden="true" /></summary>
        <div className="intel-source-grid">{notes.map(item => <a key={item.id} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="intel-source-note">
          <span>{item.publisher}<ArrowUpRight size={13} aria-hidden="true" /></span><strong>{item.title}</strong><p>{item.excerpt}</p><small>{item.author} · {formatStamp(item.publishedAt)}</small>
        </a>)}</div>
        {!expandedSources && brief.items.length > 6 && <button type="button" className="intel-show-sources" onClick={() => setExpandedSources(true)}>Show all {brief.items.length} source notes <ChevronDown size={14} aria-hidden="true" /></button>}
      </details>}
      {edition?.coverage.limitations.length ? <details className="intel-coverage-details"><summary>How this brief is put together <ChevronDown size={12} aria-hidden="true" /></summary><ul>{edition.coverage.limitations.map(note => <li key={note}>{note}</li>)}</ul></details> : null}
    </div>
  </section>;
}

function project(location: IntelligenceLocation) {
  return { x: (location.lon + 180) * MAP_WIDTH / 360, y: (90 - location.lat) * MAP_HEIGHT / 180 };
}
function bound(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
function EvidenceList({ evidence }: { evidence: IntelligenceEvidence[] }) {
  return <ol className="intel-evidence-list">{evidence.map((item, index) => <li key={`${item.storyId}-${index}`}>
    <a href={item.url} target="_blank" rel="noopener noreferrer"><span>{item.publisher}<ArrowUpRight size={13} aria-hidden="true" /></span><strong>{item.title}</strong><time dateTime={item.publishedAt}>{formatStamp(item.publishedAt)}</time></a>
  </li>)}</ol>;
}

export function ApocalypseView({ edition, loading = false }: { edition?: IntelligenceEdition | null; loading?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const [view, setView] = useState<'map' | 'web'>('map');
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedStories, setExpandedStories] = useState(false);
  const [exportingMap, setExportingMap] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mobilePanel, setMobilePanel] = useState<'map' | 'evidence'>('map');
  const [evidenceTab, setEvidenceTab] = useState<'sources' | 'places'>('sources');
  const [placeSearch, setPlaceSearch] = useState('');
  const evidencePanel = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const locations = edition?.conflicts.locations || [];
  const edges = edition?.conflicts.edges || [];
  const stories = edition?.conflicts.stories || [];
  const selected = locations.find(location => location.id === selectedLocation);
  const edge = edges.find(connection => connection.id === selectedEdge);
  const points = useMemo(() => new Map(locations.map((location, index) => {
    if (view === 'map') return [location.id, project(location)] as const;
    const angle = (index / Math.max(locations.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = locations.length > 16 && index % 2 === 1 ? 160 : 230;
    return [location.id, { x: 600 + Math.cos(angle) * radius * 1.65, y: 300 + Math.sin(angle) * radius }] as const;
  })), [locations, view]);
  const evidence = selected?.evidence || edge?.evidence || [];
  const visibleStoryIds = selected || edge ? new Set(evidence.map(item => item.storyId)) : null;
  const relevantStories = visibleStoryIds ? stories.filter(story => visibleStoryIds.has(story.id)) : stories;
  const shownStories = expandedStories ? relevantStories : relevantStories.slice(0, 12);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const searchedLocations = locations.filter(location => location.name.toLowerCase().includes(placeSearch.trim().toLowerCase()));
  const selectedNames = edge ? [locations.find(location => location.id === edge.source)?.name, locations.find(location => location.id === edge.target)?.name].filter(Boolean).join(' / ') : null;

  function openEvidence() {
    setEvidenceTab('sources'); setMobilePanel('evidence');
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 740px)').matches) {
      window.requestAnimationFrame(() => document.getElementById(`${uid}-sources-tab`)?.focus());
    }
  }
  function selectLocation(id: string | null) { setSelectedLocation(id); setSelectedEdge(null); setExpandedStories(false); if (id) openEvidence(); }
  function selectEdge(id: string) { setSelectedEdge(id); setSelectedLocation(null); setExpandedStories(false); openEvidence(); }
  function evidenceTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'sources' : event.key === 'End' ? 'places' : evidenceTab === 'sources' ? 'places' : 'sources';
    setEvidenceTab(next);
    document.getElementById(`${uid}-${next}-tab`)?.focus();
  }
  function changeView(next: 'map' | 'web') { setView(next); setViewport({ scale: 1, x: 0, y: 0 }); }
  function zoom(direction: number) {
    setViewport(old => {
      const scale = bound(old.scale + direction * .35, 1, 4);
      const ratio = scale / old.scale;
      return { scale, x: bound(old.x * ratio + (MAP_WIDTH / 2) * (1 - ratio), MAP_WIDTH * (1 - scale), 0), y: bound(old.y * ratio + (MAP_HEIGHT / 2) * (1 - ratio), MAP_HEIGHT * (1 - scale), 0) };
    });
  }
  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || viewport.scale === 1 || (event.target instanceof Element && event.target.closest('[data-intel-interactive]'))) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y };
  }
  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    if (!width) return;
    const factor = MAP_WIDTH / width;
    setViewport(old => ({ ...old, x: bound(current.originX + (event.clientX - current.x) * factor, MAP_WIDTH * (1 - old.scale), 0), y: bound(current.originY + (event.clientY - current.y) * factor, MAP_HEIGHT * (1 - old.scale), 0) }));
  }
  function keyPan(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = 45;
    setViewport(old => ({ ...old, x: bound(old.x + (event.key === 'ArrowRight' ? -delta : event.key === 'ArrowLeft' ? delta : 0), MAP_WIDTH * (1 - old.scale), 0), y: bound(old.y + (event.key === 'ArrowDown' ? -delta : event.key === 'ArrowUp' ? delta : 0), MAP_HEIGHT * (1 - old.scale), 0) }));
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false); }
      else if (frame.current?.requestFullscreen) { await frame.current.requestFullscreen(); setFullscreen(true); }
    } catch { /* Fullscreen is optional; the full map remains available inline. */ }
  }
  async function downloadMap() {
    setExportingMap(true); setMapError('');
    let svgUrl = '', pngUrl = '';
    try {
      svgUrl = URL.createObjectURL(new Blob([renderIntelligenceMap(edition)], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not render the map image.')); image.src = svgUrl; });
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1030;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not create the map image.');
      context.drawImage(image, 0, 0);
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Your browser could not save the map image.')), 'image/png'));
      pngUrl = URL.createObjectURL(png);
      const link = document.createElement('a'); link.href = pngUrl; link.download = `jew-knows-intelligence-map-${edition?.brief.localDate || 'edition'}.png`; link.click();
    } catch (error) { setMapError(error instanceof Error ? error.message : 'The map image could not be downloaded.'); }
    finally { if (svgUrl) URL.revokeObjectURL(svgUrl); if (pngUrl) URL.revokeObjectURL(pngUrl); setExportingMap(false); }
  }
  function focusLocation(location: IntelligenceLocation) {
    const point = points.get(location.id);
    if (!point) return;
    selectLocation(location.id);
    setMobilePanel('map');
    const scale = 2.3;
    setViewport({ scale, x: bound(MAP_WIDTH / 2 - point.x * scale, MAP_WIDTH * (1 - scale), 0), y: bound(MAP_HEIGHT / 2 - point.y * scale, MAP_HEIGHT * (1 - scale), 0) });
  }

  return <section className="apocalypse-view" aria-label="Apocalypse mode: global conflict reporting" aria-busy={loading}>
    <div className="apocalypse-heading">
      <div><span className="intel-kicker"><Compass size={14} aria-hidden="true" /> Apocalypse / Conflict reporting</span><h1>A web of intelligence<span>.</span></h1><p>Follow conflict reporting across the world. Explore the places and connections in the sources.</p></div>
      <div className="apocalypse-edition"><span><span className="intel-edition-mark" aria-hidden="true" />24-hour reporting window</span><time dateTime={edition?.brief.refreshedAt}>{formatStamp(edition?.brief.refreshedAt)}</time></div>
    </div>
    <div className="intel-map-shell" ref={frame} data-mobile-panel={mobilePanel}>
      <div className="intel-map-toolbar">
        <div className="intel-view-switch" role="group" aria-label="Intelligence view"><button type="button" className={view === 'map' ? 'active' : ''} aria-pressed={view === 'map'} onClick={() => changeView('map')}><Globe2 size={15} aria-hidden="true" /> Map</button><button type="button" className={view === 'web' ? 'active' : ''} aria-pressed={view === 'web'} onClick={() => changeView('web')}><Network size={15} aria-hidden="true" /> Web</button></div>
        <div className="intel-map-count" aria-label={`${locations.length} reporting places, ${edges.length} source connections, ${stories.length} reports`}><span><strong>{locations.length}</strong> places</span><span><strong>{edges.length}</strong> connections</span><span><strong>{stories.length}</strong> reports</span></div>
        <button className="intel-map-export" type="button" onClick={downloadMap} disabled={exportingMap || loading}><Download size={14} aria-hidden="true" />{exportingMap ? 'Saving…' : 'Save map'}</button>
        <button className="intel-map-icon" type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen intelligence map' : 'View intelligence map in fullscreen'}><Maximize2 size={17} aria-hidden="true" /></button>
      </div>
      <div className="intel-mobile-panels" role="group" aria-label="Map workspace panel"><button type="button" aria-pressed={mobilePanel === 'map'} onClick={() => setMobilePanel('map')}><Globe2 size={14} aria-hidden="true" />Map</button><button type="button" aria-pressed={mobilePanel === 'evidence'} onClick={() => setMobilePanel('evidence')}><FileText size={14} aria-hidden="true" />Evidence{(selected || edge) && <span className="intel-selection-dot" aria-hidden="true" />}</button></div>
      {mapError && <p className="intel-map-error" role="alert">{mapError}</p>}
      <div className="intel-map-body">
        <div className="intel-map-stage" tabIndex={0} role="region" aria-label="Interactive intelligence map. Use zoom controls then drag or arrow keys to pan." onKeyDown={keyPan}>
          <svg className={`intel-world-map${viewport.scale > 1 ? ' is-zoomed' : ''}${selected || edge ? ' has-selection' : ''}`} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-labelledby={`${uid}-title ${uid}-desc`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            <title id={`${uid}-title`}>{view === 'map' ? 'World map of places mentioned in conflict reporting' : 'Network of places co-mentioned in conflict reporting'}</title>
            <desc id={`${uid}-desc`}>Select a place or connection to read the source articles. Locations mark reference places mentioned by publishers. Connections mean two places appeared in the same report.</desc>
            <defs><linearGradient id={`${uid}-land`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#9daabd" stopOpacity=".4" /><stop offset="100%" stopColor="#788da6" stopOpacity=".2" /></linearGradient><radialGradient id={`${uid}-ocean`}><stop offset="0%" stopColor="#243342" /><stop offset="100%" stopColor="#111a27" /></radialGradient><filter id={`${uid}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" /></filter><pattern id={`${uid}-grid`} width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" fill="none" stroke="#8298b0" strokeOpacity=".08" strokeWidth=".8" /></pattern></defs>
            <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${uid}-ocean)`} />
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
              <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${uid}-grid)`} />
              {view === 'map' ? <path d={WORLD_LAND_PATH} fill={`url(#${uid}-land)`} stroke="#74889c" strokeOpacity=".3" strokeWidth=".65" vectorEffect="non-scaling-stroke" /> : <g fill="none" stroke="#9ba5bb" strokeOpacity=".09"><ellipse cx="600" cy="300" rx="379" ry="230" /><ellipse cx="600" cy="300" rx="264" ry="160" /><path d="M160 300H1040M600 50V550" /><text x="600" y="292" textAnchor="middle" className="intel-web-center">SOURCE</text><text x="600" y="315" textAnchor="middle" className="intel-web-center">CONNECTIONS</text></g>}
              {edges.map(connection => {
                const a = points.get(connection.source), b = points.get(connection.target);
                if (!a || !b) return null;
                const active = selectedEdge === connection.id || selectedLocation === connection.source || selectedLocation === connection.target;
                // A straight evidence line connects the same two source-mentioned places; it implies no movement.
                return <g key={connection.id} data-intel-interactive="true" className={`intel-map-edge${active ? ' selected' : ''}`} role="button" tabIndex={0} aria-label={`${locations.find(location => location.id === connection.source)?.name} and ${locations.find(location => location.id === connection.target)?.name}: ${connection.storyCount} reports co-mention these places. View source evidence.`} onClick={() => selectEdge(connection.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectEdge(connection.id); } }}>
                  <path d={`M${a.x},${a.y}L${b.x},${b.y}`} className="intel-edge-hit" vectorEffect="non-scaling-stroke" /><path d={`M${a.x},${a.y}L${b.x},${b.y}`} className="intel-edge-line" vectorEffect="non-scaling-stroke" />
                </g>;
              })}
              {locations.map(location => {
                const point = points.get(location.id)!;
                const active = location.id === selectedLocation;
                const size = bound(3 + Math.sqrt(location.storyCount), 4, 8);
                return <g key={location.id} transform={`translate(${point.x} ${point.y})`} data-intel-interactive="true" className={`intel-map-node${active ? ' selected' : ''}`} role="button" tabIndex={0} aria-label={`${location.name}, reporting location, ${location.storyCount} ${location.storyCount === 1 ? 'report' : 'reports'}. View original source evidence.`} onClick={() => selectLocation(location.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLocation(location.id); } }}>
                  <circle r="17" fill="transparent" /><circle r={size + 3} fill="#edc69b" opacity={active ? '.55' : '.2'} filter={`url(#${uid}-glow)`} /><circle r={size + 5} className="intel-node-ring" /><circle r={size} className="intel-node-core" />
                  {(active || view === 'web' || locations.length <= 6) && <text x="12" y="-12" className="intel-node-label" paintOrder="stroke" stroke="#152335" strokeWidth="4" strokeLinejoin="round">{location.name}</text>}
                </g>;
              })}
            </g>
          </svg>
          {!locations.length && <div className="intel-map-empty"><span className="intel-map-empty-icon"><Globe2 size={29} strokeWidth={1} aria-hidden="true" /></span><h2>{loading ? 'Updating the picture' : 'A clearer world view.'}</h2><p>{stories.length ? 'Reports are available below. No supported place names were found to plot on the map.' : 'Places and connections appear here as new conflict reporting arrives.'}</p><span>{stories.length ? 'Every map point requires a named place in a report.' : 'Awaiting source-backed reporting'}</span></div>}
          <div className="intel-map-controls" role="group" aria-label="Map controls"><button type="button" onClick={() => zoom(1)} disabled={viewport.scale >= 4} aria-label="Zoom in"><Plus size={17} aria-hidden="true" /></button><button type="button" onClick={() => zoom(-1)} disabled={viewport.scale <= 1} aria-label="Zoom out"><Minus size={17} aria-hidden="true" /></button><button type="button" onClick={() => setViewport({ scale: 1, x: 0, y: 0 })} aria-label="Reset map view"><RotateCcw size={15} aria-hidden="true" /></button></div>
          <div className="intel-map-legend"><span><i />Reporting location</span><span><b />Source co-mention</span></div>
          {view === 'map' && <a className="intel-map-credit" href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Made with Natural Earth</a>}
        </div>
        <aside className="intel-map-evidence" ref={evidencePanel} aria-label="Intelligence map source evidence">
          <div className="intel-evidence-tabs" role="tablist" aria-label="Explore intelligence evidence" onKeyDown={evidenceTabKeys}>
            <button id={`${uid}-sources-tab`} type="button" role="tab" aria-selected={evidenceTab === 'sources'} aria-controls={`${uid}-sources-panel`} tabIndex={evidenceTab === 'sources' ? 0 : -1} onClick={() => setEvidenceTab('sources')}><FileText size={14} aria-hidden="true" />Sources</button>
            <button id={`${uid}-places-tab`} type="button" role="tab" aria-selected={evidenceTab === 'places'} aria-controls={`${uid}-places-panel`} tabIndex={evidenceTab === 'places' ? 0 : -1} onClick={() => setEvidenceTab('places')}><MapPin size={14} aria-hidden="true" />Places <span>{locations.length}</span></button>
          </div>
          <div id={`${uid}-sources-panel`} role="tabpanel" aria-labelledby={`${uid}-sources-tab`} hidden={evidenceTab !== 'sources'}>
            <div className="intel-evidence-heading"><span className="intel-kicker">Source evidence</span>{(selected || edge) && <button type="button" className="intel-map-icon" onClick={() => { selectLocation(null); setSelectedEdge(null); }} aria-label="Clear source selection"><X size={15} aria-hidden="true" /></button>}</div>
            <h2>{selected?.name || selectedNames || 'A source behind every connection.'}</h2>
            {selected ? <><p className="intel-evidence-description">{selected.storyCount} {selected.storyCount === 1 ? 'report mentions' : 'reports mention'} this {selected.kind}. Read the original source for the full context.</p><button type="button" className="intel-focus-button" onClick={() => focusLocation(selected)}><Focus size={14} aria-hidden="true" />Focus on map</button></> : edge ? <p className="intel-evidence-description">Co-mentioned in {edge.storyCount} {edge.storyCount === 1 ? 'report' : 'reports'}. Each connection comes from the reporting below.</p> : <p className="intel-evidence-description">Choose a place or connection to see the articles behind it.</p>}
            {evidence.length ? <EvidenceList evidence={evidence} /> : <div className="intel-evidence-note"><ArrowDownRight size={18} aria-hidden="true" /><span>Places mark reference geography mentioned in reporting. Exact incident locations and frontlines require separate verification.</span></div>}
            {!selected && !edge && locations.length > 0 && <button type="button" className="intel-explore-places" onClick={() => setEvidenceTab('places')}>Explore {locations.length} reporting places<ChevronRight size={15} aria-hidden="true" /></button>}
            {(selected || edge) && <button type="button" className="intel-return-map" onClick={() => setMobilePanel('map')}><ArrowLeft size={14} aria-hidden="true" />Back to map</button>}
          </div>
          <div id={`${uid}-places-panel`} role="tabpanel" aria-labelledby={`${uid}-places-tab`} hidden={evidenceTab !== 'places'}>
            <label className="intel-place-search"><Search size={15} aria-hidden="true" /><span className="intel-visually-hidden">Find a reporting place</span><input type="search" value={placeSearch} onChange={event => setPlaceSearch(event.target.value)} placeholder="Find a place" /></label>
            {searchedLocations.length ? <ul className="intel-place-list">{searchedLocations.map(location => <li key={location.id}><button type="button" onClick={() => selectLocation(location.id)} aria-label={`${location.name}: ${location.storyCount} reports. View source evidence.`}><span><MapPin size={13} aria-hidden="true" /><strong>{location.name}</strong></span><small>{location.storyCount}<ChevronRight size={13} aria-hidden="true" /></small></button></li>)}</ul> : <div className="intel-places-empty"><MapPin size={22} strokeWidth={1.5} aria-hidden="true" /><h3>{placeSearch ? 'No places found' : 'Places will appear here'}</h3><p>{placeSearch ? 'Try another place name.' : 'Named places in conflict reporting become explorable as sources publish.'}</p></div>}
          </div>
        </aside>
      </div>
      <div className="intel-map-footer"><span><i aria-hidden="true" />Source-reported · 24-hour window</span><p>Connections show co-mentions in articles. Select one to inspect its source.</p></div>
    </div>
    <div className="intel-conflict-heading"><div><span className="intel-kicker">The conflict desk</span><h2>{selected ? `Reporting on ${selected.name}` : edge ? 'Connected reporting' : 'Reports from across the world'}</h2></div><span>{relevantStories.length} {relevantStories.length === 1 ? 'report' : 'reports'}</span></div>
    {shownStories.length ? <div className="intel-conflict-grid">{shownStories.map((story, index) => <article key={story.id} className="intel-conflict-card"><div className="intel-report-top"><span>{String(index + 1).padStart(2, '0')}</span><span>Source-reported</span></div><p className="intel-report-publisher">{story.publisher}</p><h3><a href={story.articleUrl || story.sourceUrl} {...(!story.articleUrl ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{story.title}</a></h3><p className="intel-report-excerpt">{story.excerpt}</p><div className="intel-report-byline"><span>{story.author}</span><time dateTime={story.publishedAt}>{formatStamp(story.publishedAt)}</time></div><a className="intel-original-link" href={story.sourceUrl} target="_blank" rel="noopener noreferrer">Original reporting <ArrowUpRight size={14} aria-hidden="true" /></a></article>)}</div> : <div className="intel-conflict-empty"><h3>Waiting for the next dispatch.</h3><p>Conflict coverage will appear as approved sources publish relevant reports within the current reporting window.</p></div>}
    {!expandedStories && relevantStories.length > 12 && <button type="button" className="intel-more-reports" onClick={() => setExpandedStories(true)}>Show all {relevantStories.length} reports <ChevronDown size={15} aria-hidden="true" /></button>}
  </section>;
}
