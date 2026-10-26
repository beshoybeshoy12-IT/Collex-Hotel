import Decimal from 'decimal.js';

/** All money arithmetic uses decimal.js. Never use JS floating point for amounts. */
export { Decimal };

export type MoneyInput = Decimal.Value;

export function money(value: MoneyInput): Decimal {
  return new Decimal(value);
}

/** Round to the currency's minor unit using banker-safe half-up rounding. */
export function roundMoney(value: MoneyInput, decimals = 2): Decimal {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));
}

/** Percentage of an amount, rounded. */
export function percentOf(amount: MoneyInput, percent: MoneyInput, decimals = 2): Decimal {
  return roundMoney(new Decimal(amount).times(percent).dividedBy(100), decimals);
}

/** Minor units for common currencies (ISO 4217). */
export function currencyDecimals(currency: string): number {
  const zero = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX'];
  const three = ['KWD', 'BHD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'];
  if (zero.includes(currency)) return 0;
  if (three.includes(currency)) return 3;
  return 2;
}

export function toMoneyString(value: MoneyInput, currency = 'USD'): string {
  return roundMoney(value, currencyDecimals(currency)).toFixed(currencyDecimals(currency));
}
