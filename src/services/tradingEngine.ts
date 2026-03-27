import { v4 as uuidv4 } from 'uuid';
import { getCurrentPrice, getDividendYield } from './marketSimulation';
import {
  createTransaction,
  updatePortfolio,
  updatePortfolioShort,
  updateUserBalance,
  getPortfolios,
  createOrder,
  getOrders,
  cancelBracketSiblings,
} from './supabase';
import type { User, Order, Portfolio } from './supabase';

export interface TradeResult {
  success: boolean;
  message: string;
  transactionId?: string;
  newBalance?: number;
  newQuantity?: number;
}

export async function executeBuyOrder(
  user: User,
  symbol: string,
  quantity: number,
  price?: number
): Promise<TradeResult> {
  const executionPrice = price || getCurrentPrice(symbol);

  if (executionPrice <= 0) {
    return { success: false, message: 'Invalid stock symbol' };
  }

  const totalCost = quantity * executionPrice;

  if (totalCost > user.virtual_balance) {
    return { success: false, message: 'Insufficient balance for this purchase' };
  }

  const portfolios = await getPortfolios(user.id);
  const existingPosition = portfolios.find((p) => p.symbol === symbol);

  let newQuantity = quantity;
  let newAverageCost = executionPrice;

  if (existingPosition) {
    const totalValue = existingPosition.quantity * existingPosition.average_cost_basis + totalCost;
    newQuantity = existingPosition.quantity + quantity;
    newAverageCost = totalValue / newQuantity;
  }

  const transaction = await createTransaction(user.id, symbol, 'buy', quantity, executionPrice);

  if (!transaction) {
    return { success: false, message: 'Failed to create transaction' };
  }

  const newBalance = user.virtual_balance - totalCost;

  const portfolioSuccess = await updatePortfolio(user.id, symbol, newQuantity, newAverageCost);

  if (!portfolioSuccess) {
    return { success: false, message: 'Failed to update portfolio' };
  }

  const balanceSuccess = await updateUserBalance(user.id, newBalance);

  if (!balanceSuccess) {
    return { success: false, message: 'Failed to update balance' };
  }

  return {
    success: true,
    message: `Successfully bought ${quantity} shares of ${symbol} at $${executionPrice}`,
    transactionId: transaction.id,
    newBalance,
    newQuantity,
  };
}

export async function executeSellOrder(
  user: User,
  symbol: string,
  quantity: number,
  price?: number
): Promise<TradeResult> {
  const executionPrice = price || getCurrentPrice(symbol);

  if (executionPrice <= 0) {
    return { success: false, message: 'Invalid stock symbol' };
  }

  const portfolios = await getPortfolios(user.id);
  const position = portfolios.find((p) => p.symbol === symbol);

  if (!position || position.quantity < quantity) {
    return { success: false, message: 'Insufficient shares to sell' };
  }

  const totalProceeds = quantity * executionPrice;

  const transaction = await createTransaction(user.id, symbol, 'sell', quantity, executionPrice);

  if (!transaction) {
    return { success: false, message: 'Failed to create transaction' };
  }

  const newQuantity = position.quantity - quantity;
  const newBalance = user.virtual_balance + totalProceeds;

  if (newQuantity > 0) {
    const portfolioSuccess = await updatePortfolio(user.id, symbol, newQuantity, position.average_cost_basis);

    if (!portfolioSuccess) {
      return { success: false, message: 'Failed to update portfolio' };
    }
  } else {
    const { error } = await supabase.from('portfolios').delete().eq('id', position.id);

    if (error) {
      return { success: false, message: 'Failed to remove position from portfolio' };
    }
  }

  const balanceSuccess = await updateUserBalance(user.id, newBalance);

  if (!balanceSuccess) {
    return { success: false, message: 'Failed to update balance' };
  }

  return {
    success: true,
    message: `Successfully sold ${quantity} shares of ${symbol} at $${executionPrice}`,
    transactionId: transaction.id,
    newBalance,
    newQuantity,
  };
}

export async function validateBuyOrder(user: User, symbol: string, quantity: number, price?: number): Promise<string | null> {
  if (quantity <= 0) {
    return 'Quantity must be greater than 0';
  }

  const executionPrice = price || getCurrentPrice(symbol);

  if (executionPrice <= 0) {
    return 'Invalid stock symbol';
  }

  const totalCost = quantity * executionPrice;

  if (totalCost > user.virtual_balance) {
    return `Insufficient balance. Need $${totalCost.toFixed(2)}, have $${user.virtual_balance.toFixed(2)}`;
  }

  return null;
}

