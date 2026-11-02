// Takeout escapes & < > " ' and uses &nbsp; / &emsp; for spacing; the rest of the table
// covers punctuation other exporters might write.
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: "\u00a0", ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009", zwnj: "\u200c", zwj: "\u200d",
  lrm: "\u200e", rlm: "\u200f", shy: "\u00ad",
  hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", minus: "\u2212",
  lsquo: "\u2018", rsquo: "\u2019", sbquo: "\u201a", ldquo: "\u201c", rdquo: "\u201d", bdquo: "\u201e",
  laquo: "\u00ab", raquo: "\u00bb", lsaquo: "\u2039", rsaquo: "\u203a",
  middot: "\u00b7", bull: "\u2022", deg: "\u00b0", plusmn: "\u00b1", times: "\u00d7", divide: "\u00f7",
  copy: "\u00a9", reg: "\u00ae", trade: "\u2122", sect: "\u00a7", para: "\u00b6", micro: "\u00b5",
  cent: "\u00a2", pound: "\u00a3", yen: "\u00a5", euro: "\u20ac", curren: "\u00a4",
  iexcl: "\u00a1", iquest: "\u00bf", brvbar: "\u00a6", not: "\u00ac", macr: "\u00af", acute: "\u00b4",
  uml: "\u00a8", cedil: "\u00b8", ordf: "\u00aa", ordm: "\u00ba", sup1: "\u00b9", sup2: "\u00b2",
  sup3: "\u00b3", frac14: "\u00bc", frac12: "\u00bd", frac34: "\u00be", dagger: "\u2020", Dagger: "\u2021",
  permil: "\u2030", prime: "\u2032", Prime: "\u2033", larr: "\u2190", rarr: "\u2192", uarr: "\u2191",
  darr: "\u2193", harr: "\u2194", hearts: "\u2665", star: "\u2606",
};

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,8}));/g;

/** Decodes HTML character references (named and numeric). */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY, (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name !== undefined) return NAMED[name] ?? match;
    const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex ?? "", 16);
    if (code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "\ufffd";
    return String.fromCodePoint(code);
  });
}
