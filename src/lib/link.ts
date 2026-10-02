/** Why a booking link can't be put in an invite, or null if it's fine. */
export function schedulingLinkProblem(link: string | undefined | null): string | null {
  const l = (link ?? "").trim();
  if (!l) return "SCHEDULING_LINK is not set.";
  let url: URL;
  try {
    url = new URL(l);
  } catch {
    return `SCHEDULING_LINK ("${l.slice(0, 40)}") is not a full web address. It must start with https://.`;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "SCHEDULING_LINK must be an https:// address.";
  if (/your[-_ ]?(link|name|handle|username|calendar|booking)|example\.(com|org)|placeholder|changeme|xxxx/i.test(l)) {
    return `SCHEDULING_LINK is still the placeholder (${l}).`;
  }
  return null;
}
