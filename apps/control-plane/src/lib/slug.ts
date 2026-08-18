import slugify from 'slugify';
import crypto from 'node:crypto';

/**
 * Produces a predictable unique slug: slugified name + short random suffix.
 * The suffix guarantees uniqueness even for repeated org names.
 */
export function generateSlug(name: string): string {
  const base = slugify(name, { lower: true, strict: true }) || 'org';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}