export async function validateSellOrder(user: User, symbol: string, quantity: number): Promise<string | null> {
  if (quantity <= 0) {
    return 'Quantity must be greater than 0';
  }

  const portfolios = await getPortfolios(user.id);
  const position = portfolios.find((p) => p.symbol === symbol);

  if (!position) {
    return `You don't own any shares of ${symbol}`;
  }

  if (position.quantity < quantity) {
    return `You only own ${position.quantity} shares of ${symbol}`;
  }

  return null;
}

export async function checkAndExecutePendingOrders(user: User): Promise<void> {
  const orders = await getOrders(user.id);
  const pendingOrders = orders.filter((o) => o.status === 'pending');

  for (const order of pendingOrders) {
    const currentPrice = getCurrentPrice(order.symbol);

    if (currentPrice <= 0) continue;

    let shouldExecute = false;

    if (order.type === 'market') {
      shouldExecute = true;
    } else if (order.type === 'limit') {
      if (order.side === 'buy' && currentPrice <= order.price) {
        shouldExecute = true;
      } else if (order.side === 'sell' && currentPrice >= order.price) {
        shouldExecute = true;
      }
    } else if (order.type === 'stop_loss') {
      if (currentPrice <= order.stop_price!) {
        shouldExecute = true;
      }
    } else if (order.type === 'stop_loss_limit') {
      if (currentPrice <= order.stop_price! && currentPrice <= order.price) {
        shouldExecute = true;
      }
    } else if (order.type === 'take_profit') {
      if (order.side === 'sell' && currentPrice >= order.price) shouldExecute = true;
      if (order.side === 'buy'  && currentPrice <= order.price) shouldExecute = true;
    }

    if (shouldExecute) {
      await executeOrder(order, user, currentPrice);
    }
  }
}

async function executeOrder(order: Order, user: User, executionPrice: number): Promise<void> {
  let result;

  if (order.side === 'buy') {
    result = await executeBuyOrder(user, order.symbol, order.quantity, executionPrice);
  } else {
    result = await executeSellOrder(user, order.symbol, order.quantity, executionPrice);
  }

  if (result.success) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'filled', filled_at: new Date().toISOString() })
      .eq('id', order.id);

    if (error) {
      console.error('Error updating order status:', error);
    }

    // Cancel sibling legs of a bracket order
    if (order.bracket_id) {
      await cancelBracketSiblings(order.bracket_id, order.id);
    }
  }
}

import { supabase } from './supabase';

// Place a market buy + optional take profit + stop loss bracket
export async function placeBracketOrder(
  user: User,
  symbol: string,
  quantity: number,
  takeProfitPrice: number | null,
  stopLossPrice: number | null
): Promise<TradeResult> {
  const currentPrice = getCurrentPrice(symbol);

  const buyResult = await executeBuyOrder(user, symbol, quantity, currentPrice);
  if (!buyResult.success) return buyResult;

  if (takeProfitPrice === null && stopLossPrice === null) return buyResult;

  const bracketId = uuidv4();

  if (takeProfitPrice !== null) {
    await createOrder(user.id, symbol, 'take_profit', 'sell', quantity, takeProfitPrice, undefined, bracketId);
  }
  if (stopLossPrice !== null) {
    await createOrder(user.id, symbol, 'stop_loss', 'sell', quantity, stopLossPrice, stopLossPrice, bracketId);
  }

  return {
    ...buyResult,
    message: `Bought ${quantity} ${symbol} at $${currentPrice}` +
      (takeProfitPrice ? ` · TP $${takeProfitPrice}` : '') +
      (stopLossPrice   ? ` · SL $${stopLossPrice}`   : ''),
  };
}

export async function validateShortOrder(user: User, symbol: string, quantity: number): Promise<string | null> {
  if (quantity <= 0) return 'Quantity must be greater than 0';

  const currentPrice = getCurrentPrice(symbol);
  if (currentPrice <= 0) return 'Invalid stock symbol';

  const requiredCollateral = quantity * currentPrice * 1.5;
  if (user.virtual_balance < requiredCollateral) {
    return `Insufficient collateral. Need $${requiredCollateral.toFixed(2)} (150% of position value), have $${user.virtual_balance.toFixed(2)}`;
  }
  return null;
}

