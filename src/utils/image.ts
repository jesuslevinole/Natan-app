/**
 * Utilidades de imagen compartidas (logo del negocio, fotos de artículos).
 * Las imágenes se guardan como data URL dentro del documento de Firestore, así que
 * se redimensionan en el cliente y se limita su peso (el doc admite máx. 1 MB).
 */

/** Redimensiona una imagen a `maxPx` (lado mayor) y la devuelve como data URL. */
export const fileToThumbDataUrl = (file: File, maxPx = 320, maxBytes = 200 * 1024): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const png = canvas.toDataURL('image/png');
      // Si el PNG pesa mucho (fotos reales), JPEG comprime mejor.
      resolve(png.length > maxBytes * 1.37 ? canvas.toDataURL('image/jpeg', 0.82) : png);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Invalid image')); };
    img.src = url;
  });

/** true si la data URL supera el límite de bytes (aprox. base64 ×1.37). */
export const dataUrlTooLarge = (dataUrl: string, maxBytes = 200 * 1024): boolean => dataUrl.length > maxBytes * 1.37;
