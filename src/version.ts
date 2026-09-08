/**
 * Versión de la app (convención de Roelca/Berry: V#### que sube 1 por entrega).
 * Al publicar una versión nueva: sumar 1 aquí y agregar su entrada al inicio de CHANGELOG.
 * La campana de notificaciones marca "nuevo" cuando el usuario aún no vio la versión actual.
 */
export const APP_VERSION = 'V0036';
export const APP_VERSION_DATE = '2026-09-08';

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'V0036',
    date: '2026-09-08',
    items: [
      'New notifications bell: release notes plus live alerts for overdue orders and low stock.',
      'Recycle Bin: deleted records now go to a trash module and can be restored; a reason is required when deleting.',
      'When an order is marked finished you now choose who finished it (pre-filled with "Made by").',
      'App version badge (V0036) in the sidebar and login screen.',
      'Visual refresh on the Dashboard and Reports, and a cleaner sidebar toggle (hamburger menu).',
    ],
  },
  {
    version: 'V0035',
    date: '2026-09-08',
    items: [
      '"Made by" is now assigned after creating the order (once; only admins can change it).',
      '"Finished by" is recorded automatically with the date.',
      'All dates use the US format MM/DD/YYYY.',
    ],
  },
];
