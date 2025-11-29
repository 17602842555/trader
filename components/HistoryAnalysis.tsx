import React, { useEffect, useState, useMemo } from 'react';
import { OKXService } from '../services/okxService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Download, History, Calculator, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface HistoryProps {
  service: OKXService;
  t: any;
  colorMode?: 'standard' | 'reverse';
}

const HistoryAnalysis: React.FC<HistoryProps> = ({ service, t, colorMode = 'standard' }) => {
  // Use 'any' here because we are fetching raw position history now
  const [history, setHistory] = useState<any[]>([]);
  const [calendarDate, setCalendarDate] = useState(new Date());

  useEffect(() => {
    // Changed to getPositionsHistory to get REALIZED PnL correctly
    service.getPositionsHistory().then(setHistory);
  }, [service]);

  const totalPnl = useMemo(() => {
    return history.reduce((acc, curr) => {
        // realizedPnl is the key in positions-history
        const val = parseFloat(curr.pnl || curr.realizedPnl || '0');
        return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [history]);

  const winRate = useMemo(() => {
      if (history.length === 0) return 0;
      const valid = history.filter(h => {
          const p = parseFloat(h.pnl || h.realizedPnl || '0');
          return !isNaN(p) && p !== 0;
      });
      if (valid.length === 0) return 0;
      const wins = valid.filter(h => parseFloat(h.pnl || h.realizedPnl) > 0).length;
      return (wins / valid.length) * 100;
  }, [history]);

  // Calendar Logic
  const dailyPnlMap = useMemo(() => {
    const map: Record<string, number> = {};
    history.forEach(item => {
        // uTime in positions-history is when it closed
        const ts = item.uTime || item.ts;
        if (!ts) return;
        const date = new Date(parseInt(ts));
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const val = parseFloat(item.pnl || item.realizedPnl || '0');
        if (!isNaN(val)) {
            map[key] = (map[key] || 0) + val;
        }
    });
    return map;
  }, [history]);

  const calendarDays = useMemo(() => {
      const year = calendarDate.getFullYear();
      const month = calendarDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();
      
      const days = [];
      for (let i = 0; i < firstDay; i++) days.push(null);
      for (let i = 1; i <= daysInMonth; i++) days.push(i);
      return days;
  }, [calendarDate]);

  const changeMonth = (delta: number) => {
      setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const isReverse = colorMode === 'reverse';
  const colorUp = isReverse ? 'text-danger' : 'text-success';
  const colorDown = isReverse ? 'text-success' : 'text-danger';
  const bgUp = isReverse ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30';
  const bgDown = isReverse ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30';

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 text-muted mb-2">
            <Calculator size={18} />
            <span className="text-sm font-medium">{t.cumulativePnl}</span>
          </div>
          <div className={`text-3xl font-bold ${totalPnl >= 0 ? colorUp : colorDown}`}>
            ${totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 text-muted mb-2">
             <span className="text-sm font-medium">{t.winRate}</span>
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {winRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
           <div className="flex items-center gap-2 text-muted mb-2">
             <span className="text-sm font-medium">{t.totalTrades}</span>
          </div>
          <div className="text-3xl font-bold text-text">
            {history.length}
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-surface rounded-xl border border-slate-700 p-6 shadow-lg">
         <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold flex items-center gap-2 text-text">
                 <CalendarIcon size={20} className="text-primary"/> PnL Calendar
             </h3>
             <div className="flex items-center gap-4 text-sm font-bold bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                 <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"><ChevronLeft size={16}/></button>
                 <span className="min-w-[120px] text-center">{calendarDate.toLocaleDateString(undefined, {year: 'numeric', month: 'long'})}</span>
                 <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"><ChevronRight size={16}/></button>
             </div>
         </div>
         
         <div className="grid grid-cols-7 gap-2 text-center mb-3">
             {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                 <div key={d} className="text-xs font-bold text-muted uppercase tracking-wider">{d}</div>
             ))}
         </div>
         <div className="grid grid-cols-7 gap-2 md:gap-4">
             {calendarDays.map((day, idx) => {
                 if (!day) return <div key={`empty-${idx}`} className="aspect-square"></div>;
                 
                 const key = `${calendarDate.getFullYear()}-${calendarDate.getMonth()}-${day}`;
                 const pnl = dailyPnlMap[key];
                 const hasPnl = pnl !== undefined && pnl !== 0;
                 
                 return (
                     <div key={key} className={`aspect-square rounded-xl border flex flex-col items-center justify-between p-1 md:p-2 transition-all ${
                         hasPnl ? (pnl > 0 ? bgUp : bgDown) : 'bg-slate-50 dark:bg-slate-800/30 border-transparent'
                     }`}>
                         <span className="text-xs text-muted self-start font-medium">{day}</span>
                         {hasPnl && (
                             <span className={`text-[10px] md:text-xs font-bold ${pnl > 0 ? colorUp : colorDown}`}>
                                 {pnl > 0 ? '+' : ''}{pnl >= 1000 || pnl <= -1000 ? (pnl/1000).toFixed(1)+'k' : pnl.toFixed(1)}
                             </span>
                         )}
                     </div>
                 );
             })}
         </div>
      </div>

      {/* History Table */}
      <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2 font-semibold text-text">
            <History size={18} />
            {t.tradeHistory} (Closed Positions)
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900/50 text-muted uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Time</th>
                <th className="px-6 py-3 text-left">Symbol</th>
                <th className="px-6 py-3 text-left">Side</th>
                <th className="px-6 py-3 text-right">Open Px</th>
                <th className="px-6 py-3 text-right">Close Px</th>
                <th className="px-6 py-3 text-right">PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {history.map((h) => {
                  const pnlVal = parseFloat(h.pnl || h.realizedPnl || '0');
                  return (
                    <tr key={h.instId + h.cTime} className="hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-text">
                       <td className="px-6 py-4 text-muted">{new Date(parseInt(h.uTime || h.ts)).toLocaleString()}</td>
                       <td className="px-6 py-4 font-bold">{h.instId}</td>
                       <td className="px-6 py-4 uppercase font-bold">{h.direction || h.posSide}</td>
                       <td className="px-6 py-4 text-right font-mono">{h.openAvgPx}</td>
                       <td className="px-6 py-4 text-right font-mono">{h.closeAvgPx}</td>
                       <td className={`px-6 py-4 text-right font-mono font-bold ${pnlVal >= 0 ? 'text-success' : 'text-danger'}`}>
                         {pnlVal > 0 ? '+' : ''}{pnlVal.toFixed(2)}
                       </td>
                    </tr>
                  );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistoryAnalysis;
