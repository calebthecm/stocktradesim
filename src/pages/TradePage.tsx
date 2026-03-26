import { useState, useEffect, useCallback } from 'react';
import { User, getOrders, getPortfolios, Order } from '../services/supabase';
import { getCurrentPrice, getAllStocks } from '../services/marketSimulation';
import { placeBracketOrder, executeShortOrder, executeCoverOrder, TradeResult } from '../services/tradingEngine';
import { CandlestickChart } from '../components/CandlestickChart';
import { DrawingToolbox, DrawingTool } from '../components/DrawingToolbox';
import { useStockPrice } from '../hooks/useStockPrice';

interface TradePageProps {
  user: User;
  initialSymbol?: string;
  onBack: () => void;
  onOrderExecuted?: () => void;
  marketOpen?: boolean;
}

type OrderType = 'MKT' | 'LMT' | 'STOP';

export function TradePage({
  user,
  initialSymbol = 'AAPL',
  onBack,
  onOrderExecuted,
  marketOpen = true,
}: TradePageProps) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [tradeMode, setTradeMode] = useState<'long' | 'short'>('long');
  const [orderType, setOrderType] = useState<OrderType>('MKT');
  const [quantity, setQuantity] = useState('10');
  const [limitPrice, setLimitPrice] = useState('');
  const [tpPrice, setTpPrice] = useState<number | null>(null);
  const [slPrice, setSlPrice] = useState<number | null>(null);
  const [entryPrice, setEntryPrice] = useState(0);
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shortWarning, setShortWarning] = useState(false);

  const { price } = useStockPrice(symbol, 1000);
  const stocks = getAllStocks();

  useEffect(() => {
    if (orderType === 'MKT') setEntryPrice(price);
  }, [price, orderType]);

  useEffect(() => {
    const load = async () => {
      const all = await getOrders(user.id);
      setOrders(all.filter((o) => o.status === 'pending'));
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    const check = async () => {
      if (tradeMode !== 'short') return;
      const ports = await getPortfolios(user.id);
      const pos = ports.find((p) => p.symbol === symbol);
      if (pos && pos.quantity < 0 && pos.short_entry_price) {
        setShortWarning(getCurrentPrice(symbol) > pos.short_entry_price * 1.25);
      } else {
        setShortWarning(false);
      }
    };
    check();
  }, [tradeMode, symbol, user]);

  const handleTradeIntent = useCallback(
    (entry: number, tp: number | null, sl: number | null) => {
      setEntryPrice(entry);
      setTpPrice(tp);
      setSlPrice(sl);
      if (orderType === 'LMT' || orderType === 'STOP') setLimitPrice(String(entry));
    },
    [orderType],
  );

  const rrRatio =
    tpPrice && slPrice && entryPrice
      ? Math.abs(tpPrice - entryPrice) / Math.abs(slPrice - entryPrice)
      : null;

  const qty = parseInt(quantity, 10) || 0;
  const execPrice = orderType === 'MKT' ? price : parseFloat(limitPrice) || price;
  const totalCost = qty * execPrice;

  const submitLabel = () => {
    if (tradeMode === 'short') return `SHORT ${symbol}`;
    return `BUY ${symbol}`;
  };

  const handleSubmit = async () => {
    if (!marketOpen || isSubmitting || qty <= 0) return;
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    let result: TradeResult;
    if (tradeMode === 'short') {
      const ports = await getPortfolios(user.id);
      const pos = ports.find((p) => p.symbol === symbol);
      if (pos && pos.quantity < 0) {
        result = await executeCoverOrder(user, symbol, qty);
      } else {
        result = await executeShortOrder(user, symbol, qty);
      }
    } else {
      result = await placeBracketOrder(user, symbol, qty, tpPrice, slPrice);
    }

    if (result.success) {
      setSuccess(`Order executed: ${result.message}`);
      setTimeout(() => {
        setSuccess('');
        onOrderExecuted?.();
      }, 1500);
    } else {
      setError(result.message);
    }
    setIsSubmitting(false);
  };

  // orders is loaded for pending-order awareness; rendering is deferred to a future panel
  void orders;
  // onBack is retained in props for parent compatibility; no back button in terminal layout
  void onBack;

  return (
    <div className="flex flex-col h-[calc(100vh-70px)]">

      {/* Symbol / Timeframe Bar */}
      <div className="bg-sim-surface border-b border-sim-border h-10 flex items-center px-3 gap-3 flex-shrink-0">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-sim-bg border border-sim-border text-sim-text font-black text-[13px] rounded px-2 py-1 outline-none"
        >
          {stocks.map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.symbol} — {s.name}
            </option>
          ))}
        </select>

        <div className="w-px h-5 bg-sim-border" />

        <span className="text-[18px] font-black font-mono text-sim-green">${price.toFixed(2)}</span>
        <span className="text-[11px] text-sim-muted">{symbol}</span>

        <div className="w-px h-5 bg-sim-border" />

        {/* R/R display */}
        <div className="ml-auto flex items-center gap-4 text-[10px]">
          {entryPrice > 0 && (
            <span className="text-sim-muted">
              Entry{' '}
              <span className="font-mono font-bold text-sim-blue">${entryPrice.toFixed(2)}</span>
            </span>
          )}
          {tpPrice && (
            <span className="text-sim-muted">
              TP{' '}
              <span className="font-mono font-bold text-sim-green">${tpPrice.toFixed(2)}</span>
            </span>
          )}
          {slPrice && (
            <span className="text-sim-muted">
              SL{' '}
              <span className="font-mono font-bold text-sim-red">${slPrice.toFixed(2)}</span>
            </span>
          )}
          {rrRatio && (
            <span className="text-sim-muted">
              R/R{' '}
              <span className="font-mono font-bold text-sim-amber">1:{rrRatio.toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Toolbox + Chart */}
      <div className="flex flex-1 overflow-hidden">
        <DrawingToolbox activeTool={activeTool} onToolChange={setActiveTool} />
        <div className="flex-1 overflow-hidden">
          <CandlestickChart symbol={symbol} onTradeIntent={handleTradeIntent} />
        </div>
      </div>

      {/* Order Bar */}
      <div
        className={`border-t border-sim-border h-11 flex items-center px-3 gap-3 flex-shrink-0 ${
          marketOpen ? 'bg-sim-surface' : 'bg-sim-surface/60'
        }`}
      >
        {!marketOpen && (
          <span className="text-[9px] font-black text-sim-red border border-sim-red/30 bg-sim-red/5 px-2 py-1 rounded tracking-[0.5px]">
            MARKET CLOSED
          </span>
        )}

        {/* Long / Short toggle */}
        <div className="flex rounded overflow-hidden border border-sim-border">
          <button
            onClick={() => setTradeMode('long')}
            className={`px-3 py-1 text-[11px] font-black transition-colors ${
              tradeMode === 'long' ? 'bg-sim-green text-sim-bg' : 'text-sim-muted hover:text-sim-text'
            }`}
          >
            LONG
          </button>
          <button
            onClick={() => setTradeMode('short')}
            className={`px-3 py-1 text-[11px] font-black transition-colors ${
              tradeMode === 'short' ? 'bg-sim-red text-white' : 'text-sim-muted hover:text-sim-text'
            }`}
          >
            SHORT
          </button>
        </div>

        <div className="w-px h-5 bg-sim-border" />

        {/* Qty */}
        <div className="flex flex-col">
          <span className="text-[8px] text-sim-muted uppercase tracking-[0.5px]">Qty</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-16 bg-sim-bg border border-sim-border text-sim-text font-mono font-bold text-[12px] rounded px-2 py-0.5 outline-none focus:border-sim-blue"
          />
        </div>

        {/* Order type */}
        <div className="flex rounded overflow-hidden border border-sim-border">
          {(['MKT', 'LMT', 'STOP'] as OrderType[]).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                orderType === t ? 'bg-sim-hover text-sim-text' : 'text-sim-muted hover:text-sim-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Price input — LMT/STOP only */}
        {orderType !== 'MKT' && (
          <div className="flex flex-col">
            <span className="text-[8px] text-sim-muted uppercase tracking-[0.5px]">Price</span>
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="w-24 bg-sim-bg border border-sim-border text-sim-text font-mono font-bold text-[12px] rounded px-2 py-0.5 outline-none focus:border-sim-blue"
            />
          </div>
        )}

        <div className="w-px h-5 bg-sim-border" />

        {/* Take Profit */}
        <div className="flex flex-col">
          <span className="text-[8px] text-sim-green uppercase tracking-[0.5px]">Take Profit</span>
          <input
            type="number"
            value={tpPrice ?? ''}
            onChange={(e) => setTpPrice(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="—"
            className="w-24 bg-sim-bg border border-sim-green/20 text-sim-green font-mono font-bold text-[12px] rounded px-2 py-0.5 outline-none focus:border-sim-green"
          />
        </div>

        {/* Stop Loss */}
        <div className="flex flex-col">
          <span className="text-[8px] text-sim-red uppercase tracking-[0.5px]">Stop Loss</span>
          <input
            type="number"
            value={slPrice ?? ''}
            onChange={(e) => setSlPrice(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="—"
            className="w-24 bg-sim-bg border border-sim-red/20 text-sim-red font-mono font-bold text-[12px] rounded px-2 py-0.5 outline-none focus:border-sim-red"
          />
        </div>

        <div className="w-px h-5 bg-sim-border" />

        {/* Cost + R/R preview */}
        <div className="flex flex-col text-[10px]">
          <span className="font-mono font-bold text-sim-text">
            ${totalCost.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </span>
          {rrRatio && <span className="text-sim-amber font-bold">R/R 1:{rrRatio.toFixed(1)}</span>}
        </div>

        {/* Error / success / warning */}
        {error && (
          <span className="text-sim-red text-[10px] max-w-[160px] truncate">{error}</span>
        )}
        {success && (
          <span className="text-sim-green text-[10px] max-w-[160px] truncate">{success}</span>
        )}
        {shortWarning && !error && (
          <span className="text-sim-amber text-[10px]">Short up 25%+</span>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!marketOpen || isSubmitting || qty <= 0}
          className={`ml-auto px-4 py-1.5 rounded font-black text-[12px] tracking-[0.5px] transition-colors ${
            marketOpen && qty > 0 && !isSubmitting
              ? tradeMode === 'long'
                ? 'bg-sim-green text-sim-bg hover:opacity-90'
                : 'bg-sim-red text-white hover:opacity-90'
              : 'bg-sim-hover text-sim-muted cursor-not-allowed'
          }`}
        >
          {isSubmitting ? '...' : submitLabel()}
        </button>
      </div>
    </div>
  );
}
