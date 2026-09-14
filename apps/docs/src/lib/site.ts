export const siteUrl = "https://labelhost.sh";
export const siteName = "labelhost";
export const siteDescription =
  "Replace port numbers with stable, named .localhost URLs. For humans and agents.";

export function canonicalUrlFor(href: string): string {
  return `${siteUrl}${href === "/" ? "" : href}`;
}
