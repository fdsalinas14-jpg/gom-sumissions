# Soumissions Climatisation GOM

App de soumissions de Climatisation GOM inc. (Montréal), con el mismo formato y diseño que la app de Eco Air.
Vercel (pantalla + funciones) y Neon Postgres (catálogo, soumissions, vendedores, historial). El GoHighLevel de GOM
(location `FtOJSxJyWqcnz1SjqBID`) recibe contactos, oportunidades, etiquetas, notas y envía los correos y SMS. Sin paso de build.

## Para el vendedor (4 pasos, letra grande, funciona en el teléfono)

1. **Cliente**: busca en GHL o crea uno nuevo.
2. **Equipo**: categoría → marca → capacidad → modelo. Murale, Multizone (unidades exteriores y, aparte, las **têtes
   intérieures**), Centrale, Add-on (case coil sobre la fournaise), Climatiseur (A/C seulement).
3. **Precio**: el vendedor **escribe su precio de venta** y, debajo, su comisión ($). Opciones: elementos eléctricos,
   grillas de cassette, MiniERV, líneas frigoríficas, garantías.
4. **Verificar y enviar**: TPS/TVQ, vista previa del PDF, envío por correo y/o SMS con enlace para **firmar en línea**.

La comisión y la línea « Directeur des ventes » nunca aparecen en el PDF ni en la página del cliente.

## Catálogo

`node scripts/build-catalog.mjs docs/chargement-catalogue.md` arma `lib/catalog-data.json` desde las listas
Kinghome R32 (2 mai 2026) y Zephyr R32/R454b (17 juillet 2025) transcritas en `scripts/gom-lists.mjs`:
modelos, dimensiones, alimentación, raccords, réfrigérant, disjoncteur, SEER2/HSPF2, Energy Star, AHRI y subvención LogisVert.
Sin precio base (el vendedor lo escribe) y nunca el costo de las listas. Garantía: Kinghome 12 ans, Zephyr 10 ans pièces et
compresseur; main-d’œuvre 6 ans. Sin rooftop ni modelos R410a en liquidación. Al cambiar el catálogo, subir `VERSION`:
la app lo recarga sola y respeta los productos que el admin corrigió a mano.

## Estados y GHL (pipeline « GOM CLIMATISATION SALES PIPELINE »)

Envoyée → etapa « Soumission Sent »; Acceptée (firmada) y Payée → « Won » (ganada); Perdue → « Cancel » (perdida).
Se cambian en Réglages → Étapes GHL.

## Roles

**Administrateur – accès complet**, **Administrateur – consultation (Admin View)** y **Vendeur** (solo las suyas).

## Variables (Vercel)

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la pone Vercel al conectar Neon (Storage) |
| `SESSION_SECRET` | texto largo al azar (40+ caracteres) |
| `GHL_TOKEN` | token de la Private Integration de GOM |
| `GHL_LOCATION_ID` | `FtOJSxJyWqcnz1SjqBID` |
| `GHL_FROM_EMAIL` | correo remitente verificado en GHL (ej. `info@gomclimatisation.com`) |
| `APP_USERS` | solo la primera vez: `usuario:clave:admin:ghlUserId:Nombre:correo` separados por coma |
| `APP_URL` | opcional: la URL final de la app |

## Desarrollo

- `node test/run.js` — pruebas del servidor con Postgres en memoria (PGlite) y GHL simulado.
- `node test/e2e.cjs` y `node test/e2e-sign.cjs` — pruebas en navegador (Playwright).
- `node test/serve-e2e.js` — la app en http://127.0.0.1:3111 con GHL simulado (`nico` / `clave-nico`).
