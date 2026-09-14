export interface HostnameTemplateContext {
  name: string;
  worktree?: string;
}

const TEMPLATE_TOKEN = /\{\{(name|worktree)\}\}/g;
const VALID_TEMPLATE_TOKENS = new Set(["name", "worktree"]);

/**
 * Return whether a hostname template contains only supported placeholders.
 * Braces are otherwise invalid in hostnames, so rejecting them here gives a
 * clear configuration error instead of deferring it to hostname validation.
 */
export function isValidHostnameTemplate(template: string): boolean {
  for (const match of template.matchAll(/\{\{([^{}]*)\}\}/g)) {
    if (!VALID_TEMPLATE_TOKENS.has(match[1])) return false;
  }
  const literal = template.replace(TEMPLATE_TOKEN, "");
  return !literal.includes("{") && !literal.includes("}");
}

/**
 * Expand a hostname template. Empty placeholder values remove their complete
 * dot-delimited label, allowing `{{worktree}}.{{name}}` to work in both a
 * linked worktree and the primary checkout.
 */
export function renderHostnameTemplate(template: string, context: HostnameTemplateContext): string {
  const expanded = template.replace(TEMPLATE_TOKEN, (_match, token: "name" | "worktree") => {
    if (token === "name") return context.name;
    return context.worktree ?? "";
  });

  return expanded.split(".").filter(Boolean).join(".");
}
