// Levanta la app contra un GHL simulado para pruebas manuales o de navegador.
import { startMockGhl } from './mock-ghl.js';
import { createServer } from '../dev.js';

const mock = await startMockGhl();
Object.assign(process.env, {
  GHL_BASE: `http://127.0.0.1:${mock.port}`,
  GHL_TOKEN: 'pit-test',
  GHL_LOCATION_ID: 'loc_TEST',
  GHL_FROM_EMAIL: 'soumission@ecoair.test',
  SESSION_SECRET: 'x'.repeat(40),
  APP_URL: `http://127.0.0.1:${Number(process.env.PORT) || 3111}`,
  APP_USERS: 'nico:clave-nico:coord:ghl_nico:Nicolas Ampère:nico@ecoair.test,marie:clave-marie:seller:ghl_marie:Marie Côté,fausto:clave-fausto:support::Fausto',
});
const port = Number(process.env.PORT) || 3111;
// Catálogo: la lista de precios ECOAIR real (lib/catalog-data.json) se carga sola al iniciar.
createServer().listen(port, () => console.log(`http://127.0.0.1:${port}`));
process.on('SIGTERM', () => process.exit(0));
