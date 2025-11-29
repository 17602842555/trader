import React, { useMemo, useState, useEffect } from 'react';
import { AssetBalance, Position, AssetHistory, TimePeriod, CurrencyUnit, Order } from '../types';
import { OKXService } from '../services/okxService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Wallet, TrendingUp, DollarSign, ChevronDown, ChevronUp, Activity, ArrowRightLeft, Eye, EyeOff } from 'lucide-react';
import TradingChart from './TradingChart';
import { formatPrice, formatAmount, formatPct } from '../utils/formatting';

interface DashboardProps {
  balances: AssetBalance[];
  service: OKXService;
  t: any;
  theme: 'dark' | 'light';
  onAction?: (msg: string, type: 'success' | 'error') => void;
  refreshInterval?: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ balances, service, t, theme, onAction, refreshInterval = 10000 }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([]);
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<TimePeriod>('1M');
  const [unit, setUnit] = useState<CurrencyUnit>('USD');
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  useEffect(() => { service.getPositions().then(setPositions); }, [service, balances]); 
  useEffect(() => { service.getAssetHistory(period).then(setAssetHistory); }, [service, period, balances]);

  useEffect(() => {
    if (!expandedPosition) { setExpandedOrders([]); return; }
    let isMounted = true;
    const fetchOrders = async () => {
        try {
            const ords = await service.getOpenOrders(expandedPosition);
            if (isMounted) setExpandedOrders(ords);
        } catch (e) {}
    };
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000); 
    return () => { isMounted = false; clearInterval(interval); };
  }, [expandedPosition, service]);

  const totalBalanceUsd = useMemo(() => balances.reduce((acc, curr) => acc + parseFloat(curr.eqUsd), 0), [balances]);
  const displayBalance = useMemo(() => totalBalanceUsd * service.exchangeRates[unit], [totalBalanceUsd, unit, service.exchangeRates]);

  const percentageChange = useMemo(() => {
      if (assetHistory.length < 2) return 0;
      const startEq = assetHistory[0].totalEq;
      const currentEq = assetHistory[assetHistory.length - 1].totalEq;
      return startEq === 0 ? 0 : ((currentEq - startEq) / startEq) * 100;
  }, [assetHistory]);

  const chartData = useMemo(() => {
    return balances
      .filter(b => parseFloat(b.eqUsd) > 10)
      .map(b => ({ name: b.ccy, value: parseFloat(b.eqUsd) }))
      .sort((a, b) => b.value - a.value);
  }, [balances]);

  // Handlers omitted for brevity but functionality preserved via props passing
  const handleCancelOrder = async (order: Order) => {
    try {
        await service.cancelOrder(order.instId, order.ordId, order.algoId);
        onAction?.(t.orderCancelled, 'success');
        setExpandedOrders(prev => prev.filter(o => (o.ordId !== order.ordId && o.algoId !== order.algoId)));
    } catch (e: any) { onAction?.(e.message || t.cancelFailed, 'error'); }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      
      {/* Combined Asset & Trend Card (OKX Style) */}
      <div className="col-span-full bg-surface rounded-xl border border-border shadow-lg overflow-hidden">
        <div className="flex flex-col md:flex-row h-full">
            {/* Left: Asset Info */}
            <div className="p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-border flex flex-col justify-center">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-muted">
                        <Wallet size={20} />
                        <span className="text-sm font-bold">{t.totalAssets}</span>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        <button onClick={() => setHideBalance(!hideBalance)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-muted">
                            {hideBalance ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button onClick={() => setIsUnitOpen(!isUnitOpen)} className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-bold">
                            {unit} <ArrowRightLeft size={12}/>
                        </button>
                        {isUnitOpen && (
                            <div className="absolute right-0 top-full mt-1 w-24 bg-surface border border-border rounded shadow-xl z-20">
                                {(['USD', 'CNY', 'BTC'] as CurrencyUnit[]).map(u => (
                                    <button key={u} onClick={() => { setUnit(u); setIsUnitOpen(false); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">{u}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="text-4xl font-bold text-text mb-2 tracking-tight">
                    {hideBalance ? '******' : (
                        <>
                        <span className="text-2xl align-top mr-1">{unit === 'USD' ? '$' : unit === 'CNY' ? '¥' : '₿'}</span>
                        {displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: unit === 'BTC' ? 6 : 2 })}
                        </>
                    )}
                </div>
                
                <div className="flex items-center gap-3">
                     <span className={`text-sm font-bold flex items-center ${percentageChange >= 0 ? 'text-success' : 'text-danger'}`}>
                        <TrendingUp size={16} className="mr-1" /> {formatPct(percentageChange)}
                     </span>
                     <span className="text-xs text-muted bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        Past {period}
                     </span>
                </div>
            </div>

            {/* Right: Chart */}
            <div className="p-6 md:w-2/3 flex flex-col">
                <div className="flex justify-end mb-4">
                    <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg border border-border">
                        {(['1D', '1W', '1M', '3M'] as TimePeriod[]).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                                    period === p 
                                    ? 'bg-primary text-white shadow-sm' 
                                    : 'text-muted hover:text-text'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 min-h-[220px] w-full">
                     {assetHistory.length < 2 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted text-sm border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg">
                            Loading Trend...
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={assetHistory}>
                                <defs>
                                    <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#334155" : "#e2e8f0"} vertical={false} />
                                <XAxis 
                                    dataKey="ts" 
                                    tickFormatter={(ts) => {
                                        const date = new Date(parseInt(ts));
                                        return period === '1D' ? date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : date.toLocaleDateString(undefined, {month:'numeric', day:'numeric'});
                                    }}
                                    stroke="#94a3b8"
                                    fontSize={10}
                                    minTickGap={40}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis 
                                    stroke="#94a3b8"
                                    fontSize={10}
                                    domain={['auto', 'auto']}
                                    tickFormatter={(val) => hideBalance ? '***' : `${val/1000}k`}
                                    axisLine={false}
                                    tickLine={false}
                                    width={35}
                                />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: '#334155', color: theme === 'dark' ? '#f1f5f9' : '#0f172a', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelFormatter={(ts) => new Date(parseInt(ts)).toLocaleString()}
                                    formatter={(value: number) => [hideBalance ? '******' : `$${value.toLocaleString()}`, 'Equity']}
                                    cursor={{stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4'}}
                                />
                                <Area type="monotone" dataKey="totalEq" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorEq)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden transition-colors">
        <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-lg">{t.positions}</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900/50 text-muted text-xs uppercase">
                    <tr>
                        <th className="px-6 py-3">{t.symbol}</th>
                        <th className="px-6 py-3">Side</th>
                        <th className="px-6 py-3">{t.size}</th>
                        <th className="px-6 py-3 text-right">{t.entryPrice}</th>
                        <th className="px-6 py-3 text-right">{t.pnl}</th>
                        <th className="px-6 py-3 text-right">{t.action}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {positions.length === 0 ? (
                        <tr><td colSpan={6} className="p-6 text-center text-muted">No open positions</td></tr>
                    ) : positions.map((pos) => {
                        let sizeDisplay = pos.instId.includes('SWAP') && pos.ctVal ? `${(parseFloat(pos.pos) * parseFloat(pos.ctVal)).toFixed(4)}` : formatAmount(pos.pos);
                        return (
                        <React.Fragment key={pos.instId}>
                            <tr className="hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 font-medium flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pos.instId.includes('SWAP') ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {pos.instId.includes('SWAP') ? t.contract : t.spot}
                                    </span>
                                    {pos.instId}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`uppercase font-bold text-xs px-2 py-1 rounded ${pos.posSide === 'short' ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'}`}>
                                        {pos.posSide}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-mono">{sizeDisplay}</td>
                                <td className="px-6 py-4 text-right font-mono">{formatPrice(pos.avgPx)}</td>
                                <td className={`px-6 py-4 text-right font-mono font-bold ${parseFloat(pos.upl) >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {hideBalance ? '****' : (parseFloat(pos.upl) > 0 ? '+' : '') + formatPrice(pos.upl)}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => setExpandedPosition(expandedPosition === pos.instId ? null : pos.instId)} className="text-primary hover:text-blue-400 flex items-center justify-end gap-1 ml-auto text-xs bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded">
                                        {t.viewChart} {expandedPosition === pos.instId ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                    </button>
                                </td>
                            </tr>
                            {expandedPosition === pos.instId && (
                                <tr>
                                    <td colSpan={6} className="p-4 bg-slate-50 dark:bg-slate-900/50 h-[450px]">
                                        <div className="w-full h-full rounded-lg overflow-hidden border border-border bg-surface">
                                            <TradingChart instId={pos.instId} theme={theme} service={service} position={pos} orders={expandedOrders} onCancelOrder={handleCancelOrder} />
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    )})}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
