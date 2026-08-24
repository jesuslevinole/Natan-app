# Mr Natan App

Gestión de órdenes de trabajo, inventario por PO y reportes para mantenimiento de propiedades.
React 18 + TypeScript + Vite + Firebase (Auth + Firestore).

## Puesta en marcha

```bash
cp .env.example .env     # completar con las credenciales del proyecto Firebase
npm install
npm run dev              # desarrollo (incluye botón "Dev access" en el login)
npm run check            # tsc + eslint (0 errores, 0 warnings)
npm run build            # producción → dist/
```

### Acceso de administrador garantizado

`VITE_OWNER_EMAILS` (en `.env`, separados por coma) lista los emails que siempre reciben el rol
**Super Admin**, sin importar qué permisos tenga su rol en Firestore. Usalo para tu propia cuenta:
así nunca perdés acceso a *Account Users* / *Manage Roles* aunque un rol quede mal configurado.
Para los demás usuarios, lo que ven en el menú depende de los permisos de su rol
(`view_catalogs`, `manage_security`, etc.). El rol activo se muestra debajo del nombre en la barra lateral.

### Recuperar contraseña

Login → *Forgot your password?* → email → **Send Reset Link**. Firebase envía el correo desde
`noreply@<project-id>.firebaseapp.com` (suele caer en spam la primera vez). El enlace abre la
página de Firebase para elegir una contraseña nueva y vuelve a la app. Para personalizar el
remitente o el texto: Firebase Console → Authentication → Templates.

## Módulos

| Módulo | Qué hace |
|---|---|
| Dashboard | KPIs del día: órdenes activas, vencidas, para hoy, stock disponible, alertas de stock bajo |
| Work Activity | Órdenes de trabajo (activas / histórico), productos consumidos por orden |
| Item Entrance | Entradas de inventario por PO (header + productos), stock en tiempo real, historial de instalación |
| Catalogs | Destinos (direcciones/unidades), proveedores, nombres de ítem. **Importación masiva desde Excel** y exportación |
| Reports | Filtros combinados, KPIs, consumo por PO, log de productos instalados. **Exportación a Excel** |
| Account Users / Roles / Activity History | Administración (permiso `manage_security`) |

## Importar las direcciones del cliente

1. Catalogs → Destinations → **Import**.
2. Escribir el nombre de la propiedad (ej. `Hidden Creek Apartments`) y elegir `HIDDEN_CREEK_APARMENT.xlsx`.
3. Revisar la vista previa (detecta duplicados y permite desmarcar filas) → **Import**.
4. Repetir con `LAKEHURST_PARK__APARTMENT.xlsx` → `Lakehurst Park Apartments`.

El importador reconoce el formato original del cliente (bloques `unidad | calle`) y también
tablas con encabezado `Address, Property, Street, Unit` (ver `data/destinations-hidden-creek-lakehurst.csv`,
que ya contiene las 261 direcciones normalizadas).

## Arquitectura

- `src/context/DataProvider.tsx` — un `onSnapshot` por colección, compartido por toda la app. Los módulos **no** hacen fetch propio.
- `src/context/AuthProvider.tsx` — sesión persistente (`onAuthStateChanged`) + rol en tiempo real.
- `src/components/` — componentes reutilizables, cada uno con su `.css` hermano.
- `src/utils/` — `entrance.ts` (stock), `firestore.ts` (contadores), `excel.ts` (import/export), `helpers.tsx` (fechas, catálogos).
- `src/index.css` — utilidades globales; `src/App.css` — layout, tablas, modales.

Convenciones de código y CSS: ver `CLAUDE.md`. Historial de la revisión: `code-notes.md`.

## Colecciones de Firestore

`jobOrders`, `jobProducts`, `itemEntrance`, `users`, `roles`, `system_logs`, `counters`,
`catalog_destinations`, `catalog_supply_companies`, `catalog_item_names`.