export async function executeShortOrder(
  user: User,
  symbol: string,
  quantity: number,
): Promise<TradeResult> {
  const currentPrice = getCurrentPrice(symbol);
  if (currentPrice <= 0) return { success: false, message: 'Invalid stock symbol' };

  const validation = await validateShortOrder(user, symbol, quantity);
  if (validation) return { success: false, message: validation };

  const collateral = quantity * currentPrice * 1.5;
  const newBalance = user.virtual_balance - collateral;

  const portfolios = await getPortfolios(user.id);
  const existing = portfolios.find((p) => p.symbol === symbol);

  let newQty: number;
  let newEntryPrice: number;

  if (existing && existing.quantity < 0) {
    // VWAP for existing short position
    const existingAbs = Math.abs(existing.quantity);
    newQty = existing.quantity - quantity;
    newEntryPrice = (existingAbs * (existing.short_entry_price ?? currentPrice) + quantity * currentPrice)
                    / (existingAbs + quantity);
  } else {
    newQty = -(quantity);
    newEntryPrice = currentPrice;
  }

  const transaction = await createTransaction(user.id, symbol, 'sell', quantity, currentPrice);
  if (!transaction) return { success: false, message: 'Failed to create transaction' };

  const ok = await updatePortfolioShort(user.id, symbol, newQty, newEntryPrice);
  if (!ok) return { success: false, message: 'Failed to update portfolio' };

  const balOk = await updateUserBalance(user.id, newBalance);
  if (!balOk) return { success: false, message: 'Failed to update balance' };

  return {
    success: true,
    message: `Shorted ${quantity} shares of ${symbol} at $${currentPrice} · collateral held: $${collateral.toFixed(2)}`,
    newBalance,
    newQuantity: newQty,
  };
}

export async function executeCoverOrder(
  user: User,
  symbol: string,
  quantity: number,
): Promise<TradeResult> {
  const currentPrice = getCurrentPrice(symbol);
  if (currentPrice <= 0) return { success: false, message: 'Invalid stock symbol' };

  const portfolios = await getPortfolios(user.id);
  const position = portfolios.find((p) => p.symbol === symbol);

  if (!position || position.quantity >= 0) {
    return { success: false, message: `No short position in ${symbol} to cover` };
  }

  const shortQty = Math.abs(position.quantity);
  if (quantity > shortQty) {
    return { success: false, message: `Can only cover up to ${shortQty} shares` };
  }

  const entryPrice = position.short_entry_price ?? currentPrice;
  const pnl = (entryPrice - currentPrice) * quantity;
  const collateralReturned = quantity * entryPrice * 1.5;
  const creditToBalance = collateralReturned + pnl;
  const newBalance = user.virtual_balance + creditToBalance;

  const transaction = await createTransaction(user.id, symbol, 'buy', quantity, currentPrice);
  if (!transaction) return { success: false, message: 'Failed to create transaction' };

  const remaining = position.quantity + quantity; // less negative or 0

  if (remaining === 0) {
    const { error } = await supabase.from('portfolios').delete().eq('id', position.id);
    if (error) return { success: false, message: 'Failed to close short position' };
  } else {
    const ok = await updatePortfolioShort(user.id, symbol, remaining, entryPrice);
    if (!ok) return { success: false, message: 'Failed to update portfolio' };
  }

  const balOk = await updateUserBalance(user.id, newBalance);
  if (!balOk) return { success: false, message: 'Failed to update balance' };

  return {
    success: true,
    message: `Covered ${quantity} shares of ${symbol} · P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
    newBalance,
    newQuantity: remaining,
  };
}

const TICKS_PER_DAY = 86400;
// Trading days per year: 252 (used to derive DAYS_PER_QUARTER below)
const DAYS_PER_QUARTER = 91.25; // 365 / 4

export async function creditDividends(user: User, portfolios: Portfolio[]): Promise<void> {
  // Accumulate total dividends first, then make a single balance update.
  // Writing inside the loop would overwrite with a stale base balance each iteration.
  let totalDividend = 0;

  for (const position of portfolios) {
    if (position.quantity <= 0) continue;

    const yieldPerQuarter = getDividendYield(position.symbol);
    if (yieldPerQuarter === 0) continue;

    const currentPrice = getCurrentPrice(position.symbol);
    const yieldPerTick = yieldPerQuarter / (DAYS_PER_QUARTER * TICKS_PER_DAY);
    const dividend = position.quantity * currentPrice * yieldPerTick;

    if (dividend < 0.0001) continue;

    totalDividend += dividend;
    await createTransaction(user.id, position.symbol, 'dividend', position.quantity, dividend / position.quantity);
  }

  if (totalDividend > 0) {
    await updateUserBalance(user.id, user.virtual_balance + totalDividend);
  }
}
