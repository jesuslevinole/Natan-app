import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { useAppData } from '../hooks/useAppData';

interface Props {
  value?: string;
  onSelect: (description: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Si es true, agrega la opción "All Addresses" con id vacío (filtros de reportes). */
  includeAll?: boolean;
  /** Si es true, permite escribir una dirección que no está en el catálogo. */
  allowCustom?: boolean;
}

/**
 * Buscador de direcciones sobre el catálogo `catalog_destinations` (en tiempo real vía
 * DataProvider — antes abría su propio listener en cada montaje). El valor guardado es
 * la `description` (dirección), que es lo que muestran Work Activity y Reports.
 */
export default function DestinationSearch({
  value = '', onSelect, placeholder = 'Search address...', required = false, includeAll = false, allowCustom = true,
}: Props) {
  const { destinations } = useAppData();

  const options = useMemo(() => {
    const list = destinations
      .filter(d => d.description)
      .map(d => ({ id: d.description, label: d.description, sublabel: d.property || undefined }));
    return includeAll ? [{ id: '', label: 'All Addresses' }, ...list] : list;
  }, [destinations, includeAll]);

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={(id) => onSelect(id)}
      placeholder={placeholder}
      required={required}
      allowCustom={allowCustom}
      optionIcon={<MapPin size={16} />}
      emptyMessage="No addresses found."
    />
  );
}
