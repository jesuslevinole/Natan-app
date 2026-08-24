import { useContext } from 'react';
import { DataContext, type AppData } from '../context/dataContext';

export const useAppData = (): AppData => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useAppData must be used within DataProvider');
  return ctx;
};
