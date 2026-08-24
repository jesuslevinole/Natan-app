# code-notes.md — Revisión de calidad (agosto 2026)

Histórico de la revisión completa del proyecto siguiendo `CLAUDE.md`. Sirve para entender
**por qué** el código quedó como quedó y qué decisiones se tomaron.

## Estado antes / después

| Métrica | Antes | Después |
|---|---|---|
| `style={{...}}` inline en `.tsx` | 374 | 2 (ambos variables CSS `--progress`, justificados) |
| `eslint` (`--max-warnings 0`) | 30 errores (`any`) + 3 warnings | 0 errores, 0 warnings |
| `tsc --noEmit` | OK | OK |
| `<style>` embebido en JSX | 1 (Reports) | 0 |
| `React.FC` | 13 componentes | 0 |
| `onMouseEnter/Leave` mutando `style` | 4 | 0 |
| Listeners/fetch de Firestore por módulo | 5+4+4+2+1+1 `getDocs` al montar, re-fetch completo tras cada guardado | 8 `onSnapshot` compartidos (DataProvider), 1 vez por sesión |
| Bundle inicial | 1 chunk con todo | App ~23 KB + chunks lazy por módulo; `firebase`, `react`, `xlsx` en chunks propios |

## Archivos nuevos

- `src/context/DataProvider.tsx` + `dataContext.ts` + `hooks/useAppData.ts` — fuente única de datos en tiempo real.
- `src/context/AuthProvider.tsx` + `authContext.ts` + `hooks/useAuth.ts` + `utils/auth.ts` — auth con restauración de sesión (`onAuthStateChanged`).
- `src/components/` — `Modal`, `ModuleHeader`, `SearchBar`, `SearchableSelect`, `DestinationSearch`, `FieldSecurityModal`, `StatusBadge`, `KpiCard`, `SeqBadge`, `LoadingScreen`, `RequirePermission`, `ImportDestinationsModal`. Cada uno con su `.css` hermano cuando tiene estilos propios.
- `src/utils/entrance.ts` — `normalizeEntrance`, `buildUsageMap`, `getDetailStock`, `getEntranceStock`, `flattenEntrances`.
- `src/utils/firestore.ts` — `docToRecord`, `nextSequence`, `reserveSequenceBlock`, `formatPONumber`.
- `src/utils/excel.ts` — import (`parseDestinationsFile`) y export (`downloadWorkbook`) con SheetJS.
- `src/modules/DashboardModule.tsx` — pantalla de inicio nueva.
- `src/index.css` — utilidades globales (estaba vacío).
- `data/destinations-hidden-creek-lakehurst.csv` — las 261 direcciones de los dos Excel del cliente, ya normalizadas.

## Archivos eliminados

- `src/components/SharedUI.tsx` — repartido en componentes individuales.
- `src/components/AuthScreen.tsx` (versión vieja con login falso) — **código muerto confirmado con grep**: `App.tsx` importaba `AuthScreen` desde `SharedUI`, nadie importaba este archivo. Reescrito con el login real de Firebase.

## Bugs reales encontrados y corregidos

