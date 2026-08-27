import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBlockThenUploadPendingImages, pendingImagesFromInput } from './StudyMaterialsAdmin';

describe('new Study Material block image flow', () => {
  it('captures pending files before the native input is cleared', () => {
    const first = { name: 'one.jpg' };
    const second = { name: 'two.png' };
    const input = { files: [first, second] };
    const captured = pendingImagesFromInput(input);
    input.files = [];
    expect(captured).toEqual([first, second]);
  });

  it('creates the block before uploading every pending image with its real id', async () => {
    const calls = [];
    const images = [{ name: 'one.jpg' }, { name: 'two.png' }];
    const createBlock = vi.fn(async () => { calls.push('create'); return { id: 'new-block' }; });
    const uploadImage = vi.fn(async (sectionId, blockId, image) => { calls.push(`upload:${blockId}:${image.name}`); });
    await createBlockThenUploadPendingImages({ sectionId: 'section', category: 'grammar', values: { title: 'Rule' }, images, createBlock, uploadImage });
    expect(calls).toEqual(['create', 'upload:new-block:one.jpg', 'upload:new-block:two.png']);
  });

  it('does not upload when block creation fails', async () => {
    const uploadImage = vi.fn();
    await expect(createBlockThenUploadPendingImages({ sectionId: 'section', category: 'extra', values: {}, images: [{}], createBlock: vi.fn(async () => { throw new Error('create failed'); }), uploadImage })).rejects.toThrow('create failed');
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('marks image failures as occurring after a safely created block', async () => {
    const created = { id: 'new-block' };
    await expect(createBlockThenUploadPendingImages({ sectionId: 'section', category: 'vocabulary', values: {}, images: [{}], createBlock: vi.fn(async () => created), uploadImage: vi.fn(async () => { throw new Error('upload failed'); }) })).rejects.toMatchObject({ createdBlock: created });
  });
});

describe('Study Materials section title source', () => {
  it('renders the synchronized display title without a manual Section title editor', () => {
    const source = readFileSync(new URL('./StudyMaterialsAdmin.jsx', import.meta.url), 'utf8');
    expect(source).toContain('section.display_title || section.label');
    expect(source).not.toContain('Section title');
    expect(source).not.toContain('updateCourseSectionDisplayTitle');
  });
});

describe('pending image preview lifecycle', () => {
  it('creates and revokes the blob URL in the same effect lifecycle for Strict Mode safety', () => {
    const source = readFileSync(new URL('./StudyMaterialsAdmin.jsx', import.meta.url), 'utf8');
    expect(source).toContain('const objectUrl = URL.createObjectURL(file)');
    expect(source).toContain('return () => URL.revokeObjectURL(objectUrl)');
    expect(source).not.toContain("useMemo(() => file ? URL.createObjectURL(file)");
  });
});
