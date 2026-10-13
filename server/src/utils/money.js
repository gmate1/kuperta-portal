// Pénzügyi számítások fillérben (egész számként) – így nincs lebegőpontos hiba
// az összegzésnél. Kerekítés: tételenként, matematikai kerekítéssel.

const toCents = (n) => Math.round(Number(n) * 100);
const fromCents = (c) => c / 100;

/**
 * Egy árajánlat-tétel nettó / ÁFA / bruttó értéke.
 * nettó = mennyiség × egységár × (1 − kedvezmény%)
 */
export function calcLine({ quantity, unit_price, discount_pct = 0, vat_rate }) {
  const gross0 = Number(quantity) * toCents(unit_price); // kedvezmény előtti nettó, fillérben
  const netCents = Math.round((gross0 * (100 - Number(discount_pct))) / 100);
  const vatCents = Math.round((netCents * Number(vat_rate)) / 100);
  return {
    line_net: fromCents(netCents),
    line_vat: fromCents(vatCents),
    line_gross: fromCents(netCents + vatCents),
  };
}

/** Teljes ajánlat összesítése a tételekből. */
export function calcTotals(items) {
  let net = 0;
  let vat = 0;
  const lines = items.map((item) => {
    const l = calcLine(item);
    net += toCents(l.line_net);
    vat += toCents(l.line_vat);
    return { ...item, ...l };
  });
  return {
    lines,
    net_total: fromCents(net),
    vat_total: fromCents(vat),
    gross_total: fromCents(net + vat),
  };
}

/** Költség: nettóból ÁFA és bruttó. */
export function calcExpense(amount_net, vat_rate) {
  const netCents = toCents(amount_net);
  const vatCents = Math.round((netCents * Number(vat_rate)) / 100);
  return {
    amount_vat: fromCents(vatCents),
    amount_gross: fromCents(netCents + vatCents),
  };
}
