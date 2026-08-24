import type { CSSProperties } from 'react';
import { Briefcase } from 'lucide-react';
import { useCompany } from '../hooks/useCompany';
import './BrandMark.css';

interface Props {
  /** Tamaño del recuadro del logo en px. */
  size?: number;
  /** Muestra el nombre a la derecha del logo. */
  withName?: boolean;
  className?: string;
}

/** Logo del negocio (o ícono por defecto) + nombre. Usado en login, barra lateral y cabecera móvil. */
export default function BrandMark({ size = 32, withName = false, className }: Props) {
  const { company } = useCompany();
  const px = `${size}px`;
  return (
    <span className={`brand-mark${className ? ` ${className}` : ''}`}>
      <span className={`brand-logo${company.logo ? ' has-logo' : ''}`} style={{ '--brand-size': px } as CSSProperties}>
        {company.logo ? <img src={company.logo} alt={company.name} /> : <Briefcase size={Math.round(size * 0.6)} />}
      </span>
      {withName && <span className="brand-name">{company.name}</span>}
    </span>
  );
}
