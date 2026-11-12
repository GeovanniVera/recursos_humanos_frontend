/**
 * Single source of truth for the API host.
 *
 * The production URL is configured later; until then this is the only place
 * where the API origin lives, so switching environments is a one-line change.
 */
export const environment = {
  apiBaseUrl: 'http://localhost:8080/api',
  produccion: false,
};
