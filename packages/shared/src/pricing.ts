import { Decimal, percentOf, roundMoney, sumMoney } from './money';
import { isoWeekday, stayNights } from './dates';

export interface PriceRule {
  /** Inclusive start date. */
  startDate: string;
  /** Exclusive end date. */
  endDate: string;
  /** ISO weekdays this rule applies to (1=Mon..7=Sun). Empty = all days. */
  weekdays: number[];
  amount: Decimal.Value;
  extraAdultAmount?: Decimal.Value;
  extraChildAmount?: Decimal.Value;
  /** Higher priority wins when rules overlap. */
  priority: number;
}

export interface PriceQuoteInput {
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  /** Adults included in the base price. */
  baseOccupancy: number;
  rules: PriceRule[];
  taxPercent: Decimal.Value;
  serviceChargePercent: Decimal.Value;
  discountPercent?: Decimal.Value;
  decimals?: number;
}

export interface NightPrice {
  date: string;
  amount: string;
}

export interface PriceQuote {
  nights: NightPrice[];
  roomTotal: string;
  discount: string;
  serviceCharge: string;
  tax: string;
  grandTotal: string;
}

export class PricingError extends Error {
  constructor(public readonly code: string, public readonly date?: string) {
    super(code);
  }
}

/** Selects the applicable rule for a night: highest priority, then latest start date. */
export function ruleForNight(rules: PriceRule[], date: string): PriceRule | undefined {
  const weekday = isoWeekday(date);
  return rules
    .filter((r) => r.startDate <= date && date < r.endDate && (r.weekdays.length === 0 || r.weekdays.includes(weekday)))
    .sort((a, b) => b.priority - a.priority || (a.startDate < b.startDate ? 1 : -1))[0];
}

/**
 * Computes a full stay quote. Service charge is applied to the discounted room total;
 * tax is applied to the discounted room total plus service charge.
 */
export function quoteStay(input: PriceQuoteInput): PriceQuote {
  const decimals = input.decimals ?? 2;
  const dates = stayNights(input.arrival, input.departure);
  if (dates.length === 0) throw new PricingError('INVALID_STAY_DATES');
  const extraAdults = Math.max(0, input.adults - input.baseOccupancy);
  const nights: NightPrice[] = dates.map((date) => {
    const rule = ruleForNight(input.rules, date);
    if (!rule) throw new PricingError('NO_RATE_FOR_DATE', date);
    const amount = new Decimal(rule.amount)
      .plus(new Decimal(rule.extraAdultAmount ?? 0).times(extraAdults))
      .plus(new Decimal(rule.extraChildAmount ?? 0).times(input.children));
    return { date, amount: roundMoney(amount, decimals).toFixed(decimals) };
  });
  const roomTotal = sumMoney(nights.map((n) => n.amount));
  const discount = percentOf(roomTotal, input.discountPercent ?? 0, decimals);
  const net = roomTotal.minus(discount);
  const serviceCharge = percentOf(net, input.serviceChargePercent, decimals);
  const tax = percentOf(net.plus(serviceCharge), input.taxPercent, decimals);
  const grandTotal = net.plus(serviceCharge).plus(tax);
  return {
    nights,
    roomTotal: roomTotal.toFixed(decimals),
    discount: discount.toFixed(decimals),
    serviceCharge: serviceCharge.toFixed(decimals),
    tax: tax.toFixed(decimals),
    grandTotal: grandTotal.toFixed(decimals),
  };
}

export interface CancellationPolicy {
  /** Free cancellation until this many hours before arrival (property local check-in time). */
  freeCancellationHours: number;
  /** Nights charged when cancelling after the free window. */
  penaltyNights: number;
  refundable: boolean;
}

/** Cancellation fee given the policy and hours remaining until arrival. */
export function cancellationFee(
  policy: CancellationPolicy,
  nightly: NightPrice[],
  hoursUntilArrival: number,
  grandTotal: Decimal.Value,
): Decimal {
  if (!policy.refundable) return new Decimal(grandTotal);
  if (hoursUntilArrival >= policy.freeCancellationHours) return new Decimal(0);
  const charged = nightly.slice(0, Math.max(0, policy.penaltyNights));
  return sumMoney(charged.map((n) => n.amount));
}
