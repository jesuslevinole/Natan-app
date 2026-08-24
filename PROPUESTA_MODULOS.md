# Natan-app — Propuesta de módulos (roadmap)

Documento interno (español). La versión para el cliente, en inglés, está en
`Natan-App_Release-and-Roadmap.docx`.

## Cómo usar esto con el cliente

La estrategia es cambiar la conversación de *"¿por qué está atrasado?"* a *"esto es lo que ya
funciona hoy y esto es lo que viene"*. Por eso el documento para el cliente arranca con lo
**entregado en esta versión** (cosas visibles: Dashboard, importación de sus 261 unidades,
exportación a Excel, sesión que no se pierde, sincronización en tiempo real) y recién después
propone módulos. Cada módulo está descrito por el problema del cliente que resuelve, no por la
tecnología.

Los tamaños (S/M/L) son estimaciones de esfuerzo relativo, **no fechas**. Comprometé fechas
solo de la Fase 1 y una vez que tengas capacidad real.

## Entregado en esta versión (para mostrar en la demo)

1. **Dashboard** — órdenes activas, vencidas, para hoy, stock disponible, alertas de stock bajo, próximas visitas.
2. **Importación de direcciones desde Excel** — los dos archivos del cliente (237 + 24 unidades) se cargan en 3 clics; detecta duplicados.
3. **Exportación a Excel** de reportes y catálogos.
4. **Sesión persistente** — ya no hay que loguearse en cada recarga.
5. **Tiempo real** — lo que carga un técnico lo ve el administrador sin recargar.
6. **Rendimiento** — módulos cargados bajo demanda, caché local (la app abre al instante con datos de la última sesión), sin re-descargas tras cada guardado.
7. **Integridad de datos** — no se puede borrar una orden dejando stock fantasma, ni un PO con productos instalados, ni una dirección/rol en uso.
8. **Seguridad** — eliminado el acceso admin sin contraseña del build de producción.
9. **Móvil** — menú lateral con fondo y cierre al tocar afuera; selects usables en táctil.

## Módulos propuestos

### Fase 1 — valor inmediato sobre lo que ya existe (tamaño S)
| Módulo | Problema del cliente que resuelve | Base técnica |
|---|---|---|
| **Ficha por unidad / propiedad** | "¿Qué se le hizo al 12 Mystyc Ct. y qué se le instaló?" Hoy hay que buscar en Work Activity y Reports por separado. | Ya está el catálogo con `property/street/unit` importado; es una vista que cruza órdenes + productos por dirección. |
| **Lista de reposición por proveedor** | Cuando el stock baja, armar el pedido a cada Supply Company a mano. | Dashboard ya calcula stock bajo; falta agrupar por proveedor y exportar/enviar. |
| **Garantías por serial** | Saber si un equipo instalado (por número de serie) está en garantía antes de reemplazarlo. | Fecha de llegada + meses de garantía en `EntranceDetail`; alerta en la ficha de unidad. |
| **Notificaciones por email** | El manager de la propiedad pregunta "¿ya terminaron?" | Trigger al pasar `workFinish` a YES y resumen diario de vencidas (Cloud Functions + email). |

### Fase 2 — trabajo en campo (tamaño M)
| Módulo | Problema | Base técnica |
|---|---|---|
| **Fotos antes/después** | Evidencia para el manager y para disputas. | Firebase Storage + galería en la orden. |
| **Orden de trabajo en PDF + firma** | Comprobante firmado por el tenant/manager al terminar. | Generación en cliente + canvas de firma; se guarda en Storage y se adjunta al email. |
| **Calendario de visitas** | Ver la semana por técnico, mover visitas arrastrando. | Vista calendario sobre `schedule` + `madeBy`. |
| **Modo offline / app instalable (PWA)** | Sótanos y edificios sin señal. | Vite PWA plugin; Firestore ya tiene caché persistente (hecho en esta versión), falta cola de escrituras y manifest. |

### Fase 3 — negocio (tamaño M/L)
| Módulo | Problema | Base técnica |
|---|---|---|
| **Costos y facturación por propiedad** | Cuánto costó cada trabajo (material + mano de obra) y qué facturar a cada complejo por mes. | Costo unitario en `EntranceDetail`, tarifa por técnico, reporte mensual exportable. |
| **Portal del manager (solo lectura)** | Que el cliente del cliente vea el estado de sus unidades sin llamar. | Rol `property_manager` limitado a su `property`, vista reducida. |
| **Facturas del proveedor adjuntas al PO** | Conciliar lo recibido contra la factura. | Archivo adjunto en `itemEntrance`. |

## Pendientes técnicos que conviene resolver antes de la Fase 2
- Configuración de campos obligatorios / seguridad por campo hoy vive en `localStorage` (por navegador). Moverla a Firestore.
- Revisar las reglas de seguridad de Firestore en la consola (ver `code-notes.md`).
- Definir idioma de la interfaz (hoy textos en inglés, fechas en español).
