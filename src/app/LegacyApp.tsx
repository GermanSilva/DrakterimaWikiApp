import 'leaflet/dist/leaflet.css'
import App from '../App'

/**
 * The original Firebase app, mounted at /legacy/* for side-by-side comparison during the migration.
 * Only reachable through a dynamic import (see routes.tsx), so Firebase, three and Leaflet stay out
 * of the hub bundle. Its own password auth and `page` state are untouched.
 */
export function LegacyApp() {
  return <App />
}
