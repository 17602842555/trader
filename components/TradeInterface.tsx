
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { OKXService } from '../services/okxService';
import { Ticker, Order, Position, Instrument, AssetBalance } from '../types';
import { RefreshCw, ArrowLeft, Layers, Shield, Plus, Minus, Wallet, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import TradingChart from './TradingChart';
import MarketOverview from './MarketOverview';
import MarketSidebar from './MarketSidebar';
import { formatPrice, formatAmount } from '../utils/formatting';

interface TradeInterfaceProps {
  service: OKXService;
  onPlaceOrder: (msg: string, type: 'success' | 'error') => void;
  t: any;
  theme: 'dark' | 'light';
  refreshInterval?: number;
  colorMode?: 'standard' | 'reverse';
}

const TradeInterface: React.FC<TradeInterfaceProps> = ({ 
    service, onPlaceOrder, t, theme, 
    refreshInterval = 6000, colorMode = 'standard' 
}) => {
  const [viewMode, setViewMode] = useState<'market' | 'trade'>('market');
  const [instId, setInstId] = useState('BTC-USDT');
  
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [balances, setBalances] = useState<AssetBalance[]>([]);
  
  // Sidebar State (Mobile Only)
  const [isMobileMarketOpen, setIsMobileMarketOpen] = useState(false);

  // Order Form State
  const [ordType, setOrdType] = useState<'limit' | 'market' | 'conditional'>('limit');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [size, setSize] = useState('');
  const [percentage, setPercentage] = useState(0); // 0-100 for slider
  const [leverage, setLeverage] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  
  const [hasSetInitialPrice, setHasInitialPrice] = useState(false);
  const [marginMode, setMarginMode] = useState<'cross' | 'isolated'>('cross');

  const isMountedRef = useRef(true);
  
  // Handlers
  const handleSelectInstrument = (id: string) => {
      setInstId(id);
      if (viewMode === 'market') setViewMode('trade');
      setIsMobileMarketOpen(false); // Close mobile drawer
  };

  const handleBack = () => {
      setViewMode('market');
  };

  const handleCancelOrder = async (order: Order) => {
      try {
          await service.cancelOrder(order.instId, order.ordId, order.algoId);
          onPlaceOrder(t.orderCancelled, 'success');
          setOpenOrders(prev => prev.filter(o => (o.ordId !== order.ordId && o.algoId !== order.algoId)));
      } catch (e: any) {
          onPlaceOrder(e.message || t.cancelFailed, 'error');
      }
  };

  const handleModifyOrder = async (order: Order, newPx: string) => {
      if (!newPx) {
          onPlaceOrder(t.invalidPrice, 'error');
          return;
      }
      try {
          const req: any = { 
              instId: order.instId,
              ordId: order.ordId,
              algoId: order.algoId
          };

          if (order.algoId) delete req.ordId; 

          if (order.ordType === 'sl') req.newSlTriggerPx = newPx;
          else if (order.ordType === 'tp') req.newTpTriggerPx = newPx;
          else if (['conditional', 'trigger'].includes(order.ordType)) req.newTriggerPx = newPx;
          else if (order.ordType === 'limit') req.newPx = newPx;
          else {
              if (order.triggerPx) req.newTriggerPx = newPx;
              else req.newPx = newPx;
          }

          const hasChanges = Object.keys(req).some(k => k.startsWith('new') && !!req[k]);
          if (!hasChanges) return;

          await service.amendOrder(req);
          onPlaceOrder(`${t.orderModified} ${newPx}`, 'success');
          fetchData(); 
      } catch (e: any) {
           onPlaceOrder(e.message || t.modifyFailed, 'error');
      }
  };
  
  const handleChartPriceClick = (priceVal: string) => {
      if (ordType === 'conditional') {
          setTriggerPrice(priceVal);
      } else if (ordType === 'limit') {
          setPrice(priceVal);
      }
  };

  const handleAddAlgo = async (type: 'sl' | 'tp', priceVal: string) => {
      const pos = positions.find(p => p.instId === instId);
      if (!pos) return;
      try {
        const isSwap = instId.includes('SWAP');
        const closeSide = pos.posSide === 'long' ? 'sell' : (pos.posSide === 'short' ? 'buy' : (parseFloat(pos.pos) > 0 ? 'sell' : 'buy'));
        const posSide = isSwap ? pos.posSide : undefined;

        await service.placeOrder({
            instId,
            tdMode: isSwap ? marginMode : 'cash',
            side: closeSide,
            posSide,
            ordType: 'conditional',
            triggerPx: priceVal,
            px: '-1', 
            sz: pos.pos 
        });
        onPlaceOrder(`${t.addedAlgo} ${type.toUpperCase()} @ ${priceVal}`, 'success');
        fetchData();
      } catch(e:any) {
          onPlaceOrder(e.message, 'error');
      }
  };

  // Fetch Data
  const fetchData = async () => {
    if (viewMode !== 'trade' || !isMountedRef.current) return;
    try {
      const [tk, ords, pos, instruments, bals] = await Promise.all([
          service.getTicker(instId),
          service.getOpenOrders(instId),
          service.getPositions(),
          service.getInstruments(instId.includes('SWAP') ? 'SWAP' : 'SPOT'),
          service.getBalances()
      ]);
      
      if (!isMountedRef.current) return;

      setTicker(tk);
      setOpenOrders(ords);
      setPositions(pos);
      setBalances(bals);
      
      const currentInst = instruments.find(i => i.instId === instId);
      if (currentInst) setInstrument(currentInst);
      
    } catch (error) {
      console.error("Trade data fetch failed", error);
      if(isMountedRef.current) setOpenOrders([]); 
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    let timerId: any;
    const poll = async () => {
        if (!isMountedRef.current) return;
        await fetchData();
        if (isMountedRef.current && viewMode === 'trade') {
            timerId = setTimeout(poll, refreshInterval); 
        }
    };
    
    if (viewMode === 'trade') {
        timerId = setTimeout(poll, refreshInterval);
    }

    return () => {
        isMountedRef.current = false;
        clearTimeout(timerId);
    };
  }, [instId, service, viewMode, refreshInterval]);

  // Reset State on Instrument Change
  useEffect(() => {
      setPrice('');
      setTriggerPrice('');
      setSize('');
      setPercentage(0);
      setHasInitialPrice(false); 
      if (instId.includes('SWAP')) setMarginMode('cross');
  }, [instId]);
  
  useEffect(() => {
      if (ticker && !hasSetInitialPrice && ordType === 'limit') {
          setPrice(ticker.last);
          setHasInitialPrice(true);
      }
  }, [ticker, hasSetInitialPrice, ordType]);

  const availBal = useMemo(() => {
      if (!instrument) return '0';
      const isSwap = instId.includes('SWAP');
      const currency = isSwap ? 'USDT' : instrument.quoteCcy; 
      const bal = balances.find(b => b.ccy === currency);
      return bal ? bal.availBal : '0';
  }, [balances, instrument, instId]);

  const handleSliderChange = (pct: number) => {
      setPercentage(pct);
      if (!price || !ticker) return;
      const p = parseFloat(price || ticker.last);
      if (p <= 0) return;

      const isSwap = instId.includes('SWAP');
      
      if (isSwap) {
          const avail = parseFloat(availBal); // USDT
          const ctVal = parseFloat(instrument?.ctVal || '1');
          // Contracts must be integer
          const maxContracts = (avail * leverage) / (p * ctVal);
          const rawSize = maxContracts * (pct / 100);
          setSize(Math.floor(rawSize).toString());
      } else {
          const avail = parseFloat(availBal);
          const maxSize = avail / p;
          setSize((maxSize * (pct / 100)).toFixed(5));
      }
  };

  /**
   * Submit Order
   */
  const handleSubmit = async (action: 'buy' | 'sell' | 'long' | 'short') => {
    if (!price && ordType === 'limit') return;
    if (!triggerPrice && ordType === 'conditional') return;
    if (!size) {
        onPlaceOrder(t.enterAmount, 'error');
        return;
    }

    setLoading(true);
    try {
      const isSwap = instId.includes('SWAP');
      const tdMode = isSwap ? marginMode : 'cash';

      if (isSwap) {
          try { await service.setLeverage(instId, leverage.toString(), marginMode); } catch(e) {}
      }

      let side: 'buy' | 'sell' = 'buy';
      let posSide: 'long' | 'short' | 'net' | undefined = undefined;

      // Handle Logic for Swap vs Spot
      if (isSwap) {
          if (action === 'long') {
              side = 'buy';
              posSide = 'long';
          } else if (action === 'short') {
              side = 'sell';
              posSide = 'short';
          }
      } else {
          // Spot logic
          side = action === 'buy' ? 'buy' : 'sell';
          posSide = undefined;
      }

      await service.placeOrder({
        instId,
        tdMode,
        side,
        posSide,
        ordType,
        px: ordType !== 'market' ? price : undefined,
        sz: size,
        triggerPx: ordType === 'conditional' ? triggerPrice : undefined
      });
      onPlaceOrder(`${t.orderPlaced}: ${side.toUpperCase()} ${instId}`, 'success');
      fetchData();
    } catch (err: any) {
      onPlaceOrder(err.message || t.failedPlace, 'error');
    } finally {
      if(isMountedRef.current) setLoading(false);
    }
  };

  const currentPosition = useMemo(() => positions.find(p => p.instId === instId), [positions, instId]);
  const maxLeverage = useMemo(() => instrument?.lever ? parseInt(instrument.lever) : 100, [instrument]);

  const estimatedCost = useMemo(() => {
      if (!price || !size || !instrument) return null;
      const p = parseFloat(price);
      const s = parseFloat(size);
      if (instId.includes('SWAP')) {
           const ctVal = parseFloat(instrument.ctVal || '1');
           return (p * s * ctVal) / leverage;
      } else {
           return p * s; // Estimate in Quote currency
      }
  }, [price, size, instrument, leverage, instId]);

  if (viewMode === 'market') {
      return <MarketOverview service={service} onSelect={handleSelectInstrument} t={t} />;
  }

  const isContract = instId.includes('SWAP');

  return (
    <div className="flex flex-col md:flex-row h-full animate-fadeIn relative gap-4 p-4 md:p-0">
      
      {/* Desktop Sidebar (Permanent) */}
      <div className="hidden md:block w-64 h-full shrink-0">
         <MarketSidebar service={service} onSelect={handleSelectInstrument} currentInstId={instId} />
      </div>

      {/* Mobile Drawer */}
      {isMobileMarketOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
              <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMarketOpen(false)}></div>
              <div className="relative w-4/5 max-w-sm bg-surface h-full shadow-2xl animate-slideInLeft">
                   <MarketSidebar service={service} onSelect={handleSelectInstrument} currentInstId={instId} />
                   <button onClick={() => setIsMobileMarketOpen(false)} className="absolute top-2 right-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                       <ArrowLeft size={20} />
                   </button>
              </div>
          </div>
      )}

      {/* Main Trading Area */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 h-full">
        
        {/* Top Header */}
        <div className="bg-surface rounded-xl border border-border p-3 md:p-4 flex justify-between items-center shadow-lg shrink-0">
            <div className="flex items-center gap-2 md:gap-4">
                <button onClick={handleBack} className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-muted hover:text-text">
                    <ArrowLeft size={20} />
                </button>
                {/* Mobile Sidebar Toggle */}
                <button onClick={() => setIsMobileMarketOpen(true)} className="md:hidden p-2 text-muted hover:text-primary">
                        <Menu size={20} />
                </button>
                <div>
                    <h2 className="text-lg md:text-2xl font-bold flex items-center gap-2 text-text">
                        {instId.replace('-', '/')}
                        <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded ${isContract ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {isContract ? t.contract : t.spot}
                        </span>
                    </h2>
                </div>
            </div>
            <div className="text-right">
                {ticker && (
                    <div>
                        <div className={`text-lg md:text-xl font-mono font-bold ${parseFloat(ticker.last) >= parseFloat(ticker.open24h) ? 'text-success' : 'text-danger'}`}>
                            {formatPrice(ticker.last)}
                        </div>
                    </div>
                )}
            </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 flex-1 min-h-0">
             {/* Chart Section */}
            <div className="flex-1 flex flex-col gap-4 min-h-[400px]">
                <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-lg p-1 flex-1 relative min-h-[400px]">
                    <TradingChart 
                        instId={instId} 
                        theme={theme} 
                        service={service} 
                        position={currentPosition}
                        orders={openOrders}
                        onCancelOrder={handleCancelOrder}
                        onModifyOrder={handleModifyOrder}
                        onPriceClick={handleChartPriceClick}
                        onAddAlgo={handleAddAlgo}
                        colorMode={colorMode}
                    />
                </div>

                 {/* Open Orders List (Desktop & Mobile) */}
                <div className="bg-surface rounded-xl border border-border overflow-hidden min-h-[200px] flex flex-col shrink-0">
                    <div className="p-3 bg-slate-100 dark:bg-slate-900/50 border-b border-border font-semibold text-sm text-text">{t.openOrders}</div>
                    <div className="overflow-x-auto flex-1 max-h-[250px] custom-scrollbar">
                        <table className="w-full text-sm">
                            <thead className="text-muted text-left bg-slate-50 dark:bg-transparent text-xs sticky top-0 bg-surface z-10">
                                <tr>
                                    <th className="p-3">Type</th>
                                    <th className="p-3">Side</th>
                                    <th className="p-3 text-right">Trigger</th>
                                    <th className="p-3 text-right">Price</th>
                                    <th className="p-3 text-right">Size</th>
                                    <th className="p-3 text-right">Status</th>
                                    <th className="p-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {openOrders.map(o => (
                                    <tr key={o.ordId || o.algoId} className="hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors">
                                        <td className="p-3 uppercase text-text text-xs whitespace-nowrap">
                                            <span className={`px-1 py-0.5 rounded font-bold ${
                                                ['sl', 'tp', 'conditional', 'oco', 'trigger'].includes(o.ordType) ? 'bg-orange-500/20 text-orange-500' : ''
                                            }`}>
                                                {o.ordType}
                                            </span>
                                        </td>
                                        <td className={`p-3 uppercase font-bold text-xs whitespace-nowrap ${o.side === 'buy' ? 'text-success' : 'text-danger'}`}>{o.side}</td>
                                        <td className="p-3 text-right font-mono text-text text-xs whitespace-nowrap">
                                            {o.triggerPx ? formatPrice(o.triggerPx) : '-'}
                                        </td>
                                        <td className="p-3 text-right font-mono text-text text-xs whitespace-nowrap">
                                            {o.px === '-1' ? 'Market' : formatPrice(o.px)}
                                        </td>
                                        <td className="p-3 text-right font-mono text-text text-xs whitespace-nowrap">{formatAmount(o.sz)}</td>
                                        <td className="p-3 text-right text-text text-xs capitalize whitespace-nowrap">{o.state.replace('_', ' ')}</td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => handleCancelOrder(o)} className="text-xs text-danger hover:underline">Cancel</button>
                                        </td>
                                    </tr>
                                ))}
                                {openOrders.length === 0 && (
                                    <tr><td colSpan={7} className="p-6 text-center text-muted text-xs">No open orders</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Order Form */}
            <div className="w-full xl:w-80 shrink-0">
                <div className="bg-surface rounded-xl border border-border shadow-xl flex flex-col xl:sticky xl:top-4">
                    <div className="p-4 space-y-4">
                        {/* 1. Order Type */}
                        <div className="flex bg-slate-100 dark:bg-slate-900 rounded p-1">
                            {['limit', 'market', 'conditional'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setOrdType(type as any)}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded capitalize ${ordType === type ? 'bg-surface text-text shadow' : 'text-muted hover:text-text'}`}
                                >
                                    {t[type]}
                                </button>
                            ))}
                        </div>

                        {/* 2. Margin & Leverage (Contract Only) */}
                        {isContract && (
                            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-border space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-muted uppercase flex items-center gap-1">
                                        <Shield size={10} /> {t.marginMode}
                                    </span>
                                    <div className="flex bg-slate-200 dark:bg-slate-900 rounded p-0.5">
                                        <button onClick={() => setMarginMode('cross')} className={`px-2 py-0.5 text-[10px] font-bold rounded ${marginMode === 'cross' ? 'bg-primary text-white' : 'text-muted'}`}>{t.cross}</button>
                                        <button onClick={() => setMarginMode('isolated')} className={`px-2 py-0.5 text-[10px] font-bold rounded ${marginMode === 'isolated' ? 'bg-primary text-white' : 'text-muted'}`}>{t.isolated}</button>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-bold text-muted flex items-center gap-1"><Layers size={10}/> {t.leverage}</span>
                                        <span className="font-bold text-primary">{leverage}x</span>
                                    </div>
                                    <input type="range" min="1" max={maxLeverage} value={leverage} onChange={(e) => setLeverage(parseInt(e.target.value))} className="w-full h-1 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"/>
                                </div>
                            </div>
                        )}

                        {/* 3. Price Input */}
                        <div className="space-y-1">
                            <label className="text-xs text-muted font-bold">{ordType === 'conditional' ? t.triggerPrice : t.price} (USDT)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    value={ordType === 'conditional' ? triggerPrice : price}
                                    onChange={(e) => ordType === 'conditional' ? setTriggerPrice(e.target.value) : setPrice(e.target.value)}
                                    disabled={ordType === 'market'}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-border rounded-lg p-3 text-right font-mono text-sm focus:border-primary outline-none"
                                    placeholder={ordType === 'market' ? 'Market Price' : '0.00'}
                                />
                                {ordType === 'market' && <div className="absolute inset-0 bg-slate-100/50 dark:bg-slate-900/50 rounded-lg flex items-center justify-center text-xs font-bold text-muted pointer-events-none">Market Best</div>}
                            </div>
                        </div>

                        {/* 4. Size Input */}
                        <div className="space-y-1">
                            <label className="text-xs text-muted font-bold">{t.amount} ({isContract ? 'Cont' : instId.split('-')[0]})</label>
                            <input 
                                type="number" 
                                value={size}
                                onChange={(e) => setSize(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-border rounded-lg p-3 text-right font-mono text-sm focus:border-primary outline-none"
                                placeholder={isContract ? "Contracts" : "Amount"}
                            />
                        </div>

                        {/* 5. Slider */}
                        <div className="pt-2 pb-4 px-1">
                            <div className="relative h-6 flex items-center">
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="100" 
                                    value={percentage} 
                                    onChange={(e) => handleSliderChange(parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white"
                                />
                                {/* Markers */}
                                {[0, 25, 50, 75, 100].map(p => (
                                    <div key={p} className="absolute w-2 h-2 bg-slate-400 rounded-full" style={{ left: `${p}%`, marginLeft: '-4px' }} />
                                ))}
                                {/* Floating Label */}
                                {percentage > 0 && (
                                    <div className="absolute -top-6 bg-slate-700 text-white text-[10px] px-1.5 py-0.5 rounded transform -translate-x-1/2" style={{ left: `${percentage}%` }}>
                                        {percentage}%
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 6. Info Row */}
                        <div className="flex justify-between text-xs text-muted">
                            <div>{t.avail}: <span className="font-mono text-text">{parseFloat(availBal).toFixed(2)} USDT</span></div>
                            {estimatedCost && <div>≈ {estimatedCost.toFixed(2)} USDT</div>}
                        </div>

                        {/* 7. Action Buttons */}
                        {isContract ? (
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={() => handleSubmit('long')}
                                    disabled={loading}
                                    className="py-3 rounded-lg font-bold text-sm text-white shadow-lg bg-success hover:bg-emerald-500 transition-transform active:scale-95"
                                >
                                    {loading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : t.openLong}
                                </button>
                                <button
                                    onClick={() => handleSubmit('short')}
                                    disabled={loading}
                                    className="py-3 rounded-lg font-bold text-sm text-white shadow-lg bg-danger hover:bg-rose-500 transition-transform active:scale-95"
                                >
                                    {loading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : t.openShort}
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={() => handleSubmit('buy')}
                                    disabled={loading}
                                    className="py-3 rounded-lg font-bold text-sm text-white shadow-lg bg-success hover:bg-emerald-500 transition-transform active:scale-95"
                                >
                                    {loading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : t.buy}
                                </button>
                                <button
                                    onClick={() => handleSubmit('sell')}
                                    disabled={loading}
                                    className="py-3 rounded-lg font-bold text-sm text-white shadow-lg bg-danger hover:bg-rose-500 transition-transform active:scale-95"
                                >
                                    {loading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : t.sell}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default TradeInterface;
