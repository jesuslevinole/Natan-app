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