1. **Acceso admin sin credenciales en producción** (`AuthScreen`): el botón "Acceder como Admin (Temporal)" daba rol Super Admin a cualquiera que abriera la app. Ahora solo existe en `npm run dev` (`import.meta.env.DEV`); Vite lo elimina del build.
2. **Sesión perdida al recargar**: `currentUser` vivía solo en estado de React. Ahora `AuthProvider` escucha `onAuthStateChanged` y restaura al usuario autorizado.
3. **Filtro de direcciones vacío en Reports**: `useCatalogOptions('catalog_destinations', ...)` leía la colección `catalog_catalog_destinations` (el hook ya agregaba el prefijo). Ahora usa `DestinationSearch` sobre el DataProvider.
4. **Quick Add Destination guardaba un valor distinto al que muestra el buscador**: escribía `destination = property_name` mientras `DestinationSearch` y las tablas usan `description`. Unificado: `destination` = dirección (`description`); el complejo va en `property`.
5. **Borrar una orden dejaba sus productos huérfanos descontando stock** (`WorkActivity.handleDelete` solo borraba `jobOrders`). Ahora borra la orden y sus `jobProducts` en un `writeBatch`.
6. **Borrar un PO con productos ya instalados** dejaba `jobProducts` apuntando a nada. Ahora se bloquea con un mensaje.
7. **Borrar una dirección/rol en uso** — mismo patrón: bloqueado si hay órdenes/usuarios que la referencian.
8. **`sidebar-overlay` no tenía CSS** — el fondo oscuro del menú móvil nunca se renderizaba y no cerraba el menú al tocar afuera.
9. **Datos congelados entre pestañas/usuarios**: cada módulo hacía `getDocs` al montar; un cambio desde otro dispositivo no se veía hasta recargar. Resuelto con listeners compartidos.
10. **Handlers que dependían de estado "seleccionado"** (`handleDelete(id)` buscaba en la lista, `handleRemoveProduct` usaba `viewProducts` del cierre). Ahora reciben el ítem completo como parámetro (regla de CLAUDE.md, ya causó pérdida de datos en otro proyecto).
11. **App secundaria de Firebase nunca se eliminaba** al invitar usuarios (`initializeApp` por cada invitación). Ahora `deleteApp` en `finally`.
12. **`console.log("Mi Project ID es:")`** en `firebase.ts` — eliminado.
13. `.env` estaba versionado en git — quitado del índice (`git rm --cached`) y agregado a `.gitignore`; se agrega `.env.example`.

## Lógica duplicada extraída

| Antes (copias) | Ahora |
|---|---|
| Normalización legacy de `itemEntrance` (3 módulos) | `normalizeEntrance` |
| Cálculo de stock por detalle/PO (2 módulos, con diferencias) | `buildUsageMap` + `getDetailStock` / `getEntranceStock` |
| Transacción de contador `counters/*` (4 módulos) | `nextSequence` |
| Modal "Form Security & Fields" (2 módulos) + `FieldConfigModal` | `FieldSecurityModal` |
| Cabecera título/buscador/acciones (7 módulos) | `ModuleHeader` |
| Markup de modal (≈14 copias) | `Modal` |
| `fieldRoles` + localStorage (2 módulos) | `useFieldRoles` |
| `authorName` (3 módulos) | `useAuthorName` |
| Búsqueda case-insensitive multi-campo (6 módulos) | `matchesSearch` |

### Decisión: fusión de `SearchableSelect` y `DestinationSearch`
Se compararon punto por punto:
- **Cierre del dropdown**: `SearchableSelect` usaba `onBlur + setTimeout(200)` (pierde clicks en móvil / trackpads lentos); `DestinationSearch` usaba listener `mousedown` fuera del wrapper → **se conservó click-fuera**.
- **Selección de opción**: `onClick` (se pierde si el blur cierra antes) vs. ninguno especial → **se usa `onMouseDown` + `preventDefault`**, el más robusto de los dos.
- **Texto libre**: solo `DestinationSearch` lo permitía → prop `allowCustom`.
- **Tema oscuro**: solo `SearchableSelect` → se mantiene como prop `theme`.
- **Nuevo**: navegación con teclado (↑/↓/Enter/Esc) y `role="combobox"`.
`DestinationSearch` quedó como wrapper fino que alimenta opciones desde el DataProvider.

## Semántica
- Fichas de detalle (`Order Details`, `User Details`) → `<dl>/<dt>/<dd>`.
- Grid de catálogos → `<ul>/<li>`.
- Grupos de permisos → `<fieldset>`.
- Todos los botones tienen `type` explícito y `title` cuando son solo ícono.

