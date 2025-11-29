import { ApiConfig, AssetBalance, Ticker, OrderRequest, Order, Position, TradeHistoryItem, AssetHistory, Instrument, TimePeriod, Candle, CandleInterval, AmendOrderRequest } from '../types';
import { generateSignature } from './cryptoUtils';
import { GitHubService } from './githubService';

const BASE_URL = 'https://www.okx.com';
const HISTORY_KEY = 'okx_asset_history_points';

export class OKXService {
  private config: ApiConfig;
  private githubService: GitHubService | null = null;
  public exchangeRates = {
      USD: 1,
      CNY: 7.2,
      BTC: 0.000015
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

    if (!isPublic && !hasAuth) {
        throw new Error("API Keys missing");
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

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
        let errorMsg = response.statusText;
        try {
            const errJson = await response.json();
            if (errJson && errJson.msg) errorMsg = `${errJson.code}: ${errJson.msg}`;
        } catch (e) {}
        throw new Error(`API Error ${response.status}: ${errorMsg}`);
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
          throw new Error("Network Error: Possible CORS issue or Connection failed.");
      }
      throw error;
    }
  }

  async fetchExchangeRates(): Promise<Record<string, number>> {
      try {
          const res = await this.request('GET', '/api/v5/market/exchange-rate');
          if (res?.data?.[0]?.usdCny) this.exchangeRates.CNY = parseFloat(res.data[0].usdCny);

          const btcRes = await this.request('GET', '/api/v5/market/ticker?instId=BTC-USDT');
          if (btcRes?.data?.[0]?.last) this.exchangeRates.BTC = 1 / parseFloat(btcRes.data[0].last);
      } catch (e) { console.warn("Failed to fetch rates", e); }
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
                lever: d.lever,
                ctVal: d.ctVal
            }));
        }
        return [];
    } catch (e) { return []; }
  }

  async getMarketTickers(type: 'SPOT' | 'SWAP'): Promise<Ticker[]> {
    try {
        const res = await this.request('GET', `/api/v5/market/tickers?instType=${type}`);
        if (res?.data) {
            return res.data.map((d: any) => ({ ...d, vol24h: d.vol24h || d.volCcy24h }));
        }
        return [];
    } catch(e) { return []; }
  }

  async getCandles(instId: string, bar: CandleInterval = '1D', after?: number): Promise<Candle[]> {
    try {
        let query = `/api/v5/market/history-candles?instId=${instId}&bar=${bar}&limit=100`;
        if (after) query += `&after=${after * 1000}`;
        
        const res = await this.request('GET', query);
        if (res?.data) {
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
    } catch (e) {}
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
        const last = history[history.length - 1];
        if (!last || (Date.now() - parseInt(last.ts) > 3600000)) {
            history.push(point);
            if (history.length > 1000) history = history.slice(-1000);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            if (this.config.githubToken && this.githubService) {
                this.githubService.syncData(history).catch(console.warn);
            }
        }
      } catch (e) {}
  }
  
  async syncHistoryWithGitHub(): Promise<AssetHistory[]> {
      if (!this.githubService) throw new Error("GitHub Token not configured");
      const stored = localStorage.getItem(HISTORY_KEY);
      const localHistory = stored ? JSON.parse(stored) : [];
      const syncedHistory = await this.githubService.syncData(localHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(syncedHistory));
      return syncedHistory;
  }

  async getAssetHistory(period: TimePeriod): Promise<AssetHistory[]> {
    const stored = localStorage.getItem(HISTORY_KEY);
    let realHistory: AssetHistory[] = stored ? JSON.parse(stored) : [];
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
          this.getInstruments('SWAP') 
      ]);
      if (posRes?.data) {
          const positions: Position[] = posRes.data;
          return positions.map(p => {
              const inst = instRes.find(i => i.instId === p.instId);
              return { ...p, ctVal: inst?.ctVal || '1' };
          });
      }
      return [];
    } catch (e) { return []; }
  }

  // NEW: Get Position History (Closed Positions) for accurate PnL
  async getPositionsHistory(): Promise<any[]> {
    if (!this.hasKeys()) return [];
    try {
        // Fetch Swap and Margin history. Spot trade history doesn't have 'realizedPnl' in same way.
        const [swapRes] = await Promise.all([
            this.request('GET', '/api/v5/account/positions-history?instType=SWAP&limit=100'),
            // Add MARGIN if needed
        ]);
        
        const data = swapRes?.data || [];
        return data.sort((a: any, b: any) => parseInt(b.uTime) - parseInt(a.uTime));
    } catch(e) { return []; }
  }

  // Keep legacy trade history for Spot fills
  async getTradeHistory(): Promise<TradeHistoryItem[]> {
    if (!this.hasKeys()) return [];
    try {
        const spotRes = await this.request('GET', '/api/v5/trade/fills-history?instType=SPOT&limit=50');
        return (spotRes?.data || []).sort((a: any, b: any) => parseInt(b.ts) - parseInt(a.ts));
    } catch(e) { return []; }
  }

  async getTicker(instId: string): Promise<Ticker> {
    const res = await this.request('GET', `/api/v5/market/ticker?instId=${instId}`);
    if (res?.data?.[0]) return res.data[0];
    throw new Error("No ticker data");
  }

  async placeOrder(order: OrderRequest): Promise<string> {
    if (!this.hasKeys()) throw new Error("Please configure API Keys");
    const endpoint = order.ordType === 'conditional' ? '/api/v5/trade/order-algo' : '/api/v5/trade/order';
    let payload: any = {
      instId: order.instId,
      tdMode: order.tdMode,
      side: order.side,
      sz: order.sz
    };
    if (order.posSide) payload.posSide = order.posSide;
    if (order.ordType === 'conditional') {
        payload.ordType = 'conditional';
        payload.slTriggerPx = order.triggerPx;
        payload.slOrdPx = order.px ?? '-1';
    } else {
        payload.ordType = order.ordType;
        if (order.ordType !== 'market' && order.px) payload.px = order.px;
    }
    const res = await this.request('POST', endpoint, payload);
    if (res?.data?.[0]) {
        if (res.data[0].sCode !== '0') throw new Error(res.data[0].sMsg || "Order placement failed");
        return res.data[0].ordId || res.data[0].algoId;
    }
    throw new Error("Order failed");
  }

  async cancelOrder(instId: string, ordId?: string, algoId?: string): Promise<void> {
    if (!this.hasKeys()) return;
    if (algoId) {
        await this.request('POST', '/api/v5/trade/cancel-algos', [{ instId, algoId }]);
    } else if (ordId) {
        await this.request('POST', '/api/v5/trade/cancel-order', { instId, ordId });
    }
  }

  async amendOrder(req: AmendOrderRequest): Promise<void> {
    if (!this.hasKeys()) return;
    if (req.algoId) {
         const body: any = { instId: req.instId, algoId: req.algoId };
         if (req.newSz) body.newSz = req.newSz;
         if (req.newTpTriggerPx) body.newTpTriggerPx = req.newTpTriggerPx;
         if (req.newTpOrdPx) body.newTpOrdPx = req.newTpOrdPx;
         if (req.newSlTriggerPx) body.newSlTriggerPx = req.newSlTriggerPx;
         if (req.newSlOrdPx) body.newSlOrdPx = req.newSlOrdPx;
         if (req.newTriggerPx) body.newTriggerPx = req.newTriggerPx;
         await this.request('POST', '/api/v5/trade/amend-algos', [body]);
    } else if (req.ordId) {
        const body: any = { instId: req.instId, ordId: req.ordId };
        if (req.newSz) body.newSz = req.newSz;
        if (req.newPx) body.newPx = req.newPx;
        await this.request('POST', '/api/v5/trade/amend-order', body);
    }
  }

  async setLeverage(instId: string, lever: string, mgnMode: 'cross' | 'isolated'): Promise<void> {
    if (!this.hasKeys()) return;
    try {
        await this.request('POST', '/api/v5/account/set-leverage', { instId, lever, mgnMode });
    } catch (e) {}
  }

  async getOpenOrders(instId?: string): Promise<Order[]> {
    if (!this.hasKeys()) return [];
    const fetchStandard = async (params: any) => {
        try {
            const res = await this.request('GET', `/api/v5/trade/orders-pending?${new URLSearchParams(params)}`);
            return res?.data?.map((o: any) => ({
                ordId: o.ordId,
                instId: o.instId,
                side: o.side,
                ordType: o.ordType,
                px: o.px,
                sz: o.sz,
                state: o.state,
                cTime: o.cTime
            })) || [];
        } catch (e) { return []; }
    };
    const fetchAlgo = async (params: any) => {
        try {
            const res = await this.request('GET', `/api/v5/trade/orders-algo-pending?${new URLSearchParams(params)}`);
            const algos: Order[] = [];
            res?.data?.forEach((o: any) => {
                const common = {
                    ordId: o.algoId, algoId: o.algoId, instId: o.instId, side: o.side,
                    ordType: o.ordType, px: o.ordPx || '-1', sz: o.sz, state: o.state, cTime: o.cTime
                };
                if (o.triggerPx && o.triggerPx !== '-1') algos.push({ ...common, triggerPx: o.triggerPx });
                if (o.slTriggerPx && o.slTriggerPx !== '-1') algos.push({ ...common, ordType: 'sl', triggerPx: o.slTriggerPx, ordId: `${o.algoId}-sl` });
                if (o.tpTriggerPx && o.tpTriggerPx !== '-1') algos.push({ ...common, ordType: 'tp', triggerPx: o.tpTriggerPx, ordId: `${o.algoId}-tp` });
            });
            return algos;
        } catch (e) { return []; }
    };

    const types = instId ? [instId.includes('SWAP') ? 'SWAP' : 'SPOT'] : ['SPOT', 'SWAP'];
    const allOrders: Order[] = [];
    for (const instType of types) {
        const p: any = { instType };
        if (instId) p.instId = instId;
        allOrders.push(...(await fetchStandard(p)));
        allOrders.push(...(await fetchAlgo({ ...p, ordType: 'conditional' })));
        allOrders.push(...(await fetchAlgo({ ...p, ordType: 'oco' })));
        allOrders.push(...(await fetchAlgo({ ...p, ordType: 'trigger' })));
    }
    return allOrders.sort((a, b) => parseInt(b.cTime) - parseInt(a.cTime));
  }
}
