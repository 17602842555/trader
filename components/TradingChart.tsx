
import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, MouseEventParams, CrosshairMode, CandlestickSeries } from 'lightweight-charts';
import { OKXService } from '../services/okxService';
import { Position, CandleInterval, Order, PriceClickCallback, AlgoOrderCallback } from '../types';
import { Loader2, X, MoveVertical } from 'lucide-react';
import { formatPrice, formatNumberForApi, calculatePnL } from '../utils/formatting';

interface TradingChartProps {
  instId: string;
  theme: 'dark' | 'light';
  service: OKXService;
  position?: Position;
  orders?: Order[];
  onCancelOrder?: (order: Order) => void;
  onModifyOrder?: (order: Order, newPrice: string) => void;
  onPriceClick?: PriceClickCallback;
  onAddAlgo?: AlgoOrderCallback;
  colorMode?: 'standard' | 'reverse';
}

const INTERVALS: CandleInterval[] = ['15m', '1H', '4H', '1D', '1W'];

const TradingChart: React.FC<TradingChartProps> = ({ 
    instId, theme, service, position, orders = [], 
    onCancelOrder, onModifyOrder, onPriceClick, onAddAlgo,
    colorMode = 'standard'
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | any>(null);
  
  // State for HTML Overlay
  const [overlayOrders, setOverlayOrders] = useState<Array<{
      order: Order;
      y: number;
      price: number;
      label: string;
      color: string;
      estimatedPnL?: number | null;
  }>>([]);

  const [interval, setIntervalVal] = useState<CandleInterval>('1D');
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [draggingOrder, setDraggingOrder] = useState<Order | null>(null);
  const [dragY, setDragY] = useState(0);

  // Position Drag State (for creating SL/TP)
  const [draggingPosition, setDraggingPosition] = useState(false);
  const [dragAlgoType, setDragAlgoType] = useState<'sl' | 'tp' | null>(null);
  const [positionY, setPositionY] = useState<number | null>(null); // For rendering the handle
  const [algoDragY, setAlgoDragY] = useState(0); // Current drag Y

  // Color Definitions
  const colors = {
      up: colorMode === 'reverse' ? '#ef4444' : '#10b981',
      down: colorMode === 'reverse' ? '#10b981' : '#ef4444',
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let isMounted = true;

    // Initialize Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'Solid' as any, color: theme === 'dark' ? '#1e293b' : '#ffffff' },
        textColor: theme === 'dark' ? '#94a3b8' : '#334155',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#334155' : '#e2e8f0' },
        horzLines: { color: theme === 'dark' ? '#334155' : '#e2e8f0' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 450,
      timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
      },
      rightPriceScale: {
          borderVisible: false,
          borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
      },
      crosshair: {
          mode: CrosshairMode.Normal, // Normal (0) allows free movement
          vertLine: { labelVisible: false },
      },
      localization: {
          priceFormatter: (p: number) => formatPrice(p),
      }
    });

    // V5 Usage: addSeries(CandlestickSeries, options)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle Infinite Scroll (Load Older Data)
    chart.timeScale().subscribeVisibleLogicalRangeChange(async (newVisibleLogicalRange) => {
        if (!isMounted || isLoadingMore || !seriesRef.current) return;
        if (!newVisibleLogicalRange) return;

        // If user scrolled to the left (start of data)
        if (newVisibleLogicalRange.from < 0) {
            const data = seriesRef.current.data();
            if (data.length > 0) {
                const oldest = data[0] as any;
                if (oldest) {
                    setIsLoadingMore(true);
                    try {
                        // Pass oldest timestamp as 'after' to get older candles
                        const moreData = await service.getCandles(instId, interval, oldest.time);
                        if (moreData.length > 0 && isMounted) {
                             const allData = [...moreData, ...data];
                             seriesRef.current.setData(allData as any);
                        }
                    } catch(e) { console.error(e) }
                    finally { if(isMounted) setIsLoadingMore(false); }
                }
            }
        }
    });
    
    // Subscribe to Click for Price Selection
    chart.subscribeClick((param: MouseEventParams) => {
        if (!isMounted || !seriesRef.current || !onPriceClick) return;
        
        // Prevent triggering price selection when dragging logic is active
        if (param.point) {
            const price = seriesRef.current.coordinateToPrice(param.point.y);
            if (price) {
                const formatted = formatNumberForApi(price);
                if (formatted) onPriceClick(formatted);
            }
        }
    });

    // Load Initial Data
    const loadInitial = async () => {
        if (!isMounted) return;
        setLoading(true);
        try {
            const data = await service.getCandles(instId, interval);
            if (isMounted && chartRef.current && seriesRef.current && data.length > 0) {
                candlestickSeries.setData(data as any);
                chart.timeScale().fitContent();
            }
        } catch (e) {
            console.error("Failed to load candles", e);
        } finally {
            if (isMounted) setLoading(false);
        }
    };
    loadInitial();

    const candlePoll = setInterval(async () => {
       if (!isMounted || !seriesRef.current || !chartRef.current) return;
       try {
           const data = await service.getCandles(instId, interval); 
           if (!isMounted || !seriesRef.current || !chartRef.current) return;
           if (data.length > 0) {
               const latestFromApi = data[data.length - 1];
               seriesRef.current.update(latestFromApi as any);
           }
       } catch (error) {}
    }, 10000); 

    const tickerPoll = setInterval(async () => {
        if (!isMounted || !seriesRef.current || !chartRef.current) return;
        try {
            const ticker = await service.getTicker(instId);
            const currentPrice = parseFloat(ticker.last);
            const data = seriesRef.current.data();
            if (data.length === 0) return;
            const lastCandle = data[data.length - 1] as any;
            if (!lastCandle) return;
            const updatedCandle = {
                ...lastCandle,
                high: Math.max(lastCandle.high, currentPrice),
                low: Math.min(lastCandle.low, currentPrice),
                close: currentPrice
            };
            seriesRef.current.update(updatedCandle);
        } catch (e) {}
    }, 800);

    const handleResize = () => {
      if (isMounted && chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);
      clearInterval(candlePoll);
      clearInterval(tickerPoll);
      if (chartRef.current) {
          try {
            chart.remove();
          } catch(e) {}
          chartRef.current = null;
          seriesRef.current = null;
      }
    };
  }, [instId, theme, interval, service, colorMode]); 

  // Update HTML Overlay for Orders & Position Handle
  useEffect(() => {
    let animationFrameId: number;

    const updateOverlayPosition = () => {
        if (!seriesRef.current || !chartRef.current) return;

        // 1. Orders
        if (orders) {
            const overlayItems: any[] = [];
            orders.forEach(order => {
                if (order.instId !== instId) return;
                if (draggingOrder && draggingOrder.ordId === order.ordId) return;

                const isTrigger = !!order.triggerPx && parseFloat(order.triggerPx) > 0;
                const priceVal = isTrigger ? parseFloat(order.triggerPx!) : parseFloat(order.px);

                if (isNaN(priceVal) || priceVal <= 0) return;

                const y = seriesRef.current!.priceToCoordinate(priceVal);
                if (y === null) return;

                const isBuy = order.side === 'buy';
                // Use updated colors
                const color = isBuy ? colors.up : colors.down;
                let label = `${order.side.toUpperCase()}`;
                if (['sl', 'tp'].includes(order.ordType)) label = `${order.ordType.toUpperCase()}`;
                else if (isTrigger) label += ` Trigger`;
                
                // Estimate PnL
                let estimatedPnL: number | null = null;
                if (position && (order.ordType === 'sl' || order.ordType === 'tp')) {
                    const entry = parseFloat(position.avgPx);
                    const size = parseFloat(position.pos);
                    const ctVal = parseFloat(position.ctVal || '1');
                    estimatedPnL = calculatePnL(entry, priceVal, size, position.posSide, ctVal);
                }

                overlayItems.push({ order, y, price: priceVal, label, color, estimatedPnL });
            });
            setOverlayOrders(overlayItems);
        }

        // 2. Position Handle Y
        if (position && position.instId === instId) {
            const entry = parseFloat(position.avgPx);
            const y = seriesRef.current.priceToCoordinate(entry);
            setPositionY(y);
        } else {
            setPositionY(null);
        }

        animationFrameId = requestAnimationFrame(updateOverlayPosition);
    };

    updateOverlayPosition();
    return () => cancelAnimationFrame(animationFrameId);
  }, [orders, instId, draggingOrder, interval, position, colorMode]);


  // --- Event Handlers ---

  const handleMouseDownOrder = (e: React.MouseEvent, order: Order) => {
      e.stopPropagation();
      if (!onModifyOrder) return;
      setDraggingOrder(order);
      setDragY(e.clientY);
  };

  // Start dragging Position line to create Algo
  const handleMouseDownPosition = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!position) return;
      setDraggingPosition(true);
      setAlgoDragY(e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const rect = chartContainerRef.current?.getBoundingClientRect();
      if (!rect || !seriesRef.current) return;
      const yInChart = e.clientY - rect.top;

      // Order Modify Drag
      if (draggingOrder) {
          setDragY(e.clientY);
          return;
      }

      // Algo Creation Drag
      if (draggingPosition && positionY !== null) {
          setAlgoDragY(e.clientY);
          
          const currentPrice = seriesRef.current.coordinateToPrice(yInChart);
          const entryPrice = parseFloat(position!.avgPx);
          
          if (!currentPrice) return;

          // Robust Long/Short Check
          const isShort = position?.posSide === 'short' || (position?.posSide === 'net' && parseFloat(position.pos) < 0);
          
          if (isShort) {
              // Short Position Logic:
              // Drag DOWN (Current < Entry) = Profit (TP)
              // Drag UP (Current > Entry) = Loss (SL)
              setDragAlgoType(currentPrice < entryPrice ? 'tp' : 'sl');
          } else {
              // Long Position Logic:
              // Drag UP (Current > Entry) = Profit (TP)
              // Drag DOWN (Current < Entry) = Loss (SL)
              setDragAlgoType(currentPrice > entryPrice ? 'tp' : 'sl');
          }
      }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      const rect = chartContainerRef.current?.getBoundingClientRect();
      if (!rect || !seriesRef.current) {
          setDraggingOrder(null);
          setDraggingPosition(false);
          return;
      }

      const yInChart = e.clientY - rect.top;
      const newPrice = seriesRef.current.coordinateToPrice(yInChart);

      // 1. Drop Order (Modify)
      if (draggingOrder) {
          if (newPrice && onModifyOrder) {
              const formatted = formatNumberForApi(newPrice);
              if (formatted) onModifyOrder(draggingOrder, formatted);
          }
          setDraggingOrder(null);
      } 
      // 2. Drop Position (Create Algo)
      else if (draggingPosition && dragAlgoType && position) {
          if (newPrice && onAddAlgo) {
               const formatted = formatNumberForApi(newPrice);
               if (formatted) onAddAlgo(dragAlgoType, formatted);
          }
          setDraggingPosition(false);
          setDragAlgoType(null);
      }
  };

  return (
    <div 
        className="w-full h-full relative group select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
    >
       <div ref={chartContainerRef} className="w-full h-full" />
       
       {/* --- Overlay Layer --- */}
       <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            
            {/* 1. Existing Orders */}
            {overlayOrders.map((item) => (
                <div 
                    key={item.order.ordId || item.order.algoId}
                    className="absolute right-0 flex items-center pr-2 pointer-events-auto transition-opacity hover:opacity-100"
                    style={{ top: item.y - 12, right: 60 }}
                >
                    <div 
                        className="absolute right-full w-[100vw] border-b-2" 
                        style={{ borderColor: item.color, borderStyle: 'dashed', top: 12, opacity: 0.6 }} 
                    />
                    <div 
                        className="flex items-center gap-2 px-2 py-1 rounded shadow-sm text-xs font-bold text-white cursor-grab active:cursor-grabbing border border-white/20 hover:scale-105 transition-transform"
                        style={{ backgroundColor: item.color }}
                        onMouseDown={(e) => handleMouseDownOrder(e, item.order)}
                    >
                        <MoveVertical size={10} />
                        <span>{item.label} {formatPrice(item.price)}</span>
                        {item.estimatedPnL !== null && item.estimatedPnL !== undefined && (
                            <span className="opacity-80 border-l border-white/30 pl-2 ml-1 text-[10px]">
                                {item.estimatedPnL > 0 ? '+' : ''}{item.estimatedPnL.toFixed(2)} USDT
                            </span>
                        )}
                        {onCancelOrder && (
                            <button 
                                className="p-1 hover:bg-black/20 rounded-full ml-1"
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    onCancelOrder(item.order);
                                }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {/* 2. Position Line & Drag Handle */}
            {positionY !== null && (
                <div 
                    className="absolute w-full pointer-events-auto"
                    style={{ top: positionY - 1, zIndex: 30 }}
                >
                    {/* The Line */}
                    <div className="w-full border-b-2 border-blue-500 opacity-60 dashed" style={{ borderStyle: 'solid' }}></div>
                    
                    {/* The Label/Handle */}
                    <div 
                        className="absolute right-[60px] top-[-10px] bg-blue-500 text-white text-xs px-2 py-0.5 rounded cursor-ns-resize flex items-center gap-1 shadow-md hover:bg-blue-600 transition-colors"
                        onMouseDown={handleMouseDownPosition}
                    >
                        <span>Avg Cost {position && formatPrice(position.avgPx)}</span>
                    </div>
                </div>
            )}

            {/* 3. Dragging Preview (Algo Creation) */}
            {draggingPosition && dragAlgoType && (
                 <div 
                    className="absolute w-full border-b-2 z-40 flex justify-end pr-[180px]"
                    style={{ 
                        top: (chartContainerRef.current?.getBoundingClientRect().top ? algoDragY - chartContainerRef.current.getBoundingClientRect().top : 0),
                        borderColor: dragAlgoType === 'tp' ? colors.up : colors.down,
                        borderStyle: 'dashed'
                    }}
                >
                     <span 
                        className="text-white text-xs px-2 py-1 font-bold rounded shadow"
                        style={{ backgroundColor: dragAlgoType === 'tp' ? colors.up : colors.down }}
                    >
                        Add {dragAlgoType.toUpperCase()}
                     </span>
                </div>
            )}
       </div>

       {/* Toolbar */}
       <div className="absolute top-2 left-2 flex gap-1 bg-surface border border-border p-1 rounded shadow-sm z-10">
           {INTERVALS.map(int => (
               <button 
                  key={int}
                  onClick={() => setIntervalVal(int)}
                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${interval === int ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                   {int}
               </button>
           ))}
       </div>
       
       {loading && (
           <div className="absolute top-2 right-2 p-2 bg-surface/80 rounded-full shadow border border-border">
               <Loader2 className="animate-spin text-primary" size={16} />
           </div>
       )}
    </div>
  );
};

export default TradingChart;