## Pendientes de otra ronda (decisiones de producto — no tocar sin confirmar con el cliente)
- **Seguridad a nivel de campo en `localStorage`**: `useFormConfig` y `useFieldRoles` guardan la configuración por navegador, no en Firestore. Cada usuario/dispositivo ve reglas distintas. Debería vivir en una colección `settings`. Se mantuvo el comportamiento actual para no cambiar reglas de negocio sin aprobación.
- **`admin_role` hardcodeado** en `isFieldEditable` (bypass de field-security por id de rol). Debería usar `hasPermission('manage_security')`.
- **Reglas de seguridad de Firestore**: no están en el repo. Con el bypass de admin eliminado, la app depende de que las reglas exijan `request.auth != null` y validen el email en `users`. Revisar en la consola.
- **`quantityOrdered`** existe en el tipo legacy pero ninguna vista lo escribe ni lo muestra.
- El texto de la app está en inglés y las fechas se formatean en español (`es-ES`). Definir un idioma.

## Verificación
```
npx tsc --noEmit            # OK
npx eslint src --ext ts,tsx --max-warnings 0   # 0 problemas
npm run build               # OK
grep -rn "style={{" src     # solo 2 (variables CSS --progress)
```
**No se pudo probar en navegador contra Firebase** (entorno sin credenciales ni salida a Firebase). Lo que verifica `tsc`/`eslint`/`build` es que compila, no que funciona: probar a mano login, restauración de sesión, importación de Excel y el flujo de agregar productos a una orden.

## Ronda 2 — acceso admin garantizado y recuperación de contraseña

- **Síntoma**: al entrar con la cuenta real no aparecían Catalogs / Account Users / Manage Roles. Causa: el menú se filtra por los permisos del rol en Firestore (igual que antes), pero antes se entraba siempre con el bypass "Acceder como Admin" que daba Super Admin; el rol real no tiene `view_catalogs` ni `manage_security`.
- **Solución**: `VITE_OWNER_EMAILS` (`utils/auth.ts` → `isOwnerEmail`, `SUPER_ADMIN_ROLE`). `AuthProvider` asigna Super Admin a esos emails sin leer `roles`. La barra lateral muestra el rol activo (o "No role assigned") para que sea evidente por qué falta un módulo.
- **Forgot password**: ya usaba `sendPasswordResetEmail`; ahora envía `continueUrl` a la app (con fallback si el dominio no está autorizado), distingue éxito/error (antes el error se mostraba en verde), y traduce los códigos `auth/invalid-email`, `auth/user-not-found`, `auth/too-many-requests`.

## Ronda 3 — tablas profesionales, notas en modal, gráficos

Referencia: patrones de Roelca (orden por columna ▲/▼, filtros por columna, columnas configurables) y Berry (DataTable/RecordDetail).

- **`DataTable<T>`** (`components/DataTable.tsx` + `.css`): orden con detección de tipo (`type: 'text' | 'number' | 'date'`, vacíos al final), fila de filtros por columna, selector de columnas visibles persistido en `localStorage` (`natan_table_<storageKey>`), paginación 10/25/50/100, fila expandible (`renderExpanded`), fila clicable, columna de acciones fija a la izquierda, `rowClassName` para semáforo (`overdue`/`warn`), modo `compact`, y en móvil cada fila es una tarjeta label/valor (`data-label`). Reemplazó las 14 tablas escritas a mano.
- **`NotesCell`**: notas/observaciones como ícono (punto ámbar cuando hay texto) que abre un modal con el texto completo. Usado en Work Activity ("Notes" = `pendingWork`), Reports y Dashboard. La descripción usa `.cell-clamp` (2 líneas + `title`).
- **`ScheduleCell`** (vencida/hoy/futura/terminada) y **`StockLevel`** (texto + barra proporcional) en `StatusBadge.tsx`.
- **Gráficos** con `recharts` (chunk propio `charts`): `ChartCard`, `MonthlyBars` (apiladas o agrupadas, eje X configurable), `DonutChart` (total al centro, "Other" cuando hay más de 6), `RankBars` (top N horizontal). Tooltip propio con clases CSS: recharts trae estilos inline y CLAUDE.md los prohíbe.
- **Reports**: panel de filtros claro con chips de filtros activos (antes panel oscuro con `theme="dark"` en `SearchableSelect`, tema eliminado por quedar sin uso), 6 KPIs, 7 gráficos, tablas en pestañas (`Tabs`). Toda la lógica de datos y el export a Excel se conservaron.
- **Dashboard**: accesos rápidos, 6 KPIs (con tendencia vs mes anterior), órdenes últimos 6 meses, estado, agenda con notas, stock bajo, direcciones más visitadas.
- **`KpiCard`** rediseñada: fondo blanco, franja de color a la izquierda, ícono en chip, `trend` opcional.
- **Vista previa de diseño**: `/preview.html` + `src/dev/mockData.ts` (datos con semilla fija) para renderizar los módulos sin Firebase. Se usó para verificar en Chromium headless desktop y móvil.
- **CSS eliminado por quedar sin uso** (confirmado con grep): `.panel*`, `.h-350/400/450`, `.col-seq`, `.col-actions`, `.cell-actions`, `.nested-*`, `.clickable-row`, `.empty-state`, `.stock-cell`, `.scroll-200/60vh`, `.dark-option`, tema oscuro de `SearchableSelect`.
- Quedan dos `<table>` a mano (`FieldSecurityModal`, `ImportDestinationsModal`): son formularios (checkbox/select por fila), no listados; `DataTable` no aplica.

