import { describe, expect, it } from 'vitest';
import { buildHomeworkImagePath, HOMEWORK_IMAGE_BUCKET, isHeicHomeworkImage, isSupportedHomeworkImage, MAX_HOMEWORK_IMAGES, MAX_UPLOAD_BYTES } from './homeworkImageService';

describe('homework image storage rules', () => {
  it('accepts only the configured browser-friendly image types', () => {
    for (const [name, type] of [['page.jpg','image/jpeg'],['page.png','image/png'],['page.webp','image/webp']]) {
      expect(isSupportedHomeworkImage({ name, type })).toBe(true);
    }
    for (const [name, type] of [['phone.heic','image/heic'],['phone.heif','image/heif'],['burst.heic','image/heic-sequence'],['phone.HEIC',''],['phone.HEIF','application/octet-stream']]) {
      expect(isSupportedHomeworkImage({ name, type })).toBe(false);
    }
    expect(isSupportedHomeworkImage({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false);
  });

  it('detects HEIC/HEIF independently by MIME type or filename extension', () => {
    expect(isHeicHomeworkImage({ name: 'capture.bin', type: 'image/heic-sequence' })).toBe(true);
    expect(isHeicHomeworkImage({ name: 'capture.bin', type: 'image/heif-sequence' })).toBe(true);
    expect(isHeicHomeworkImage({ name: 'IMG_1234.HEIC', type: '' })).toBe(true);
    expect(isHeicHomeworkImage({ name: 'IMG_1234.HEIF', type: 'application/octet-stream' })).toBe(true);
    expect(isHeicHomeworkImage({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
  });

  it('builds an owner-first randomized path without using the original filename', () => {
    const userId = '123e4567-e89b-42d3-a456-426614174000';
    expect(buildHomeworkImagePath(userId, { teachingGroupId: 'grade 3/A', date: '2026-09-15' }, 'image-uuid')).toBe(`${userId}/homework/grade-3-A/2026-09-15/image-uuid.jpg`);
    expect(HOMEWORK_IMAGE_BUCKET).toBe('homework-images');
    expect(MAX_HOMEWORK_IMAGES).toBe(5);
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
  });
});
