import type { ReactNode } from 'react';

export interface TabItem<K extends string = string> {
  id: K;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface Props<K extends string> {
  tabs: TabItem<K>[];
  value: K;
  onChange: (id: K) => void;
}

/** Pestañas horizontales (estado finito → clase `active`). */
export default function Tabs<K extends string>({ tabs, value, onChange }: Props<K>) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          className={`tab${tab.id === value ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
