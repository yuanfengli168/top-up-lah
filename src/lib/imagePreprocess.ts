// Image preprocessing for better OCR accuracy
// Runs in the browser using Canvas API — no extra dependencies

export interface PreprocessOptions {
  maxDimension?: number;     // resize so largest side is at most this (default 2000)
  contrast?: number;          // -100 to 100, 0 = no change (default 0 — off)
  brightness?: number;        // -100 to 100, 0 = no change (default 0 — off)
  grayscale?: boolean;        // convert to grayscale (default false)
  autoRotate?: boolean;       // try to detect rotation and fix (default true)
}

/**
 * Preprocess an image file for better OCR results.
 * Returns a data URL ready to be passed to Tesseract.
 *
 * IMPORTANT: Conservative by default. Tesseract usually works best on the
 * original image, and over-processing (grayscale, contrast) can destroy detail
 * on small / blurry photos. Only auto-rotation is on by default.
 */
export async function preprocessImage(
  file: File,
  options: PreprocessOptions = {}
): Promise<string> {
  const {
    maxDimension = 2000,
    contrast = 0,
    brightness = 0,
    grayscale = false,
  } = options;

  // Load image
  const img = await loadImage(file);

  // Detect orientation from EXIF and apply
  // (Most modern phones embed rotation in EXIF, not in the pixels)
  const exifRotation = await getExifRotation(file);
  const rotated = exifRotation !== 0
    ? await rotateImage(img, exifRotation)
    : imgToCanvas(img);

  // Resize only if image is huge
  const resized = (rotated.width > maxDimension || rotated.height > maxDimension)
    ? resizeImage(rotated, maxDimension)
    : rotated;

  // Apply filters only if any are non-zero
  const needsFilters = contrast !== 0 || brightness !== 0 || grayscale;
  const processed = needsFilters
    ? applyFilters(resized, { contrast, brightness, grayscale })
    : resized;

  // Log diagnostics so we can see what's happening
  console.log('[OCR preprocess]', {
    original: `${img.width}x${img.height}`,
    exifRotation,
    afterResize: `${resized.width}x${resized.height}`,
    filters: { contrast, brightness, grayscale },
  });

  // Export as data URL (PNG for lossless, JPEG only if we resized)
  const wasResized = resized !== rotated;
  return wasResized || needsFilters
    ? processed.toDataURL('image/png')
    : processed.toDataURL('image/png');
}

function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return canvas;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Read EXIF orientation (values 1-8 per the EXIF spec).
 * Returns rotation in degrees needed to make the image upright.
 * Returns 0 if no EXIF data or orientation is "normal".
 */
async function getExifRotation(file: File): Promise<number> {
  try {
    const buffer = await file.slice(0, 65536).arrayBuffer(); // EXIF is in first 64KB
    const view = new DataView(buffer);
    // Check JPEG magic bytes
    if (view.getUint16(0) !== 0xFFD8) return 0;

    let offset = 2;
    while (offset < view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xFF00) !== 0xFF00) break;
      if (marker === 0xFFE1) {
        // APP1 (EXIF) marker
        const length = view.getUint16(offset + 2);
        const exifStart = offset + 4;
        // Look for "Exif\0\0"
        if (view.getUint32(exifStart) === 0x45786966) {
          const tiffStart = exifStart + 6;
          const littleEndian = view.getUint16(tiffStart) === 0x4949;
          const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
          const numEntries = view.getUint16(tiffStart + ifdOffset, littleEndian);
          for (let i = 0; i < numEntries; i++) {
            const entryOffset = tiffStart + ifdOffset + 2 + i * 12;
            const tag = view.getUint16(entryOffset, littleEndian);
            if (tag === 0x0112) { // Orientation tag
              const value = view.getUint16(entryOffset + 8, littleEndian);
              // Map EXIF orientation to degrees of rotation
              // 1 = normal, 3 = 180, 6 = 90 CW, 8 = 90 CCW
              const map: Record<number, number> = {
                1: 0, 2: 0, 3: 180, 4: 180, 5: 0, 6: 90, 7: 90, 8: 270,
              };
              return map[value] || 0;
            }
          }
        }
        offset += 2 + length;
      } else {
        const length = view.getUint16(offset + 2);
        offset += 2 + length;
      }
    }
  } catch {
    // Silently fail — no EXIF, just return 0
  }
  return 0;
}

async function rotateImage(img: HTMLImageElement, degrees: number): Promise<HTMLCanvasElement> {
  if (degrees === 0) {
    // Just blit to canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  const radians = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const w = img.width * cos + img.height * sin;
  const h = img.width * sin + img.height * cos;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(radians);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas;
}

function resizeImage(canvas: HTMLCanvasElement, maxDimension: number): HTMLCanvasElement {
  const { width, height } = canvas;
  if (width <= maxDimension && height <= maxDimension) return canvas;

  const scale = Math.min(maxDimension / width, maxDimension / height);
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);

  const resized = document.createElement('canvas');
  resized.width = newW;
  resized.height = newH;
  const ctx = resized.getContext('2d')!;
  // Use high-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, newW, newH);
  return resized;
}

function applyFilters(
  canvas: HTMLCanvasElement,
  { contrast, brightness, grayscale }: { contrast: number; brightness: number; grayscale: boolean }
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Contrast factor: (259 * (C + 255)) / (255 * (259 - C))
  const c = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const b = brightness;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let bl = data[i + 2];

    // Apply brightness
    r += b;
    g += b;
    bl += b;

    // Apply contrast
    r = c * (r - 128) + 128;
    g = c * (g - 128) + 128;
    bl = c * (bl - 128) + 128;

    // Grayscale using luminance formula
    if (grayscale) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = g = bl = lum;
    }

    // Clamp
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, bl));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}