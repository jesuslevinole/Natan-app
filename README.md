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

### Vista previa de diseño (sin Firebase)

`npm run dev` y abrir `http://localhost:5173/preview.html?module=dashboard` (o `reports`, `workActivity`,
`itemEntrance`, `catalogs`, `users`, `roles`). Renderiza los módulos con datos de ejemplo
(`src/dev/mockData.ts`) para trabajar el diseño sin login ni conexión. No entra en el build de producción.

### Modo oscuro

Botón Sol/Luna en la barra lateral (y en la cabecera móvil). Se guarda en `localStorage` y por defecto
sigue la preferencia del sistema. Todo el CSS usa las variables de tema de `App.css`.

### Datos del negocio y logo

*Business Settings* (admin) → nombre, eslogan, contacto y logo. Se guarda en `settings/company`
(el logo como imagen embebida, redimensionada a 320 px) y se muestra en el login, la barra lateral y el
título de la pestaña. **Reglas de Firestore**: para que el logo aparezca en el login antes de iniciar
sesión, `settings/company` debe permitir lectura pública (`allow read: if true;`) y escritura solo a
usuarios autenticados; si no, la app usa la copia guardada en el dispositivo desde la última sesión.

### Importar el inventario del cliente

Item Entrance → **Import** → elegir `data/inventory-hidden-creek-shop.xlsx` (transcripción del
"Inventory Report — Hidden Creek Apartments, 0BLDG/SHOP", 128 unidades, $17,265.90, verificado contra el
total impreso) o cualquier export con las mismas columnas (Item, Purch Date, Model #, Serial #, War Exp,
Vendor, Mfr, Invoice, Price, Comments). Cada fila es una unidad; se agrupan por PO # y las filas
idénticas se fusionan. También hay una plantilla descargable con columnas PO # y Qty.

## Módulos

| Módulo | Qué hace |
|---|---|
| Dashboard | KPIs del día + **todas las gráficas** (órdenes por período, estado, ítems por producto, por propiedad, por usuario, recibido vs instalado, top direcciones), agenda y stock bajo |
| Work Activity | Órdenes de trabajo (activas / histórico), productos consumidos por orden |
| Item Entrance | Entradas de inventario por PO (header + productos con categoría, precio, factura, garantía), stock y valor en tiempo real, **importación del reporte de inventario**, historial de instalación |
| Catalogs | Destinos (direcciones/unidades), proveedores, nombres de ítem. **Importación masiva desde Excel** y exportación |
| Reports | Filtros combinados y tablas detalladas en pestañas (las gráficas y KPIs viven en el Dashboard). **Exportación a Excel y a PDF gerencial** |
| Account Users / Roles / Activity History / Recycle Bin / Business Settings | Administración (permisos granulares por módulo) |

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
- `src/components/DataTable.tsx` — tabla estándar (orden, filtros por columna, columnas visibles, paginación, filas expandibles). Todas las tablas la usan.
- `src/components/NotesCell.tsx` — notas/observaciones como ícono → modal.
- `src/components/charts/` — `ChartCard`, `MonthlyBars`, `DonutChart`, `RankBars` sobre recharts.
- `src/components/` — el resto de componentes reutilizables, cada uno con su `.css` hermano.
- `src/utils/` — `entrance.ts` (stock), `firestore.ts` (contadores), `excel.ts` (import/export), `helpers.tsx` (fechas, catálogos).
- `src/index.css` — utilidades globales; `src/App.css` — layout, tablas, modales.

Convenciones de código y CSS: ver `CLAUDE.md`. Historial de la revisión: `code-notes.md`.

### Roles y permisos

`src/utils/permissions.ts` define todos los permisos por módulo (ver/crear/editar/borrar, importar,
exportar, usuarios, roles, historial, ajustes del negocio). Los roles creados antes de esta versión
siguen funcionando: cada permiso nuevo hereda del permiso viejo equivalente (`manage_security`,
`manage_catalogs`, etc.).

### Versión y notificaciones

La versión de la app vive en `src/version.ts` (V####, +1 por entrega) con su changelog. La campana
de la barra superior muestra las novedades de cada versión (con aviso hasta abrirlas) y alertas en
vivo de órdenes vencidas y stock bajo.

### Modo de prueba (view as)

Un administrador con el permiso "View the app as another user" puede ver la app exactamente como
otro usuario (rol completo incluido) desde Account Users → ícono de ojo. Una barra naranja indica el
modo y permite salir; todo lo hecho queda en Activity History como "Usuario (test by Admin)".

### Chat interno

Módulo Chat: mensajes directos y grupos entre los usuarios, en tiempo real, con indicador de no
leídos. **Regla de Firestore necesaria**:
```
match /chats/{chatId} {
  allow read, write: if request.auth != null;
  match /messages/{msgId} { allow read, write: if request.auth != null; }
}
```

### Fotos de artículos

Cada registro de Item Names admite una foto (se redimensiona a 320px y se guarda como data URL en el
documento). Se muestra como miniatura en el catálogo y junto a cada producto en Item Entrance.

### Papelera de reciclaje

Nada se borra directo: al eliminar cualquier registro se pide el **motivo** y el documento completo va
a la colección `recycle_bin` (una orden se lleva sus productos). Desde el módulo Recycle Bin (admin) se
restaura con su id original o se elimina para siempre. **Regla de Firestore necesaria**:
`match /recycle_bin/{docId} { allow read, write: if request.auth != null; }`

### Exportar a PDF

Dashboard y Reports tienen **Export PDF** (permiso `export_reports`): documento carta apaisado con el
logo y nombre del negocio, KPIs, gráficas (en el Dashboard) y tablas completas, listo para gerencia.
Se genera en el navegador con jsPDF; no requiere servicios externos.

### Traducir y corregir textos

En el formulario de órdenes, *Description* y *Pending Work* tienen botones **ES → EN**, **EN → ES** y
**Fix writing**. Usan servicios públicos gratuitos (MyMemory para traducir, LanguageTool para
ortografía) directamente desde el navegador, sin API key; si no hay internet o se agotó el cupo diario,
avisan y no cambian el texto.

## Colecciones de Firestore

`jobOrders`, `jobProducts`, `itemEntrance`, `users`, `roles`, `system_logs`, `counters`,
`catalog_destinations`, `catalog_supply_companies`, `catalog_item_names`.
