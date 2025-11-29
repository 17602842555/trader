import React, { useEffect, useState, useMemo, useRef } from 'react';
import { OKXService } from '../services/okxService';
import { Ticker } from '../types';
import { TrendingUp, TrendingDown, Flame, ArrowRight, Activity } from 'lucide-react';
import { formatPrice, formatAmount, formatPct } from '../utils/formatting';

interface MarketOverviewProps {
  service: OKXService;
  onSelect: (instId: string) => void;
  t: any;
}

interface TickerRowProps {
  ticker: Ticker;
  rank: number;
  onSelect: (id: string) => void;
}

const TickerRow: React.FC<TickerRowProps> = ({ ticker, rank, onSelect }) => {
  const change = ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h)) * 100;
  const isUp = change >= 0;

  return (
     <button 
         onClick={() => onSelect(ticker.instId)}
         className="w-full flex items-center p-3 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors group"
     >
         <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold mr-3 ${rank <= 3 ? 'bg-primary/20 text-primary' : 'bg-slate-200 dark:bg-slate-800 text-muted'}`}>
             {rank}
         </div>
         <div className="flex-1 text-left">
             <div className="font-bold text-sm text-text">{ticker.instId.split('-')[0]}</div>
             <div className="text-[10px] text-muted">{formatAmount(ticker.vol24h)} Vol</div>
         </div>
         <div className="text-right">
             <div className="font-mono text-sm font-medium text-text">{formatPrice(ticker.last)}</div>
             <div className={`text-xs font-bold ${isUp ? 'text-success' : 'text-danger'}`}>
                 {formatPct(change)}
             </div>
         </div>
         <ArrowRight size={16} className="ml-3 text-slate-300 dark:text-slate-700 group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
     </button>
  );
};

const MarketOverview: React.FC<MarketOverviewProps> = ({ service, onSelect, t }) => {
  const [type, setType] = useState<'SPOT' | 'SWAP'>('SPOT');
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const fetch = async () => {
        if (!isMountedRef.current) return;
        setLoading(true);
        try {
            const data = await service.getMarketTickers(type);
            if (isMountedRef.current) setTickers(data);
        } catch (e) {
            console.error(e);
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    };
    fetch();
    const interval = setInterval(fetch, 15000); // 15s interval for overview
    return () => {
        isMountedRef.current = false;
        clearInterval(interval);
    }
  }, [service, type]);

  const { hot, gainers, losers } = useMemo(() => {
    // Clone to avoid mutation
    const data = [...tickers];

    // Hot: Sort by Volume
    const hot = [...data].sort((a, b) => (parseFloat(b.volCcy24h) * parseFloat(b.last)) - (parseFloat(a.volCcy24h) * parseFloat(a.last))).slice(0, 10);
    
    // Gainers: Sort by Change % Desc
    const gainers = [...data].sort((a, b) => {
        const chgA = (parseFloat(a.last) - parseFloat(a.open24h)) / parseFloat(a.open24h);
        const chgB = (parseFloat(b.last) - parseFloat(b.open24h)) / parseFloat(b.open24h);
        return chgB - chgA;
    }).slice(0, 10);

    // Losers: Sort by Change % Asc
    const losers = [...data].sort((a, b) => {
        const chgA = (parseFloat(a.last) - parseFloat(a.open24h)) / parseFloat(a.open24h);
        const chgB = (parseFloat(b.last) - parseFloat(b.open24h)) / parseFloat(b.open24h);
        return chgA - chgB;
    }).slice(0, 10);

    return { hot, gainers, losers };
  }, [tickers]);

  return (
    <div className="animate-fadeIn pb-10">
        {/* Header Control */}
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-text">
                <Activity className="text-primary"/> {t.marketTitle}
            </h2>
            <div className="flex bg-surface p-1 rounded-lg border border-border shadow-sm">
                 <button 
                    onClick={() => setType('SPOT')} 
                    className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${type === 'SPOT' ? 'bg-primary text-white shadow' : 'text-muted hover:text-text'}`}
                >
                    Spot
                </button>
                <button 
                    onClick={() => setType('SWAP')} 
                    className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${type === 'SWAP' ? 'bg-primary text-white shadow' : 'text-muted hover:text-text'}`}
                >
                    Perpetual
                </button>
            </div>
        </div>

        {loading && tickers.length === 0 ? (
            <div className="w-full h-64 flex items-center justify-center text-muted">Loading Markets...</div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* Hot List */}
                <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-border flex items-center gap-2 bg-slate-50 dark:bg-slate-900/30">
                        <Flame className="text-orange-500" size={20}/>
                        <h3 className="font-bold text-lg text-text">{t.hotVolume}</h3>
                    </div>
                    <div className="p-2 overflow-y-auto flex-1 custom-scrollbar">
                        {hot.map((t, i) => <TickerRow key={t.instId} ticker={t} rank={i+1} onSelect={onSelect} />)}
                    </div>
                </div>

                {/* Gainers List */}
                <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-border flex items-center gap-2 bg-slate-50 dark:bg-slate-900/30">
                        <TrendingUp className="text-success" size={20}/>
                        <h3 className="font-bold text-lg text-text">{t.topGainers}</h3>
                    </div>
                    <div className="p-2 overflow-y-auto flex-1 custom-scrollbar">
                         {gainers.map((t, i) => <TickerRow key={t.instId} ticker={t} rank={i+1} onSelect={onSelect} />)}
                    </div>
                </div>

                {/* Losers List */}
                <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-border flex items-center gap-2 bg-slate-50 dark:bg-slate-900/30">
                        <TrendingDown className="text-danger" size={20}/>
                        <h3 className="font-bold text-lg text-text">{t.topLosers}</h3>
                    </div>
                    <div className="p-2 overflow-y-auto flex-1 custom-scrollbar">
                         {losers.map((t, i) => <TickerRow key={t.instId} ticker={t} rank={i+1} onSelect={onSelect} />)}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default MarketOverview;