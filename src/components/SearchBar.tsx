import { Search } from 'lucide-react';
import './SearchBar.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search records...' }: Props) {
  return (
    <div className="search-bar">
      <Search size={16} className="search-bar-icon" />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}
