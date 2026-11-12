/**
 * Production counterpart of `environment.ts`.
 *
 * `angular.json` swaps this file in for the production configuration, and the
 * Docker build rewrites it from the `API_BASE_URL` build argument. Keep the
 * shape identical to `environment.ts`.
 */
export const environment = {
  apiBaseUrl: 'http://localhost:8080/api',
  produccion: true,
};
