import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

/** Renderiza `children` solo si el rol actual tiene el permiso indicado. */
export default function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) return null;
  return <>{children}</>;
}
