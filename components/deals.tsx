'use client';

import {useEffect, useMemo, useState} from 'react';
import {ArrowUpRight, Bookmark, Check, Search, ShoppingBag, Sparkles} from 'lucide-react';
import type {Deal, DealsSettings} from '@/lib/deals';

const SAVED_KEY = 'jew-knows-saved-deals';

function DealCard({deal, saved, onSave}: {deal: Deal; saved: boolean; onSave: () => void}) {
  const [imageFailed, setImageFailed] = useState(false);
  return <article className="deal-card">
    <div className="deal-card-visual">
      {deal.image && !imageFailed ? <img src={deal.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)}/> : <div className="deal-image-placeholder"><ShoppingBag strokeWidth={1}/><span>{deal.merchant}</span></div>}
      <span className="deal-card-category">{deal.category}</span>
      <button className={'deal-save ' + (saved ? 'is-saved' : '')} onClick={onSave} aria-pressed={saved} aria-label={(saved ? 'Remove from saved picks: ' : 'Save product: ') + deal.title}>{saved ? <Check size={17}/> : <Bookmark size={17}/>}</button>
    </div>
    <div className="deal-card-content">
      <div className="deal-merchant"><span>{deal.merchant}</span><span>Partner pick</span></div>
      <h2><a href={deal.url} target="_blank" rel="sponsored noopener noreferrer">{deal.title}</a></h2>
      {deal.description && <p>{deal.description}</p>}
      <div className="deal-card-foot"><div>{deal.price ? <><strong>{deal.price}</strong><span>Confirm at merchant</span></> : <span>See current offer at source</span>}</div><a href={deal.url} target="_blank" rel="sponsored noopener noreferrer" className="deal-open">Explore <ArrowUpRight size={17}/></a></div>
    </div>
  </article>;
}

export function DealsPage() {
  const [settings, setSettings] = useState<DealsSettings>({deals: []}), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [category, setCategory] = useState('All picks'), [query, setQuery] = useState(''), [savedOnly, setSavedOnly] = useState(false), [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    try {const stored: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); if (Array.isArray(stored)) setSaved(stored.filter((id): id is string => typeof id === 'string').slice(0, 200));} catch { /* Saving remains available for this visit. */ }
    fetch('/api/deals').then(async response => {const data = await response.json() as DealsSettings & {error?: string}; if (!response.ok) throw new Error(data.error || 'Product picks could not be loaded.'); if (active) setSettings(data);}).catch(reason => {if (active) setError((reason as Error).message);}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, []);
  const categories = useMemo(() => ['All picks', ...new Set(settings.deals.map(deal => deal.category))], [settings]);
  const visibleSaved = settings.deals.filter(deal => saved.includes(deal.id)).length;
  const deals = useMemo(() => settings.deals.filter(deal => (category === 'All picks' || deal.category === category) && (!savedOnly || saved.includes(deal.id)) && (!query.trim() || [deal.title, deal.description, deal.merchant, deal.category].join(' ').toLowerCase().includes(query.trim().toLowerCase()))), [settings, category, savedOnly, saved, query]);
  function toggleSaved(id: string) {
    setSaved(previous => {const next = previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id].slice(-200); try {localStorage.setItem(SAVED_KEY, JSON.stringify(next));} catch { /* Local storage is optional. */ } return next;});
  }
  return <main className="deals-page">
    <section className="deals-hero"><div className="deals-hero-copy"><span className="eyebrow"><Sparkles size={14}/>THE GOOD FINDS</span><h1>A little discovery.<br/><em>A lot of possibility.</em></h1><p>Gear, ideas, and everyday upgrades worth a closer look. Build your own shortlist as you explore.</p><span className="deals-disclosure">Partner links · Offers and availability are confirmed at the merchant.</span></div><div className="deals-saved-orbit"><Bookmark size={23} strokeWidth={1.4}/><strong>{visibleSaved.toString().padStart(2, '0')}</strong><span>Your saved picks</span><small>Made for your next good find.</small></div></section>
    <section className="deals-selection" aria-label="Browse product picks">
      <div className="deals-toolbar"><label className="deals-search"><Search size={18}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find your next good pick" aria-label="Search product picks"/></label><button className={'deals-saved-filter ' + (savedOnly ? 'active' : '')} aria-pressed={savedOnly} onClick={() => setSavedOnly(value => !value)}><Bookmark size={16}/>Saved picks <span>{visibleSaved}</span></button></div>
      <div className="deals-category-scroll" role="group" aria-label="Product categories">{categories.map(name => <button key={name} className={category === name ? 'active' : ''} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
      <div className="deals-results-caption"><span>{loading ? 'Opening the collection…' : `${deals.length} ${deals.length === 1 ? 'pick' : 'picks'} to explore`}</span><a href="/rewards">Prefer a reward? Watch an ad <ArrowUpRight size={14}/></a></div>
      {error ? <div className="deals-empty" role="alert"><ShoppingBag strokeWidth={1}/><h2>The collection is taking a moment.</h2><p>{error}</p><button className="button outline" onClick={() => window.location.reload()}>Try again</button></div> : loading ? <div className="deals-grid" aria-busy="true" aria-label="Loading product picks">{[0, 1, 2].map(id => <div key={id} className="deal-card deal-skeleton"><div className="deal-card-visual"/><div className="deal-card-content"><span/><span/><span/></div></div>)}</div> : deals.length ? <div className="deals-grid">{deals.map(deal => <DealCard key={deal.id} deal={deal} saved={saved.includes(deal.id)} onSave={() => toggleSaved(deal.id)}/>)}</div> : <div className="deals-empty"><ShoppingBag strokeWidth={1}/><h2>{savedOnly ? 'Your shortlist starts with a save.' : settings.deals.length ? 'A different search may be the find.' : 'The next good find starts here.'}</h2><p>{savedOnly ? 'Tap the bookmark on a product to keep it close.' : settings.deals.length ? 'Try another category or clear your search.' : 'New partner picks will appear as the collection is curated.'}</p>{(savedOnly || query || category !== 'All picks') && <button className="button outline" onClick={() => {setCategory('All picks'); setQuery(''); setSavedOnly(false);}}>Explore all picks</button>}</div>}
    </section>
  </main>;
}
