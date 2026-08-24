import { useEffect, useRef, useState, type FormEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { Settings, Save, Upload, Trash2, Building2, Image as ImageIcon } from 'lucide-react';
import { db } from '../firebase';
import { useCompany } from '../hooks/useCompany';
import { useAuthorName } from '../hooks/useAuth';
import { COMPANY_DOC } from '../context/CompanyProvider';
import type { CompanySettings } from '../context/companyContext';
import { AuditLogger } from '../utils/logger';
import './SettingsModule.css';

const LOGO_MAX_PX = 320;
const LOGO_MAX_BYTES = 200 * 1024;

/** Redimensiona una imagen a LOGO_MAX_PX y la devuelve como data URL (PNG para conservar transparencia). */
const fileToLogoDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas not supported')); return; }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const png = canvas.toDataURL('image/png');
    // Si el PNG es muy grande (foto), probamos JPEG.
    resolve(png.length > LOGO_MAX_BYTES * 1.37 ? canvas.toDataURL('image/jpeg', 0.85) : png);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Invalid image')); };
  img.src = url;
});

/**
 * Datos del negocio: nombre, contacto y logo. Se guardan en `settings/company` y se muestran
 * en el login, la barra lateral y el título de la pestaña.
 */
export default function SettingsModule() {
  const { company } = useCompany();
  const authorName = useAuthorName();
  const [form, setForm] = useState<CompanySettings>(company);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Si otro admin guarda mientras esta pantalla está abierta, refrescamos el formulario
  // solo si el usuario no lo tocó (dirty check simple por igualdad).
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setForm(company); }, [company, dirty]);

  const update = (key: keyof CompanySettings, value: string) => { setForm(prev => ({ ...prev, [key]: value })); setDirty(true); };

  const handleLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage({ kind: 'error', text: 'Please choose an image file (PNG, JPG, SVG or WebP).' }); return; }
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      if (dataUrl.length > LOGO_MAX_BYTES * 1.37) { setMessage({ kind: 'error', text: 'The logo is too large even after resizing. Use a simpler image.' }); return; }
      update('logo', dataUrl);
      setMessage(null);
    } catch {
      setMessage({ kind: 'error', text: 'Could not read that image.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setMessage({ kind: 'error', text: 'The business name is required.' }); return; }
    setIsSaving(true);
    setMessage(null);
    try {
      const payload: CompanySettings = { ...form, name: form.name.trim(), updatedAt: new Date().toISOString(), updatedBy: authorName };
      await setDoc(doc(db, ...COMPANY_DOC), payload, { merge: true });
      AuditLogger.logUpdate('Settings', authorName, 'company', { name: payload.name, hasLogo: !!payload.logo });
      setDirty(false);
      setMessage({ kind: 'success', text: 'Business settings saved. The logo and name are now shown on the login screen and sidebar.' });
    } catch (err) {
      console.error(err);
      setMessage({ kind: 'error', text: 'Could not save. Check your permissions and the Firestore rules for the "settings" collection.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card max-1200 catalog-manager-anim">
      <div className="card-header wrap">
        <div className="card-header-text module-header-title">
          <h2><Settings size={28} /> Business Settings</h2>
          <p>Name, contact details and logo shown across the app and on the login screen.</p>
        </div>
      </div>

      {message && <p className={`alert ${message.kind}`}>{message.text}</p>}

      <form onSubmit={handleSave} className="settings-layout">
        <section className="settings-logo-panel">
          <h4><ImageIcon size={16} /> Logo</h4>
          <div className={`settings-logo-preview${form.logo ? '' : ' empty'}`}>
            {form.logo ? <img src={form.logo} alt="Business logo" /> : <Building2 size={40} />}
          </div>
          <label className="action btn-secondary btn-sm settings-upload">
            <Upload size={15} /> {form.logo ? 'Replace logo' : 'Upload logo'}
            <input ref={fileRef} type="file" accept="image/*" onChange={e => handleLogo(e.target.files?.[0])} />
          </label>
          {form.logo && (
            <button type="button" className="btn-text-danger flex-row" onClick={() => update('logo', '')}><Trash2 size={14} /> Remove logo</button>
          )}
          <p className="hint">PNG with transparent background works best. It is resized to {LOGO_MAX_PX}px and stored with the settings.</p>

          <div className="settings-login-preview">
            <span className="hint">Login preview</span>
            <div className="settings-login-card">
              <div className="settings-login-logo">{form.logo ? <img src={form.logo} alt="" /> : <Building2 size={22} />}</div>
              <strong>{form.name || 'Business name'}</strong>
              <span>{form.tagline || 'Secure System Login'}</span>
            </div>
          </div>
        </section>

        <section className="settings-fields">
          <div className="form-grid">
            <div className="form-group span-2">
              <label htmlFor="co-name">Business name *</label>
              <input id="co-name" type="text" value={form.name} onChange={e => update('name', e.target.value)} required placeholder="e.g. Mr Natan Maintenance" />
            </div>
            <div className="form-group span-2">
              <label htmlFor="co-tagline">Tagline (shown under the name on the login screen)</label>
              <input id="co-tagline" type="text" value={form.tagline} onChange={e => update('tagline', e.target.value)} placeholder="Secure System Login" />
            </div>
            <div className="form-group span-2">
              <label htmlFor="co-address">Address</label>
              <input id="co-address" type="text" value={form.address} onChange={e => update('address', e.target.value)} placeholder="Street, City, State ZIP" />
            </div>
            <div className="form-group">
              <label htmlFor="co-phone">Phone</label>
              <input id="co-phone" type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="(254) 555-0100" />
            </div>
            <div className="form-group">
              <label htmlFor="co-email">Email</label>
              <input id="co-email" type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="office@example.com" />
            </div>
            <div className="form-group span-2">
              <label htmlFor="co-web">Website</label>
              <input id="co-web" type="url" value={form.website} onChange={e => update('website', e.target.value)} placeholder="https://" />
            </div>
          </div>
          {company.updatedAt && (
            <p className="hint mt-3">Last saved {new Date(company.updatedAt).toLocaleString()}{company.updatedBy ? ` by ${company.updatedBy}` : ''}.</p>
          )}
          <div className="btn-container">
            <button type="button" className="action btn-secondary" onClick={() => { setForm(company); setDirty(false); setMessage(null); }} disabled={isSaving || !dirty}>Discard changes</button>
            <button type="submit" className="action btn-primary" disabled={isSaving}><Save size={16} /> {isSaving ? 'Saving...' : 'Save settings'}</button>
          </div>
        </section>
      </form>
    </div>
  );
}
