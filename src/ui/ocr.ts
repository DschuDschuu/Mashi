/**
 * Texterkennung für Kassenbon-Screenshots – läuft komplett im Browser, das Bild verlässt
 * das Gerät nicht. Die Bibliothek (Tesseract) und das deutsche Sprachmodell werden erst beim
 * ersten Import geladen (einige MB) und danach vom Browser zwischengespeichert.
 * Alles von der eigenen Seite (tesseract/, siehe vite.config.ts) – nicht vom CDN (Code-Review #3):
 * kein fremder Code mit Zugriff auf die App-Daten, und es klappt auch offline.
 */
export async function recognizeText(image: Blob, onProgress: (share: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const own = (path: string) => new URL(`./tesseract/${path}`, location.href).href;
  const worker = await createWorker('deu', 1, {
    workerPath: own('worker.min.js'),
    corePath: own('core'),
    langPath: own('lang'),
    // direkt laden statt über eine Blob-Adresse, die wiederum fremden Code nachlädt
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
