import { getCurrentPrice } from './marketSimulation';
import {
  createTransaction,
  updatePortfolio,
  updateUserBalance,
  getPortfolios,
  createOrder,
  getOrders,
  User,
  Order,
} from './supabase';

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
  }
}

import { supabase } from './supabase';
