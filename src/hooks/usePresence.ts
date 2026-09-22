import { useContext } from 'react';
import { PresenceContext } from '../context/presenceContext';

export const usePresence = () => useContext(PresenceContext);
