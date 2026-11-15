const dimensions: Record<string, [number, number]> = {
  sites: [36.8333, 45.95], clock: [36.5, 36.5], layers: [41.1521, 28.3067],
  compare: [30.8333, 30.8333], settings: [50.6667, 50.6667],
  collapse: [24, 21], previous: [24, 24], next: [24, 24], play: [24, 24],
  'view-360': [65, 65], 'sidebar-rule': [181, 1],
  'inspector-rule': [251, 1], 'planning-rule': [251, 1],
  calendar: [24,24], clipboard: [38.1667,49.625], 'nav-solar': [21.5,21.5],
  'nav-earth-moon': [21.5,21.5], 'nav-moon': [24,24], 'nav-south': [21.5,21.5],
  'spin-down': [24,24], 'spin-up': [20.953,20.953],
  'select-arrow': [17.9262,17.9262],
};

export function SiteAsset({ name, className = '' }: { name: string; className?: string }) {
  const [width, height] = dimensions[name];
  const current = ['calendar','clipboard','nav-solar','nav-earth-moon','nav-moon','nav-south','spin-down','spin-up','sidebar-rule','select-arrow'].includes(name);
  return <img className={`site-asset ${className}`} src={`/assets/site-ui/${current ? 'current/' : ''}${name}.svg`}
    alt="" aria-hidden="true" width={width} height={height} />;
}

export function SiteBackdrop() {
  return <div className="site-backdrop" aria-hidden="true">
    <img src="/assets/site-ui/starfield.png" alt="" width="2160" height="3840" decoding="async" />
    <div className="site-backdrop-shade" />
  </div>;
}

export function SiteWordmark() {
  return <span className="site-wordmark" aria-hidden="true">AMAZE<span>X</span></span>;
}

export function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(5)}° ${value < 0 ? negative : positive}`;
}

export function SiteCoordinates({ site, elevationM }: {
  site?: { lat: number; lon: number };
  elevationM?: number;
}) {
  const fields = site ? [
    ['Lat', formatCoordinate(site.lat, 'N', 'S')],
    ['Lon', formatCoordinate(site.lon, 'E', 'W')],
    ['Height', elevationM === undefined ? '—' : `${elevationM.toFixed(0)} m`],
  ] : ['Lat', 'Lon', 'Height', 'Res', 'Dist to Cursor'].map(label => [label, '—']);
  return <div className={`lunar-cursor${site ? ' phone-only polar-site-coordinates' : ''}`} aria-label={site ? 'Selected site coordinates' : 'Lunar cursor measurements'}>
    <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <a href="https://quickmap.lroc.im-ldi.com/" target="_blank" rel="noreferrer">Moon surface readout · QuickMap · LROC</a>
  </div>;
}
