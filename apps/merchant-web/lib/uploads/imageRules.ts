// Shared client-side mirror of the backend B5 IMAGE_RULES
// (src/api/merchant/upload/service.ts) plus the FIXED aspect ratio each kind's
// crop is locked to. Lives outside file-upload.tsx and ImageCropModal.tsx so both
// can import it without a circular dependency between the two components.
//
// The aspect ratios are exactly the backend minimum dimensions (1600/600,
// 1200/600), so a crop that fills the frame at >= the minimum pixel size
// automatically satisfies the backend's shape check too: 'square' requires
// width === height (aspect 1 does this by construction); 'landscape' requires
// width > height (aspect > 1 does this by construction, for any non-degenerate
// crop size).

export type UploadKind = 'logo' | 'banner' | 'photo'

export interface ImageCropRule {
  /** width / height, fixed for the crop UI (matches the backend minimum ratio). */
  aspect: number
  minWidth: number
  minHeight: number
  shape: 'square' | 'landscape'
  /** Human-readable statement of the backend rule, for inline guard copy. */
  requirement: string
}

export const IMAGE_CROP_RULES: Readonly<Record<UploadKind, ImageCropRule>> = {
  logo: {
    aspect: 1,
    minWidth: 512,
    minHeight: 512,
    shape: 'square',
    requirement: 'Logos must be square, at least 512x512 pixels.',
  },
  banner: {
    aspect: 1600 / 600,
    minWidth: 1600,
    minHeight: 600,
    shape: 'landscape',
    requirement: 'Banners must be landscape, at least 1600x600 pixels.',
  },
  photo: {
    aspect: 1200 / 600,
    minWidth: 1200,
    minHeight: 600,
    shape: 'landscape',
    requirement: 'Photos must be landscape, at least 1200x600 pixels.',
  },
}

export const IMAGE_KIND_LABEL: Readonly<Record<UploadKind, string>> = {
  logo: 'logo',
  banner: 'banner',
  photo: 'photo',
}
