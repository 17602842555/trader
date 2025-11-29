

import { ApiConfig, AssetBalance, Ticker, OrderRequest, Order, Position, TradeHistoryItem, AssetHistory, Instrument, TimePeriod, Candle, CandleInterval, AmendOrderRequest } from '../types';
import { generateSignature } from './cryptoUtils';
import { GitHubService } from './githubService';

const BASE_URL = 'https://www.okx.com';

// Local Storage Keys
const HISTORY_KEY = 'okx_asset_history_points';

export class OKXService {
  private config: ApiConfig;
  private githubService: GitHubService | null = null;
  public exchangeRates = {
      USD: 1,
      CNY: 7.2, // Default fallback
      BTC: 0.000015 // Default fallback
  };

  constructor(config: ApiConfig) {
    this.config = config;
    if (config.githubToken) {
        this.githubService = new GitHubService(config.githubToken);
    }
  }

  private hasKeys(): boolean {
      return !!(this.config.apiKey && this.config.secretKey && this.config.passphrase);
  }

  private async request(method: string, path: string, body: any = null) {
    const isPublic = path.includes('/public/') || path.includes('/market/');
    const hasAuth = this.hasKeys();

    // If private endpoint and no keys, fail early
    if (!isPublic && !hasAuth) {
        throw new Error("API Keys missing");
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only sign if we have keys (Public endpoints work without auth, but higher limits with auth)
    if (hasAuth) {
        const timestamp = new Date().toISOString();
        const bodyStr = body ? JSON.stringify(body) : '';
        const sign = await generateSignature(timestamp, method, path, bodyStr, this.config.secretKey);

        headers['OK-ACCESS-KEY'] = this.config.apiKey;
        headers['OK-ACCESS-SIGN'] = sign;
        headers['OK-ACCESS-TIMESTAMP'] = timestamp;
        headers['OK-ACCESS-PASSPHRASE'] = this.config.passphrase;
    }

    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        if (response.status === 429) {
             throw new Error("Too Many Requests (429). Please slow down.");
        }
        let errorMsg = response.statusText;
        try {
            const errJson = await response.json();
            // OKX standard error format: { code: string, msg: string, data: any }
            if (errJson && errJson.msg) {
                errorMsg = `${errJson.code}: ${errJson.msg}`;
            }
        } catch (parseError) {
            // If body is not JSON, use status text
        }
        throw new Error(`API Error ${response.status}: ${errorMsg}`);
      }

      return await response.json();
    } catch (error: any) {
      // console.error("API Call failed:", error.message);
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
          throw new Error("Network Error: Possible CORS issue or Connection failed.");
      }
      throw error;
    }
  }

  // --- PUBLIC API ---

  async fetchExchangeRates(): Promise<Record<string, number>> {
      try {
          // 1. Get USD to CNY
          const res = await this.request('GET', '/api/v5/market/exchange-rate');
          if (res?.data?.[0]?.usdCny) {
              this.exchangeRates.CNY = parseFloat(res.data[0].usdCny);
          }

          // 2. Get BTC Price (for simple BTC unit conversion)
          const btcRes = await this.request('GET', '/api/v5/market/ticker?instId=BTC-USDT');
          if (btcRes?.data?.[0]?.last) {
              this.exchangeRates.BTC = 1 / parseFloat(btcRes.data[0].last);
          }
      } catch (e) {
          console.warn("Failed to fetch exchange rates", e);
      }
      return { ...this.exchangeRates };
  }

  async getInstruments(type: 'SPOT' | 'SWAP' = 'SPOT'): Promise<Instrument[]> {
    try {
        const res = await this.request('GET', `/api/v5/public/instruments?instType=${type}`);
        if (res?.data) {
            return res.data.map((d: any) => ({
                instId: d.instId,
                baseCcy: d.baseCcy,
                quoteCcy: d.quoteCcy,
                instType: d.instType as 'SPOT' | 'SWAP',
                lever: d.lever, // Max leverage
                ctVal: d.ctVal // Contract Value
            }));
        }
        return [];
    } catch (e) { 
        console.warn("Falling back to default instruments due to API error", e);
        // Fallback minimal list if API fails, so UI doesn't crash completely
        const fallback: Instrument[] = [
            { instId: 'BTC-USDT', baseCcy: 'BTC', quoteCcy: 'USDT', instType: 'SPOT' },
            { instId: 'ETH-USDT', baseCcy: 'ETH', quoteCcy: 'USDT', instType: 'SPOT' },
        ];
        return fallback.filter(i => i.instType === type);
    }
  }

  async getMarketTickers(type: 'SPOT' | 'SWAP'): Promise<Ticker[]> {
    try {
        const res = await this.request('GET', `/api/v5/market/tickers?instType=${type}`);
        if (res?.data) {
            // Update BTC rate for conversion locally if main fetch failed
            const btc = res.data.find((d:any) => d.instId === 'BTC-USDT');
            if (btc) this.exchangeRates.BTC = 1 / parseFloat(btc.last);

            return res.data.map((d: any) => ({
                ...d,
                vol24h: d.vol24h || d.volCcy24h // fallback
            }));
        }
        return [];
    } catch(e) { return []; }
  }

  async getCandles(instId: string, bar: CandleInterval = '1D', after?: number): Promise<Candle[]> {
    try {
        let query = `/api/v5/market/history-candles?instId=${instId}&bar=${bar}&limit=100`;
        if (after) {
            // OKX API 'after' expects timestamp in MS to get data OLDER than this time
            // We pass the oldest time we have (which is 'after')
            query += `&after=${after * 1000}`;
        }
        
        const res = await this.request('GET', query);
        if (res?.data) {
            // API returns: [ts, open, high, low, close, vol, volCcy]
            // API returns Newest -> Oldest
            // Chart needs Oldest -> Newest
            return res.data.map((c: any) => ({
                time: parseInt(c[0]) / 1000,
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4])
            })).reverse(); 
        }
        return [];
    } catch(e) { return []; }
  }

  async getBalances(): Promise<AssetBalance[]> {
    if (!this.hasKeys()) return [];

    let balances: AssetBalance[] = [];
    try {
        const res = await this.request('GET', '/api/v5/account/balance');
        if (res?.data?.[0]) {
            balances = res.data[0].details.map((d: any) => ({
            ccy: d.ccy,
            availBal: d.availBal,
            frozenBal: d.frozenBal,
            eqUsd: d.eqUsd,
            }));
        }
    } catch (e) { 
        // silently fail for balances
    }

    // Record total equity for history
    this.recordAssetHistory(balances);
    return balances;
  }

  private recordAssetHistory(balances: AssetBalance[]) {
      if (balances.length === 0) return;
      const totalEq = balances.reduce((acc, curr) => acc + parseFloat(curr.eqUsd), 0);
      const point: AssetHistory = { ts: Date.now().toString(), totalEq };
      
      try {
        const stored = localStorage.getItem(HISTORY_KEY);
        let history: AssetHistory[] = stored ? JSON.parse(stored) : [];
        
        // Add new point only if more than 1 hour passed or empty
        const last = history[history.length - 1];
        if (!last || (Date.now() - parseInt(last.ts) > 3600000)) {
            history.push(point);
            // Keep max 1000 points
            if (history.length > 1000) history = history.slice(-1000);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            
            // AUTO-SYNC: If token is configured, auto upload to Gist in background
            if (this.config.githubToken && this.githubService) {
                this.githubService.syncData(history)
                    .then(() => console.log("Auto-synced history to GitHub"))
                    .catch(e => console.warn("Auto-sync failed", e));
            }
        }
      } catch (e) { console.error("Failed to save history", e); }
  }

  // --- GitHub Sync Integration ---
  
  async syncHistoryWithGitHub(): Promise<AssetHistory[]> {
      if (!this.githubService) throw new Error("GitHub Token not configured");
      
      const stored = localStorage.getItem(HISTORY_KEY);
      const localHistory: AssetHistory[] = stored ? JSON.parse(stored) : [];
      
      const syncedHistory = await this.githubService.syncData(localHistory);
      
      // Update local storage with merged result
      localStorage.setItem(HISTORY_KEY, JSON.stringify(syncedHistory));
      
      return syncedHistory;
  }

  async getAssetHistory(period: TimePeriod): Promise<AssetHistory[]> {
    // ONLY return real recorded data.
    const stored = localStorage.getItem(HISTORY_KEY);
    let realHistory: AssetHistory[] = stored ? JSON.parse(stored) : [];
    
    // Filter by period
    const now = Date.now();
    let cutoff = now;
    if (period === '1D') cutoff = now - 24 * 60 * 60 * 1000;
    else if (period === '1W') cutoff = now - 7 * 24 * 60 * 60 * 1000;
    else if (period === '1M') cutoff = now - 30 * 24 * 60 * 60 * 1000;
    else if (period === '3M') cutoff = now - 90 * 24 * 60 * 60 * 1000;

    return realHistory.filter(h => parseInt(h.ts) >= cutoff);
  }

  async getPositions(): Promise<Position[]> {
    if (!this.hasKeys()) return [];

    try {
      const [posRes, instRes] = await Promise.all([
          this.request('GET', '/api/v5/account/positions'),
          this.getInstruments('SWAP') // Fetch instrument info to get Contract Value
      ]);
      
      if (posRes?.data) {
          const positions: Position[] = posRes.data;
          // Merge ctVal
          return positions.map(p => {
              const inst = instRes.find(i => i.instId === p.instId);
              return {
                  ...p,
                  ctVal: inst?.ctVal || '1' // default 1 if not found
              };
          });
      }
      return [];
    } catch (e) { return []; }
  }

  async getTradeHistory(): Promise<TradeHistoryItem[]> {
    if (!this.hasKeys()) return [];
    try {
        // Fetch both SPOT and SWAP history in parallel
        const [spotRes, swapRes] = await Promise.all([
            this.request('GET', '/api/v5/trade/fills-history?instType=SPOT&limit=50'),
            this.request('GET', '/api/v5/trade/fills-history?instType=SWAP&limit=50')
        ]);
        
        const spotData = spotRes?.data || [];
        const swapData = swapRes?.data || [];
        
        // Merge and sort by timestamp descending
        const allData = [...spotData, ...swapData];
        return allData.sort((a: any, b: any) => parseInt(b.ts) - parseInt(a.ts));
    } catch(e) { return []; }
  }

  async getTicker(instId: string): Promise<Ticker> {
    const res = await this.request('GET', `/api/v5/market/ticker?instId=${instId}`);
    if (res?.data?.[0]) return res.data[0];
    throw new Error("No ticker data");
  }

  async placeOrder(order: OrderRequest): Promise<string> {
    if (!this.hasKeys()) throw new Error("Please configure API Keys in Settings");

    const endpoint = order.ordType === 'conditional' ? '/api/v5/trade/order-algo' : '/api/v5/trade/order';
    
    // Construct base payload
    let payload: any = {
      instId: order.instId,
      tdMode: order.tdMode,
      side: order.side,
      sz: order.sz
    };

    // Correctly handle posSide. It is mandatory for Long/Short mode.
    // For limit orders, we must pass it if we are in Long/Short mode.
    if (order.posSide) {
        payload.posSide = order.posSide;
    }

    if (order.ordType === 'conditional') {
        payload.ordType = 'conditional';
        payload.slTriggerPx = order.triggerPx;
        payload.slOrdPx = order.px ?? '-1';
    } else {
        payload.ordType = order.ordType;
        if (order.ordType !== 'market' && order.px) {
            payload.px = order.px;
        }
    }

    // Single order placement allows Object body in V5
    const res = await this.request('POST', endpoint, payload);
    if (res?.data?.[0]) {
        if (res.data[0].sCode !== '0') {
             throw new Error(res.data[0].sMsg || "Order placement failed");
        }
        return res.data[0].ordId || res.data[0].algoId;
    }
    throw new Error("Order failed");
  }

  /**
   * Cancel Order
   */
  async cancelOrder(instId: string, ordId?: string, algoId?: string): Promise<void> {
    if (!this.hasKeys()) return;
    
    if (!instId) throw new Error("Missing Instrument ID");

    // 1. Algo Order Cancellation (Strategy)
    if (algoId) {
        const body = { instId, algoId };
        await this.request('POST', '/api/v5/trade/cancel-algos', [body]);
        return;
    }

    // 2. Standard Order Cancellation
    if (ordId) {
        const body = { instId, ordId };
        await this.request('POST', '/api/v5/trade/cancel-order', body);
        return;
    }

    throw new Error("Missing Order ID");
  }

  /**
   * Amend Order
   */
  async amendOrder(req: AmendOrderRequest): Promise<void> {
    if (!this.hasKeys()) return;
    
    if (!req.instId) throw new Error("Missing Instrument ID");

    // 1. Algo Order Amendment (Strategy)
    if (req.algoId) {
         const body: any = {
             instId: req.instId,
             algoId: req.algoId
         };

         // Only include defined fields
         if (req.newSz) body.newSz = req.newSz;
         if (req.newTpTriggerPx) body.newTpTriggerPx = req.newTpTriggerPx;
         if (req.newTpOrdPx) body.newTpOrdPx = req.newTpOrdPx;
         if (req.newSlTriggerPx) body.newSlTriggerPx = req.newSlTriggerPx;
         if (req.newSlOrdPx) body.newSlOrdPx = req.newSlOrdPx;
         if (req.newTriggerPx) body.newTriggerPx = req.newTriggerPx;

         await this.request('POST', '/api/v5/trade/amend-algos', [body]);
         return;
    }

    // 2. Standard Order Amendment
    if (req.ordId) {
        const body: any = {
            instId: req.instId,
            ordId: req.ordId
        };
        
        if (req.newSz) body.newSz = req.newSz;
        if (req.newPx) body.newPx = req.newPx;
        
        await this.request('POST', '/api/v5/trade/amend-order', body);
        return;
    }

    throw new Error("Missing Order ID");
  }

  async setLeverage(instId: string, lever: string, mgnMode: 'cross' | 'isolated'): Promise<void> {
    if (!this.hasKeys()) return;
    try {
        await this.request('POST', '/api/v5/account/set-leverage', {
            instId,
            lever,
            mgnMode
        });
    } catch (e: any) {
        console.warn("Set Leverage Warning:", e.message);
        throw e;
    }
  }

  async getOpenOrders(instId?: string): Promise<Order[]> {
    if (!this.hasKeys()) return [];
    
    // Helper to fetch standard orders
    const fetchStandard = async (params: Record<string, string>): Promise<Order[]> => {
        try {
            const query = new URLSearchParams(params).toString();
            const res = await this.request('GET', `/api/v5/trade/orders-pending?${query}`);
            if (res?.data) {
                return res.data.map((o: any) => ({
                    ordId: o.ordId,
                    instId: o.instId,
                    side: o.side,
                    ordType: o.ordType,
                    px: o.px,
                    sz: o.sz,
                    state: o.state,
                    cTime: o.cTime,
                    triggerPx: undefined 
                }));
            }
        } catch (e) { 
            console.warn("Std fetch warning:", e); 
        }
        return [];
    };

    // Helper to fetch algo orders with specific parsing
    const fetchAlgo = async (params: Record<string, string>): Promise<Order[]> => {
        try {
            const query = new URLSearchParams(params).toString();
            const res = await this.request('GET', `/api/v5/trade/orders-algo-pending?${query}`);
            
            if (res?.data) {
                const algos: Order[] = [];
                res.data.forEach((o: any) => {
                    const common = {
                        ordId: o.algoId,
                        algoId: o.algoId,
                        instId: o.instId,
                        side: o.side,
                        ordType: o.ordType, // 'conditional', 'oco', 'trigger'
                        px: o.ordPx || '-1',
                        sz: o.sz,
                        state: o.state,
                        cTime: o.cTime
                    };

                    // Case 1: Standard Trigger (Conditional/Trigger)
                    if (o.triggerPx && o.triggerPx !== '-1') {
                        algos.push({ ...common, triggerPx: o.triggerPx });
                    }
                    
                    // Case 2: Stop Loss (SL) Component (OCO or attached SL)
                    if (o.slTriggerPx && o.slTriggerPx !== '-1') {
                        algos.push({ 
                            ...common, 
                            ordType: 'sl', 
                            triggerPx: o.slTriggerPx,
                            ordId: `${o.algoId}-sl` // Virtual ID for visual split
                        });
                    }

                    // Case 3: Take Profit (TP) Component (OCO or attached TP)
                    if (o.tpTriggerPx && o.tpTriggerPx !== '-1') {
                        algos.push({ 
                            ...common, 
                            ordType: 'tp', 
                            triggerPx: o.tpTriggerPx,
                            ordId: `${o.algoId}-tp` // Virtual ID for visual split
                        });
                    }
                });
                return algos;
            }
        } catch (e) {
            console.warn("Algo fetch warning:", e);
        }
        return [];
    };

    // Determine strategy based on instId availability
    const allOrders: Order[] = [];

    const types = instId ? 
        [instId.includes('SWAP') ? 'SWAP' : 'SPOT'] : 
        ['SPOT', 'SWAP'];

    for (const instType of types) {
        const baseParams: any = { instType };
        if (instId) baseParams.instId = instId;

        const stdOrders = await fetchStandard(baseParams);
        allOrders.push(...stdOrders);

        const condOrders = await fetchAlgo({ ...baseParams, ordType: 'conditional' });
        allOrders.push(...condOrders);

        const ocoOrders = await fetchAlgo({ ...baseParams, ordType: 'oco' });
        allOrders.push(...ocoOrders);

        const trigOrders = await fetchAlgo({ ...baseParams, ordType: 'trigger' });
        allOrders.push(...trigOrders);
    }

    return allOrders.sort((a, b) => parseInt(b.cTime) - parseInt(a.cTime));
  }
}
