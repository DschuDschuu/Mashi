/**
 * Texterkennung für Kassenbon-Screenshots – läuft komplett im Browser, das Bild verlässt
 * das Gerät nicht. Die Bibliothek (Tesseract) und das deutsche Sprachmodell werden erst beim
 * ersten Import geladen (einige MB) und danach vom Browser zwischengespeichert.
 */
export async function recognizeText(image: Blob, onProgress: (share: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('deu', 1, {
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
