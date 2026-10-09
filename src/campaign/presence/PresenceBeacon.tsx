import { usePresenceBeacon } from './usePresenceBeacon'

/** Renders nothing; mounted once in the campaign layout for every member (players and the DM). */
export function PresenceBeacon() {
  usePresenceBeacon()
  return null
}
