import { useId } from 'react';

// Two original angular glyphs: the J folds inward; the K opens an aperture.
const monogram = 'M14 23H53V63L31 86H14V71H25L38 57V38H14Z M60 23H75V46L94 23H113L86 54L114 86H95L75 63V86H60Z';
const aperture = 'M13 43V25L25 13H52 M69 13H95L107 25V37 M107 76V95L95 107H68 M51 107H25L13 95V81';

export function HolographicLogo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const identity = useId().replace(/:/g, '');
  const spectrum = `${identity}-spectrum`;
  const edge = `${identity}-edge`;
  const shine = `${identity}-shine`;
  return <span className={`holographic-brand${compact ? ' holographic-brand--compact' : ''}${className ? ` ${className}` : ''}`}>
    <span className="holographic-brand__perspective" aria-hidden="true">
      <span className="holographic-brand__object">
        <svg className="holographic-brand__mark" viewBox="0 0 120 120" fill="none" focusable="false">
          <defs>
            <linearGradient id={spectrum} className="holographic-brand__spectrum" x1="18" y1="17" x2="104" y2="106" gradientUnits="userSpaceOnUse">
              <stop stopColor="#edf9fc"/><stop offset=".24" stopColor="#a5d6e4"/><stop offset=".5" stopColor="#baa9e7"/><stop offset=".72" stopColor="#7bafc1"/><stop offset="1" stopColor="#e6f2ef"/>
            </linearGradient>
            <linearGradient id={edge} x1="23" y1="26" x2="107" y2="99" gradientUnits="userSpaceOnUse">
              <stop stopColor="#537d95"/><stop offset=".4" stopColor="#263847"/><stop offset=".76" stopColor="#6e609a"/><stop offset="1" stopColor="#93b9c2"/>
            </linearGradient>
            <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#fff" stopOpacity="0"/><stop offset=".4" stopColor="#fff" stopOpacity="0"/><stop offset=".5" stopColor="#fff" stopOpacity=".8"/><stop offset=".6" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#fff" stopOpacity="0"/>
            </linearGradient>
            <clipPath id={`${identity}-clip`}><path d={monogram}/></clipPath>
          </defs>
          <path className="holographic-brand__aperture" d={aperture} stroke={`url(#${spectrum})`} strokeWidth=".9" strokeOpacity=".55"/>
          <g transform="translate(3 10) scale(.9)">
            {[5, 4, 3, 2, 1].map(depth => <path key={depth} d={monogram} transform={`translate(${depth * .7} ${depth * .75})`} fill={`url(#${edge})`} stroke="#7194a4" strokeOpacity=".26" strokeWidth=".3"/>)}
            <path d={monogram} fill={`url(#${spectrum})`} stroke="#eaf5fc" strokeOpacity=".55" strokeWidth=".6"/>
            <path d="M16 25H51V62L31 83 M62 25H73V49L96 25 M89 57L112 84" stroke="#effaff" strokeOpacity=".56" strokeWidth=".6"/>
            <g clipPath={`url(#${identity}-clip)`}>
              <rect className="holographic-brand__glint" x="-130" y="-20" width="135" height="145" fill={`url(#${shine})`} transform="rotate(-18 55 55)"/>
            </g>
          </g>
          <path className="holographic-brand__spark" d="M99 14L107 22" stroke="#d4e8f6" strokeWidth="1.2"/>
        </svg>
      </span>
    </span>
    <span className="holographic-brand__type">
      <span className="holographic-brand__name">Jew Knows</span>
      {!compact && <span className="holographic-brand__slogan">OSINT, News, and Important World Announcements.</span>}
    </span>
  </span>;
}
