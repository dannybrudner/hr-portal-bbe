/**
 * Shared email utilities — used by all API email routes.
 * Never import this in client components.
 */

/** Escape user-controlled strings before inserting into HTML email bodies. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/** Replace {{var}} tokens in a template. Values are HTML-escaped. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? escapeHtml(vars[key]) : `{{${key}}}`
  )
}
