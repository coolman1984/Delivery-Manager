import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { cx } from './ui';

export type MarkerKind =
  'driver' | 'driver-busy' | 'driver-off' | 'store' | 'home' | 'pickup' | 'pin';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: MarkerKind;
  label?: string;
}

const ART: Record<MarkerKind, string> = {
  driver: 'scooter',
  'driver-busy': 'scooter',
  'driver-off': 'scooter',
  store: 'takeout',
  home: 'house',
  pickup: 'package',
  pin: 'pin',
};
const RING: Record<MarkerKind, string> = {
  driver: '#10a86c',
  'driver-busy': '#f59e0b',
  'driver-off': '#a69d93',
  store: '#ff6b1a',
  home: '#0ea5e9',
  pickup: '#8b5cf6',
  pin: '#e11d48',
};

function icon(kind: MarkerKind, label?: string): L.DivIcon {
  const text = label ? `<span class="dm-marker-label">${label.replace(/[<>&"]/g, '')}</span>` : '';
  return L.divIcon({
    className: 'dm-marker',
    html: `<span class="dm-marker-bubble" style="--ring:${RING[kind]}${kind === 'driver-off' ? ';opacity:.6' : ''}"><img src="/art/${ART[kind]}.webp" alt="" /></span>${text}`,
    iconSize: [44, 44],
    iconAnchor: [22, 40],
  });
}

/**
 * خريطة خفيفة (OpenStreetMap مجانية).
 * - markers: النقط اللي بتظهر (طيار، محل، بيت العميل...)
 * - onPick: لو موجودة، الضغط على الخريطة بيحدد مكان (لاختيار العنوان)
 */
export default function MapView({
  markers,
  center,
  zoom = 14,
  onPick,
  className = 'h-72',
  fit = true,
}: {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  onPick?: (p: { lat: number; lng: number }) => void;
  className?: string;
  fit?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!box.current || map.current) return;
    const start = center ?? markers[0] ?? { lat: 29.0661, lng: 31.0994 };
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(
      [start.lat, start.lng],
      zoom,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) =>
      pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
    );
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // الخريطة بتتعمل مرة واحدة بس
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const mk of markers)
      L.marker([mk.lat, mk.lng], { icon: icon(mk.kind, mk.label) }).addTo(g);
    if (fit && markers.length > 1) {
      m.fitBounds(L.latLngBounds(markers.map((mk) => [mk.lat, mk.lng] as [number, number])), {
        padding: [40, 40],
        maxZoom: 16,
      });
    } else if (markers.length === 1 && fit) {
      m.setView([markers[0]!.lat, markers[0]!.lng], Math.max(m.getZoom(), zoom));
    }
  }, [markers, fit, zoom]);

  return (
    <div
      ref={box}
      className={cx('z-0 overflow-hidden rounded-3xl ring-1 ring-ink-200', className)}
    />
  );
}
