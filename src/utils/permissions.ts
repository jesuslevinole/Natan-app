/**
 * Catálogo completo de permisos de la app, agrupado por módulo. Es la única fuente:
 * Roles lo usa para pintar los checkboxes y AuthProvider para resolver herencias.
 *
 * Compatibilidad: los roles guardados antes de esta versión solo tienen los permisos
 * "viejos" (view/add/edit/delete de Work Activity e Item Entrance, view_catalogs,
 * manage_catalogs, view_reports, manage_security). Cada permiso nuevo declara en
 * `legacy` qué permiso viejo lo implica, así ningún rol existente pierde acceso.
 */
export interface PermissionDef {
  id: string;
  label: string;
  /** Permisos viejos que implican este permiso (herencia hacia atrás). */
  legacy?: string[];
}

export interface PermissionGroup {
  module: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  { module: 'Dashboard', permissions: [
    { id: 'view_dashboard', label: 'View Dashboard', legacy: ['*'] },
  ] },
  { module: 'Work Activity', permissions: [
    { id: 'view_work_activity', label: 'View work orders' },
    { id: 'add_work_activity', label: 'Create work orders' },
    { id: 'edit_work_activity', label: 'Edit work orders' },
    { id: 'delete_work_activity', label: 'Delete work orders' },
  ] },
  { module: 'Item Entrance (Inventory)', permissions: [
    { id: 'view_item_entrance', label: 'View POs & stock' },
    { id: 'add_item_entrance', label: 'Create POs' },
    { id: 'edit_item_entrance', label: 'Edit POs' },
    { id: 'delete_item_entrance', label: 'Delete POs' },
    { id: 'import_item_entrance', label: 'Import inventory from Excel', legacy: ['add_item_entrance'] },
  ] },
  { module: 'Catalogs', permissions: [
    { id: 'view_catalogs', label: 'View catalogs' },
    { id: 'add_catalogs', label: 'Add records', legacy: ['manage_catalogs'] },
    { id: 'edit_catalogs', label: 'Edit records', legacy: ['manage_catalogs'] },
    { id: 'delete_catalogs', label: 'Delete records', legacy: ['manage_catalogs'] },
    { id: 'import_catalogs', label: 'Import addresses from Excel', legacy: ['manage_catalogs'] },
    { id: 'export_catalogs', label: 'Export catalogs to Excel', legacy: ['view_catalogs'] },
  ] },
  { module: 'Reports', permissions: [
    { id: 'view_reports', label: 'View reports' },
    { id: 'export_reports', label: 'Export reports (Excel / PDF)', legacy: ['view_reports'] },
  ] },
  { module: 'Account Users', permissions: [
    { id: 'view_users', label: 'View users', legacy: ['manage_security'] },
    { id: 'manage_users', label: 'Invite, edit & revoke users', legacy: ['manage_security'] },
  ] },
  { module: 'Roles', permissions: [
    { id: 'view_roles', label: 'View roles', legacy: ['manage_security'] },
    { id: 'manage_roles', label: 'Create, edit & delete roles', legacy: ['manage_security'] },
  ] },
  { module: 'Activity History', permissions: [
    { id: 'view_logs', label: 'View activity history', legacy: ['manage_security'] },
  ] },
  { module: 'Business Settings', permissions: [
    { id: 'manage_settings', label: 'Edit business name, contact info & logo', legacy: ['manage_security'] },
  ] },
  { module: 'Security (advanced)', permissions: [
    { id: 'manage_security', label: 'Field security & form configuration (admin)' },
  ] },
];

/** id → permisos viejos que lo implican. */
const LEGACY_IMPLIES: Record<string, string[]> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap(g => g.permissions.filter(p => p.legacy).map(p => [p.id, p.legacy as string[]])),
);

/**
 * true si `granted` habilita `permission`, aplicando la herencia de permisos viejos.
 * `legacy: ['*']` significa "cualquier usuario con sesión" (ej. el Dashboard).
 */
export const permissionSatisfied = (permission: string, granted: string[]): boolean => {
  if (granted.includes(permission)) return true;
  const legacy = LEGACY_IMPLIES[permission];
  if (!legacy) return false;
  if (legacy.includes('*')) return true;
  return legacy.some(old => granted.includes(old));
};
