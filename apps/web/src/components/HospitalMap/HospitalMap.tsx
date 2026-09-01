import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import styles from './HospitalMap.module.css';

/**
 * North Macedonia, whole. The map opens on the country rather than on the
 * chosen city because there is no coordinate for a city to open on — CITIES is
 * a list of names, and inventing 34 lat/lngs from memory would put wrong pins
 * on a screen whose entire job is telling a donor where to go.
 *
 * Centring on the selected city is the obvious next step, and it needs a real
 * coordinate table sourced by someone who can check it.
 */
const COUNTRY = { lat: 41.6086, lng: 21.7453, zoom: 8 };

/** Close enough to see a hospital entrance once a pin is down. */
const PIN_ZOOM = 15;

interface HospitalMapProps {
  lat: number | null;
  lng: number | null;
  /**
   * Omit for a map that only shows. The detail screen displays where a
   * request already is; only the form that creates one lets you move it.
   */
  onPick?: ((lat: number, lng: number) => void) | undefined;
}

/**
 * A map showing one hospital, and — given onPick — for moving the pin (§9.3).
 *
 * Leaflet is driven directly rather than through react-leaflet: this is one
 * map with one marker and one event, and a wrapper library would be a second
 * dependency to keep in step with the first for no behaviour we need.
 *
 * The marker is a divIcon, not Leaflet's default image marker. That is not
 * only to dodge the well-known broken-icon-path problem under a bundler — it
 * means the pin is our own element, so it takes its colour from the same token
 * as everything else instead of shipping a blue PNG.
 */
export default function HospitalMap({ lat, lng, onPick }: HospitalMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);

  /* onPick lives in a ref so the map is built once. Rebuilding it on every
     render of the parent would tear down the tiles mid-pan. */
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = L.map(container.current, {
      center: [COUNTRY.lat, COUNTRY.lng],
      zoom: COUNTRY.zoom,
      // The form scrolls; a wheel over the map should scroll the page, not
      // zoom the map out from under the cursor. Click, then zoom.
      scrollWheelZoom: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // Required by the OSM tile usage policy, and fair besides — the map is
      // someone else's work.
      attribution:
        '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);

    instance.on('click', (event: L.LeafletMouseEvent) => {
      // Read through the ref every time, so a map that starts read-only and
      // is later given a handler needs no rebuild — and one that never gets
      // a handler quietly ignores the click.
      pick.current?.(event.latlng.lat, event.latlng.lng);
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  /* The pin follows the coordinates rather than owning them: the form holds
     the value, so clearing it from outside removes the marker too. */
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    if (lat === null || lng === null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }

    const icon = L.divIcon({
      className: '',
      html: `<span class="${styles.pin}"></span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    });

    if (marker.current) marker.current.setLatLng([lat, lng]).setIcon(icon);
    else marker.current = L.marker([lat, lng], { icon, keyboard: false }).addTo(instance);

    instance.setView([lat, lng], Math.max(instance.getZoom(), PIN_ZOOM));
  }, [lat, lng]);

  return (
    <div
      ref={container}
      className={styles.map}
      /* The map is a convenience for a sighted user placing a pin. The
         coordinates it produces are optional, and the address is already in
         the hospital field — so there is nothing here a screen reader user
         needs, and a tile grid announced element by element is worse than
         silence. The button beside it clears the pin without the map. */
      role="presentation"
    />
  );
}