Verificación: `npm run check` 0/0, `npm run build` OK, `grep "style={{"` solo variables CSS (`--progress`, `--swatch`).

## Ronda 4 — inventario del cliente, modo oscuro, datos del negocio, gráficos

- **Inventario**: `EntranceDetail` suma `category`, `price`, `invoice`, `warrantyExp`, `manufacturer`, `comments`; `ItemEntranceRecord` suma `property`, `location`, `notes` (todos opcionales: los registros viejos siguen válidos). El precio vacío se guarda como `null` (Firestore rechaza `undefined`). `parseInventoryFile` + `groupInventoryRows` en `utils/excel.ts`; `ImportInventoryModal` escribe un doc por PO en batch, reserva secuencias con `reserveSequenceBlock('itemEntranceSeq')` y crea proveedores/ítems faltantes en los catálogos. `data/inventory-hidden-creek-shop.csv|xlsx` es la transcripción de las 5 páginas (suma exacta al total impreso).
- **Valor de inventario**: `entranceStockValue` en `utils/entrance.ts`; KPI en Dashboard y columna "Stock Value" en Item Entrance; en Reports, precio unitario y total por producto instalado (lookup por `entranceDetailId`).
- **Modo oscuro**: `hooks/useTheme.ts` pone `data-theme` en `<html>` y persiste en `localStorage` (`natan_theme`). Barrido de todos los hex de CSS a variables (`--surface-2/3`, `--text-strong/body/faint`, `--border-strong`, `--*-soft`). Los ejes/grilla de recharts se colorean por CSS (`.recharts-text`, `.recharts-cartesian-grid`), no por props, para que sigan el tema.
- **Datos del negocio**: `CompanyProvider` (fuera del login) lee `settings/company` con `onSnapshot`, cachea en `localStorage` y reintenta al cambiar el estado de auth. `BrandMark` reemplaza el ícono fijo en login/sidebar/móvil. `SettingsModule` redimensiona el logo con canvas (320 px, PNG o JPEG si pesa mucho) y lo guarda como data URL.
- **Gráficos**: `MonthlyBars` acepta `variant` (bars/line/area) y `ChartTypeToggle` + `useChartVariant` persisten la elección por gráfico; selector de período 3M/6M/12M en Dashboard; `ShareBar` (barra de participación) en "Works per Address".
- Pendiente de reglas de Firestore: `settings/company` con lectura pública y escritura autenticada (ver README).

Verificación: `npm run check` 0/0, `npm run build` OK, render en Chromium claro y oscuro (Dashboard, Reports, Item Entrance con importación, Settings).
