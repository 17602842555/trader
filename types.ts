

// API Configuration Types
export interface ApiConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  language: 'en' | 'zh';
  theme: 'dark' | 'light';
  refreshInterval: number; // in milliseconds
  colorMode: 'standard' | 'reverse'; // standard: Green Up/Red Down, reverse: Red Up/Green Down
  alerts: AssetAlert[];
  githubToken?: string; // For syncing data to GitHub Gists
}

export interface AssetAlert {
  ccy: string;
  min: string;
  max: string;
  enabled: boolean;
}

// Asset Types
export interface AssetBalance {
  ccy: string;
  availBal: string;
  frozenBal: string;
  eqUsd: string; // Equity in USD
}

export interface AssetHistory {
  ts: string;
  totalEq: number;
}

// Position Types
export interface Position {
  instId: string;
  posSide: 'long' | 'short' | 'net';
  pos: string; // Size
  avgPx: string;
  upl: string; // Unrealized PnL
  uplRatio: string;
  mgnMode: 'cross' | 'isolated';
  ccy: string; // Margin currency
  lever?: string; // Leverage
  ctVal?: string; // Contract Value (e.g. 0.01 BTC per contract)
}

// Market Data
export interface Instrument {
  instId: string;
  baseCcy: string;
  quoteCcy: string;
  instType: 'SPOT' | 'SWAP';
  lever?: string; // Max leverage
  ctVal?: string; // Contract value
}

export interface Ticker {
  instId: string;
  last: string;
  open24h: string;
  askPx: string;
  bidPx: string;
  volCcy24h: string; // Volume in Coin
  vol24h: string; // Volume in USD estimate or contracts
  ts: string;
  sodUtc0: string; // Start of day price
}

export interface Candle {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type CandleInterval = '1m' | '5m' | '15m' | '1H' | '4H' | '1D' | '1W';

// Order Types
export interface OrderRequest {
  instId: string;
  tdMode: 'cash' | 'cross' | 'isolated';
  side: 'buy' | 'sell';
  posSide?: 'long' | 'short' | 'net'; // Required for Long/Short mode
  ordType: 'limit' | 'market' | 'conditional';
  px?: string; // Price (required for limit)
  sz: string; // Size
  triggerPx?: string; // For conditional orders
}

export interface AmendOrderRequest {
  instId: string;
  cldOrdId?: string;
  ordId?: string;
  algoId?: string;
  newSz?: string;
  newPx?: string; // For Limit order price
  newTpTriggerPx?: string; // For Take Profit trigger price
  newTpOrdPx?: string; // For Take Profit order price
  newSlTriggerPx?: string; // For Stop Loss trigger price
  newSlOrdPx?: string; // For Stop Loss order price
  newTriggerPx?: string; // For generic trigger/conditional orders
}

export interface Order {
  ordId: string;
  algoId?: string; // For strategy orders
  instId: string;
  side: 'buy' | 'sell';
  ordType: 'limit' | 'market' | 'conditional' | 'sl' | 'tp' | 'oco' | 'trigger';
  px: string;
  triggerPx?: string; // Trigger price for SL/TP
  sz: string;
  state: 'live' | 'filled' | 'canceled' | 'partially_filled';
  cTime: string;
}

export interface TradeHistoryItem {
  fillId: string;
  instId: string;
  side: 'buy' | 'sell';
  fillPx: string;
  fillSz: string;
  fee: string;
  ts: string;
  pnl: string; // Realized PnL
}

// UI State Types
export type ViewMode = 'dashboard' | 'trade' | 'history' | 'settings';
export type TimePeriod = '1D' | '1W' | '1M' | '3M';
export type CurrencyUnit = 'USD' | 'CNY' | 'BTC';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

// Callbacks
export type PriceClickCallback = (price: string) => void;
export type AlgoOrderCallback = (type: 'sl' | 'tp', price: string) => void;
