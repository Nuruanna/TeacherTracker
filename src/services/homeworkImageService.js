import { supabase, supabaseConfigurationError } from '../lib/supabase';

export const HOMEWORK_IMAGE_BUCKET = 'homework-images';
export const MAX_HOMEWORK_IMAGES = 5;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const HEIC_MIME = /^image\/(heic|heif)(?:-sequence)?$/i;
const HEIC_EXTENSION = /\.(heic|heif)$/i;
const STANDARD_IMAGE_MIME = /^image\/(jpeg|png|webp)$/i;
const STANDARD_IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i;
const safeSegment = value => String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'unknown';
const developmentLog = (message, details) => {
  if (import.meta.env.DEV) console.info(`[homework images] ${message}`, details);
};
const fileDetails = file => ({
  extension: (file?.name?.match(/\.[^.]+$/)?.[0] || '').toLowerCase(),
  inputMimeType: file?.type || '(empty)',
  inputSize: file?.size || 0,
});
const stagedError = (stage, error, fallback) => {
  const wrapped = new Error(error?.message || fallback, { cause: error });
  wrapped.stage = stage;
  return wrapped;
};
async function authenticatedUser() {
  if (!supabase) throw new Error(supabaseConfigurationError);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error('Sign in again before managing homework images.');
  return data.user;
}

export function isSupportedHomeworkImage(file) {
  return STANDARD_IMAGE_MIME.test(file?.type || '')
    || STANDARD_IMAGE_EXTENSION.test(file?.name || '');
}
export function isHeicHomeworkImage(file) {
  return HEIC_MIME.test(file?.type || '') || HEIC_EXTENSION.test(file?.name || '');
}
export function buildHomeworkImagePath(userId, lesson, id) {
  return `${userId}/homework/${safeSegment(lesson.teachingGroupId)}/${safeSegment(lesson.date)}/${id}.jpg`;
}

const loadImage = blob => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened.')); };
  image.src = url;
});
const canvasBlob = (canvas, quality) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This image could not be optimized.')), 'image/jpeg', quality));

export async function optimizeHomeworkImage(file, outputName = `${crypto.randomUUID()}.jpg`) {
  if (isHeicHomeworkImage(file)) {
    const error = new Error('HEIC/HEIF images are not supported. Please use JPEG, PNG or WebP.');
    error.code = 'HEIC_NOT_SUPPORTED';
    throw error;
  }
  if (!isSupportedHomeworkImage(file)) throw new Error('Please use a JPEG, PNG or WebP image.');
  const details = fileDetails(file);
  developmentLog('Input selected.', details);
  let image;
  try {
    image = await loadImage(file);
  } catch (error) {
    developmentLog('Image optimization failed while decoding the selected image.', { message: error?.message, stack: error?.stack });
    throw stagedError('optimization', error, 'This image could not be optimized.');
  }
  let longEdge = Math.min(1800, Math.max(image.naturalWidth, image.naturalHeight));
  let output;
  let width;
  let height;
  for (const quality of [0.84, 0.76, 0.68]) {
    const scale = Math.min(1, longEdge / Math.max(image.naturalWidth, image.naturalHeight));
    width = Math.max(1, Math.round(image.naturalWidth * scale));
    height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    try {
      output = await canvasBlob(canvas, quality);
    } catch (error) {
      developmentLog('Image optimization failed while creating JPEG.', { message: error?.message, stack: error?.stack });
      throw stagedError('optimization', error, 'This image could not be optimized.');
    }
    if (output.size < MAX_UPLOAD_BYTES) break;
    longEdge = Math.round(longEdge * 0.82);
  }
  if (!output || output.size >= MAX_UPLOAD_BYTES) throw new Error('The optimized image is still larger than 5 MB.');
  const jpegFile = new File([output], outputName, { type: 'image/jpeg', lastModified: Date.now() });
  developmentLog('Image optimization succeeded.', { finalUploadMimeType: jpegFile.type, finalUploadSize: jpegFile.size, finalUploadName: jpegFile.name });
  return { blob: jpegFile, width, height, mimeType: 'image/jpeg' };
}

export async function uploadHomeworkImage(file, lesson) {
  const user = await authenticatedUser();
  const id = crypto.randomUUID();
  const optimized = await optimizeHomeworkImage(file, `${id}.jpg`);
  const storagePath = buildHomeworkImagePath(user.id, lesson, id);
  developmentLog('Supabase upload started.', { finalUploadMimeType: optimized.blob.type, finalUploadSize: optimized.blob.size, finalUploadName: optimized.blob.name });
  let error;
  try {
    ({ error } = await supabase.storage.from(HOMEWORK_IMAGE_BUCKET).upload(storagePath, optimized.blob, { contentType: 'image/jpeg', upsert: false }));
  } catch (uploadError) {
    developmentLog('Supabase upload failed.', { message: uploadError?.message, stack: uploadError?.stack });
    throw stagedError('upload', uploadError, 'The image could not be uploaded.');
  }
  if (error) {
    developmentLog('Supabase upload failed.', { message: error.message, status: error.status, code: error.code });
    throw stagedError('upload', error, 'The image could not be uploaded.');
  }
  developmentLog('Supabase upload succeeded.', { finalUploadMimeType: optimized.blob.type, finalUploadSize: optimized.blob.size });
  const { data } = supabase.storage.from(HOMEWORK_IMAGE_BUCKET).getPublicUrl(storagePath);
  return { id, kind: 'image', bucket: HOMEWORK_IMAGE_BUCKET, storagePath, publicUrl: data.publicUrl, mimeType: optimized.mimeType, width: optimized.width, height: optimized.height, size: optimized.blob.size, originalName: file.name || 'homework image', createdAt: new Date().toISOString() };
}

export async function deleteHomeworkImage(material) {
  const user = await authenticatedUser();
  if (material.bucket !== HOMEWORK_IMAGE_BUCKET || !material.storagePath?.startsWith(`${user.id}/`)) throw new Error('This homework image cannot be removed by the current user.');
  const { error } = await supabase.storage.from(HOMEWORK_IMAGE_BUCKET).remove([material.storagePath]);
  if (error) throw error;
}
