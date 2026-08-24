import { useContext } from 'react';
import { CompanyContext } from '../context/companyContext';

export const useCompany = () => useContext(CompanyContext);
