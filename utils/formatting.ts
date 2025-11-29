
export const formatPrice = (price: string | number): string => {
  const val = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(val)) return '--';

  if (val === 0) return '0.00';

  const absVal = Math.abs(val);

  // Very small numbers (e.g. SHIB, PEPE)
  if (absVal < 0.0001) return val.toFixed(8);
  if (absVal < 0.01) return val.toFixed(6);
  if (absVal < 1) return val.toFixed(4);
  if (absVal < 100) return val.toFixed(3);
  
  // Standard prices
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatAmount = (amount: string | number): string => {
  const val = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(val)) return '--';
  
  const absVal = Math.abs(val);

  if (absVal > 1000) return val.toFixed(0);
  if (absVal > 1) return val.toFixed(2);
  if (absVal === 0) return '0.00';
  return val.toFixed(4);
};

export const formatPct = (pct: number): string => {
    return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
};

export const formatNumberForApi = (num: number | string): string | null => {
  if (num === '' || num === undefined || num === null) return null;
  const n = Number(num);
  if (isNaN(n) || !isFinite(n)) return null;

  // Avoid scientific notation (e.g. 1e-7) which breaks JSON
  if (Math.abs(n) < 1.0) {
      const e = parseInt(n.toString().split('e-')[1]);
      if (e) {
          return n.toFixed(e + 2).replace(/\.?0+$/, "");
      }
      return n.toFixed(10).replace(/\.?0+$/, "");
  }
  
  // For standard numbers, remove grouping/commas and limit decimals to 10 to be safe
  return n.toFixed(10).replace(/\.?0+$/, "");
};

/**
 * Calculate Estimated PnL
 * @param entryPrice Average entry price
 * @param exitPrice Target exit price (TP/SL)
 * @param size Position size (in coins/contracts)
 * @param side Position side
 * @param contractVal Value of one contract (default 1 for Spot)
 */
export const calculatePnL = (entryPrice: number, exitPrice: number, size: number, side: 'long' | 'short' | 'net', contractVal: number = 1): number => {
    const q = size * contractVal;
    if (side === 'long' || side === 'net') return (exitPrice - entryPrice) * q;
    // Short: Entry - Exit
    return (entryPrice - exitPrice) * q;
};
