import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; 

/** Obtiene dinámicamente las opciones de un catálogo desde Firestore */
export const useCatalogOptions = (catalogId: string, displayField: string, valueField: string = displayField) => {
  const [options, setOptions] = useState<{id: string, value: string, label: string}[]>([]);
  
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, `catalog_${catalogId}`), (snapshot) => {
      const fetched = snapshot.docs.map(doc => {
        const data = doc.data();
        const labelText = data[displayField] && data[displayField] !== '-' ? data[displayField] : data[valueField];
        return { 
          id: doc.id, 
          value: data[valueField] || '', 
          label: labelText || '' 
        };
      });
      fetched.sort((a, b) => a.label.localeCompare(b.label));
      setOptions(fetched);
    });
    return () => unsubscribe();
  }, [catalogId, displayField, valueField]);
  
  return options;
};

/** Gestiona los campos requeridos dinámicos guardados en LocalStorage */
export const useFormConfig = (formKey: string, defaultRequired: string[]) => {
  const [requiredFields, setRequiredFields] = useState<string[]>(() => {
    const saved = localStorage.getItem(`formConfig_${formKey}`);
    return saved ? JSON.parse(saved) : defaultRequired;
  });

  const toggleRequired = (field: string) => {
    const newRequired = requiredFields.includes(field)
      ? requiredFields.filter(f => f !== field)
      : [...requiredFields, field];
    setRequiredFields(newRequired);
    localStorage.setItem(`formConfig_${formKey}`, JSON.stringify(newRequired));
  };

  const isRequired = (field: string) => requiredFields.includes(field);

  return { requiredFields, toggleRequired, isRequired };
};