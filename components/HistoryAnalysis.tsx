import React, { useEffect, useState } from 'react';
import { OKXService } from '../services/okxService';
import { TradeHistoryItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Download, History, Calculator } from 'lucide-react';

interface HistoryProps {
  service: OKXService;
  t: any;
}

const HistoryAnalysis: React.FC<HistoryProps> = ({ service, t }) => {
  const [history, setHistory] = useState<TradeHistoryItem[]>([]);

  useEffect(() => {
    service.getTradeHistory().then(setHistory);
  }, [service]);

  // Transform data for chart
  const pnlData = history.map(h => ({
    name: new Date(parseInt(h.ts)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    pnl: parseFloat(h.pnl)
  })).reverse();

  const totalPnl = history.reduce((acc, curr) => acc + parseFloat(curr.pnl), 0);
  const winRate = history.length > 0 
    ? (history.filter(h => parseFloat(h.pnl) > 0).length / history.length) * 100 
    : 0;

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 text-muted mb-2">
            <Calculator size={18} />
            <span className="text-sm font-medium">{t.cumulativePnl}</span>
          </div>
          <div className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
            ${totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 text-muted mb-2">
             <span className="text-sm font-medium">{t.winRate}</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">
            {winRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
           <div className="flex items-center gap-2 text-muted mb-2">
             <span className="text-sm font-medium">{t.totalTrades}</span>
          </div>
          <div className="text-2xl font-bold text-text">
            {history.length}
          </div>
        </div>
      </div>

      {/* PnL Chart */}
      <div className="bg-surface rounded-xl border border-slate-700 p-6 shadow-lg">
        <h3 className="text-lg font-bold mb-4">{t.pnlAnalysis}</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip 
                cursor={{fill: '#334155', opacity: 0.2}}
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="pnl" fill="#3b82f6">
                {pnlData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2 font-semibold">
            <History size={18} />
            {t.tradeHistory}
          </div>
          <button className="text-xs text-primary flex items-center gap-1 hover:text-white">
            <Download size={14} /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-muted uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Time</th>
                <th className="px-6 py-3 text-left">Symbol</th>
                <th className="px-6 py-3 text-left">Side</th>
                <th className="px-6 py-3 text-right">Avg Price</th>
                <th className="px-6 py-3 text-right">Filled</th>
                <th className="px-6 py-3 text-right">Fee</th>
                <th className="px-6 py-3 text-right">PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {history.map((h) => (
                <tr key={h.fillId} className="hover:bg-slate-700/50 transition-colors">
                   <td className="px-6 py-4 text-muted">{new Date(parseInt(h.ts)).toLocaleString()}</td>
                   <td className="px-6 py-4 font-bold">{h.instId}</td>
                   <td className={`px-6 py-4 uppercase font-bold ${h.side === 'buy' ? 'text-success' : 'text-danger'}`}>{h.side}</td>
                   <td className="px-6 py-4 text-right font-mono">{h.fillPx}</td>
                   <td className="px-6 py-4 text-right font-mono">{h.fillSz}</td>
                   <td className="px-6 py-4 text-right text-muted">{h.fee}</td>
                   <td className={`px-6 py-4 text-right font-mono ${parseFloat(h.pnl) >= 0 ? 'text-success' : 'text-danger'}`}>
                     {parseFloat(h.pnl) > 0 ? '+' : ''}{h.pnl}
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistoryAnalysis;