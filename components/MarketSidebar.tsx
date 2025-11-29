import React, { useEffect, useState, useMemo } from 'react';
import { OKXService } from '../services/okxService';
import { Ticker } from '../types';
import { TrendingUp, TrendingDown, Flame, Search } from 'lucide-react';

interface MarketSidebarProps {
  service: OKXService;
  onSelect: (instId: string) => void;
  currentInstId: string;
}

const MarketSidebar: React.FC<MarketSidebarProps> = ({ service, onSelect, currentInstId }) => {
  const [tab, setTab] = useState<'hot' | 'gainers' | 'losers'>('hot');
  const [type, setType] = useState<'SPOT' | 'SWAP'>('SPOT');
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetch = async () => {
        const data = await service.getMarketTickers(type);
        setTickers(data);
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, [service, type]);

  const displayedTickers = useMemo(() => {
      let data = [...tickers];
      
      // Filter
      if (searchTerm) {
          data = data.filter(t => t.instId.toLowerCase().includes(searchTerm.toLowerCase()));
      }

      // Sort
      if (tab === 'hot') {
          // Sort by Volume (approximate using volCcy24h * last)
          data.sort((a, b) => (parseFloat(b.volCcy24h) * parseFloat(b.last)) - (parseFloat(a.volCcy24h) * parseFloat(a.last)));
      } else if (tab === 'gainers') {
          // Sort by Change % Descending
          data.sort((a, b) => {
              const chgA = (parseFloat(a.last) - parseFloat(a.open24h)) / parseFloat(a.open24h);
              const chgB = (parseFloat(b.last) - parseFloat(b.open24h)) / parseFloat(b.open24h);
              return chgB - chgA;
          });
      } else if (tab === 'losers') {
          // Sort by Change % Ascending
          data.sort((a, b) => {
              const chgA = (parseFloat(a.last) - parseFloat(a.open24h)) / parseFloat(a.open24h);
              const chgB = (parseFloat(b.last) - parseFloat(b.open24h)) / parseFloat(b.open24h);
              return chgA - chgB;
          });
      }
      return data.slice(0, 20);
  }, [tickers, tab, searchTerm]);

  return (
    <div className="bg-surface border border-border rounded-xl h-full flex flex-col shadow-lg overflow-hidden">
        {/* Type Switcher */}
        <div className="flex border-b border-border">
            <button 
                onClick={() => setType('SPOT')} 
                className={`flex-1 py-3 text-sm font-bold ${type === 'SPOT' ? 'text-primary bg-slate-100 dark:bg-slate-900/50 border-b-2 border-primary' : 'text-muted hover:text-text'}`}
            >
                Spot
            </button>
            <button 
                onClick={() => setType('SWAP')} 
                className={`flex-1 py-3 text-sm font-bold ${type === 'SWAP' ? 'text-primary bg-slate-100 dark:bg-slate-900/50 border-b-2 border-primary' : 'text-muted hover:text-text'}`}
            >
                Perp
            </button>
        </div>

        {/* Tab Header (Sub-menu) */}
        <div className="flex p-1 gap-1 text-xs font-medium text-muted border-b border-border bg-slate-50 dark:bg-slate-900/20">
             <button 
                onClick={() => setTab('hot')} 
                className={`flex-1 flex justify-center items-center gap-1 py-1.5 rounded transition-colors ${tab === 'hot' ? 'bg-surface text-text shadow-sm border border-border' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
             >
                <Flame size={12} className={tab === 'hot' ? 'text-orange-500' : ''}/> Hot
             </button>
             <button 
                onClick={() => setTab('gainers')} 
                className={`flex-1 flex justify-center items-center gap-1 py-1.5 rounded transition-colors ${tab === 'gainers' ? 'bg-surface text-text shadow-sm border border-border' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
             >
                <TrendingUp size={12} className={tab === 'gainers' ? 'text-success' : ''}/> Gainers
             </button>
             <button 
                onClick={() => setTab('losers')} 
                className={`flex-1 flex justify-center items-center gap-1 py-1.5 rounded transition-colors ${tab === 'losers' ? 'bg-surface text-text shadow-sm border border-border' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
             >
                <TrendingDown size={12} className={tab === 'losers' ? 'text-danger' : ''}/> Losers
             </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
            <div className="bg-slate-100 dark:bg-slate-900/50 flex items-center px-3 py-2 rounded-lg border border-border">
                <Search size={14} className="text-muted mr-2"/>
                <input 
                    type="text" 
                    placeholder="Search Coin" 
                    className="bg-transparent text-sm w-full focus:outline-none text-text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        {/* Header Row */}
        <div className="flex px-4 py-2 text-[10px] text-muted uppercase bg-slate-50 dark:bg-transparent">
            <div className="flex-1">Symbol</div>
            <div className="w-20 text-right">Last</div>
            <div className="w-16 text-right">24h%</div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
            {displayedTickers.map(t => {
                const change = ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100;
                const isUp = change >= 0;
                return (
                    <button 
                        key={t.instId}
                        onClick={() => onSelect(t.instId)}
                        className={`w-full flex px-4 py-2.5 items-center hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors border-b border-border/50 ${currentInstId === t.instId ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
                    >
                        <div className="flex-1 text-left">
                            <div className="text-sm font-bold text-text">{t.instId.split('-')[0]}</div>
                            <div className="text-[10px] text-muted">{type}</div>
                        </div>
                        <div className="w-20 text-right text-sm font-mono text-text">
                            {parseFloat(t.last).toLocaleString()}
                        </div>
                        <div className={`w-16 text-right text-xs font-bold ${isUp ? 'text-success' : 'text-danger'}`}>
                            {isUp ? '+' : ''}{change.toFixed(2)}%
                        </div>
                    </button>
                )
            })}
        </div>
    </div>
  );
};

export default MarketSidebar;