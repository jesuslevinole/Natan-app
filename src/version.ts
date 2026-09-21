/**
 * Versión de la app (convención de Roelca/Berry: V#### que sube 1 por entrega).
 * Al publicar una versión nueva: sumar 1 aquí y agregar su entrada al inicio de CHANGELOG.
 * La campana de notificaciones marca "nuevo" cuando el usuario aún no vio la versión actual.
 */
export const APP_VERSION = 'V0041';
export const APP_VERSION_DATE = '2026-09-21';

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'V0041',
    date: '2026-09-21',
    items: [
      'Chat, WhatsApp style: the Chat menu item shows a green unread counter and bounces when a new message arrives (with a soft pop sound and the count in the browser tab).',
      'Floating chat bubble at the bottom-right: check and answer your chats from any screen, without leaving what you are doing.',
      'Per-conversation unread counters, and sent/read checkmarks on your messages (double blue check when everyone has read it).',
    ],
  },
  {
    version: 'V0040',
    date: '2026-09-21',
    items: [
      'Test mode for admins: view the app as any other user, with that user\'s full role — ideal for trying the Chat and checking permissions.',
      'An orange bar shows who you are viewing as; one click exits. Everything done in test mode is logged with the admin\'s real name.',
    ],
  },
  {
    version: 'V0039',
    date: '2026-09-21',
    items: [
      'Item photos: upload a photo for each item in the Item Names catalog; thumbnails show in the catalog and next to every product in Item Entrance (click to zoom).',
      'New Chat module: direct messages and group chats between the users of the app, in real time, with unread indicators.',
      'Easier product import: the Import dialog in Item Entrance now offers a simple template (with an Instructions sheet); item names and vendors that do not exist are added to the catalogs automatically.',
    ],
  },
  {
    version: 'V0038',
    date: '2026-09-11',
    items: [
      '"Finished by" is now recorded automatically with the user who marks the work as finished — it can no longer be chosen from a list.',
      'If an order was already finished, editing it keeps the original "Finished by" and date; reopening it clears them.',
    ],
  },
  {
    version: 'V0037',
    date: '2026-09-08',
    items: [
      'Dark mode fixes: sidebar labels are readable again and badges, chips and alerts use their light accent colors.',
      'Scrollbars now follow the app color palette in both themes (thin, rounded; subtle light bar on the dark sidebar).',
    ],
  },
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
