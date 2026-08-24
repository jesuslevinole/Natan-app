import { useState, useCallback } from 'react';

/** Gestiona los campos requeridos dinámicos guardados en LocalStorage */
export const useFormConfig = (formKey: string, defaultRequired: string[]) => {
  const storageKey = `formConfig_${formKey}`;
  const [requiredFields, setRequiredFields] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? (JSON.parse(saved) as string[]) : defaultRequired;
    } catch {
      return defaultRequired;
    }
  });

  const toggleRequired = useCallback((field: string) => {
    setRequiredFields(prev => {
      const next = prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const isRequired = useCallback((field: string) => requiredFields.includes(field), [requiredFields]);

  return { requiredFields, toggleRequired, isRequired };
};

/**
 * Seguridad a nivel de campo (qué rol puede editar cada campo), persistida en LocalStorage.
 * Antes estaba duplicada en Work Activity e Item Entrance.
 */
export const useFieldRoles = (storageKey: string) => {
  const [fieldRoles, setFieldRoles] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? (JSON.parse(saved) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  const setFieldRole = useCallback((field: string, roleId: string) => {
    setFieldRoles(prev => {
      const next = { ...prev };
      if (roleId) next[field] = roleId;
      else delete next[field];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  return { fieldRoles, setFieldRole };
};
