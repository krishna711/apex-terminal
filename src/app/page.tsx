'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  RefreshCw, 
  Trash2, 
  Wallet, 
  Briefcase, 
  TrendingUp, 
  List, 
  TrendingDown, 
  ArrowRightLeft,
  X,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface Account {
  id: string;
  name: string;
  broker: 'DHAN' | 'ANGELONE' | 'FYERS';
  clientId: string;
  isLoggedIn: boolean;
  lastLogin: string | null;
  tokenExpiredAt: string | null;
}

interface SymbolItem {
  id: string;
  symbol: string;
  exchange: string;
  token: string;
  name: string;
}

export default function Dashboard() {
  // Account state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(true);
  
  // Add Account form state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccBroker, setNewAccBroker] = useState<'DHAN' | 'ANGELONE' | 'FYERS'>('DHAN');
  const [newAccClientId, setNewAccClientId] = useState<string>('');
  const [newAccApiKey, setNewAccApiKey] = useState<string>('');
  const [newAccApiSecret, setNewAccApiSecret] = useState<string>('');
  const [newAccPassword, setNewAccPassword] = useState<string>('');
  const [newAccTotp, setNewAccTotp] = useState<string>('');

  // Trading & Portfolio states
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'holdings' | 'orders' | 'trades' | 'funds'>('overview');
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [funds, setFunds] = useState<any>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);

  // Symbol Autocomplete states
  const [symbolInput, setSymbolInput] = useState<string>('');
  const [exchange, setExchange] = useState<string>('NSE');
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolItem | null>(null);

  // Order Form states
  const [transactionType, setTransactionType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'SL' | 'SL-M'>('MARKET');
  const [productType, setProductType] = useState<'INTRADAY' | 'CNC'>('INTRADAY');
  const [quantity, setQuantity] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [triggerPrice, setTriggerPrice] = useState<string>('');
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);

  // Basket Strategy Builder states
  const [orderMode, setOrderMode] = useState<'single' | 'basket'>('single');
  const [basketLegs, setBasketLegs] = useState<any[]>([]);
  const [isExecutingBasket, setIsExecutingBasket] = useState<boolean>(false);
  const [basketExecStatus, setBasketExecStatus] = useState<string | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Notification overlays
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Load initial accounts list
  const fetchAccounts = async () => {
    try {
      setIsLoadingAccounts(true);
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (res.ok) {
        setAccounts(data);
        if (data.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data[0].id);
        }
      } else {
        showError(data.error || 'Failed to fetch accounts');
      }
    } catch (err) {
      showError('Failed to connect to accounts service');
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Fetch portfolio data for the active selected account
  const fetchPortfolioData = async () => {
    const activeAcc = accounts.find(a => a.id === selectedAccountId);
    if (!selectedAccountId || !activeAcc || !activeAcc.isLoggedIn) {
      // Clear data if no account is selected or logged in
      setFunds(null);
      setHoldings([]);
      setPositions([]);
      setOrders([]);
      setTrades([]);
      return;
    }

    try {
      setIsLoadingData(true);
      
      // Fetch funds
      const fundsRes = await fetch(`/api/broker/funds?accountId=${selectedAccountId}`);
      if (fundsRes.ok) {
        const fundsData = await fundsRes.json();
        setFunds(fundsData);
      }

      // Fetch holdings
      const holdingsRes = await fetch(`/api/broker/holdings?accountId=${selectedAccountId}`);
      if (holdingsRes.ok) {
        const holdingsData = await holdingsRes.json();
        setHoldings(holdingsData);
      }

      // Fetch positions
      const positionsRes = await fetch(`/api/broker/positions?accountId=${selectedAccountId}`);
      if (positionsRes.ok) {
        const positionsData = await positionsRes.json();
        setPositions(positionsData);
      }

      // Fetch orders
      const ordersRes = await fetch(`/api/broker/orders?accountId=${selectedAccountId}`);
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(ordersData);
      }

      // Fetch trades
      const tradesRes = await fetch(`/api/broker/trades?accountId=${selectedAccountId}`);
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        setTrades(tradesData);
      }

    } catch (err) {
      console.error('Error loading account metrics:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchPortfolioData();
  }, [selectedAccountId, accounts]);

  // Click outside listener for symbol autocomplete box
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Re-trigger search when selected segment/exchange changes
  useEffect(() => {
    if (symbolInput.length >= 2) {
      handleSymbolSearch(symbolInput);
    }
  }, [exchange]);

  // Handle symbol autocomplete lookup
  const handleSymbolSearch = async (val: string) => {
    setSymbolInput(val);
    setSelectedSymbol(null);
    if (val.length < 2) {
      setSymbolSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const activeAcc = accounts.find(a => a.id === selectedAccountId);
    const broker = activeAcc?.broker || 'DHAN';

    try {
      const res = await fetch(`/api/broker/symbols?broker=${broker}&exchange=${exchange}&q=${val}`);
      if (res.ok) {
        const data = await res.json();
        setSymbolSuggestions(data);
        setShowSuggestions(true);
      }
    } catch (err) {
      console.error('Error fetching symbols:', err);
    }
  };

  // Helper notifications
  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // Login handler
  const handleLogin = async (accId: string) => {
    try {
      showSuccess('Initiating secure login flow...');
      const res = await fetch('/api/accounts/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accId }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess(data.message || 'Login Successful!');
        fetchAccounts(); // Reload status
      } else {
        showError(data.error || 'Login failed');
      }
    } catch (err) {
      showError('Network error during login');
    }
  };

  // Sync symbols master database
  const handleSyncSymbols = async (brokerName: 'DHAN' | 'ANGELONE') => {
    try {
      setIsSyncing(true);
      showSuccess(`Syncing ${brokerName} equity symbols. Please wait...`);
      const res = await fetch('/api/symbols/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: brokerName }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess(data.message || 'Symbols synced successfully!');
      } else {
        showError(data.error || 'Sync failed');
      }
    } catch (err) {
      showError('Failed to connect to sync server');
    } finally {
      setIsSyncing(false);
    }
  };

  // Add account handler
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName || !newAccClientId) {
      showError('Name and Client ID are required');
      return;
    }

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccName,
          broker: newAccBroker,
          clientId: newAccClientId,
          apiKey: newAccApiKey,
          apiSecret: newAccApiSecret,
          password: newAccPassword,
          totpSecret: newAccTotp,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess('Account registered successfully!');
        setShowAddModal(false);
        // Clear inputs
        setNewAccName('');
        setNewAccClientId('');
        setNewAccApiKey('');
        setNewAccApiSecret('');
        setNewAccPassword('');
        setNewAccTotp('');
        fetchAccounts();
      } else {
        showError(data.error || 'Failed to add account');
      }
    } catch (err) {
      showError('Network error adding account');
    }
  };

  // Delete account handler
  const handleDeleteAccount = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid selecting card
    if (!confirm('Are you sure you want to remove this account?')) return;

    try {
      const res = await fetch(`/api/accounts?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showSuccess('Account removed.');
        if (selectedAccountId === id) setSelectedAccountId('');
        fetchAccounts();
      } else {
        const data = await res.json();
        showError(data.error || 'Failed to delete account');
      }
    } catch (err) {
      showError('Failed to delete account');
    }
  };

  // Place Order handler
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeAcc = accounts.find(a => a.id === selectedAccountId);

    if (!selectedAccountId || !activeAcc?.isLoggedIn) {
      showError('Please select a logged in account first.');
      return;
    }

    if (!symbolInput || !quantity) {
      showError('Please enter a Symbol and Quantity.');
      return;
    }

    if (orderType === 'LIMIT' && !price) {
      showError('Price is required for Limit orders.');
      return;
    }

    try {
      setIsPlacingOrder(true);
      const res = await fetch('/api/broker/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: selectedSymbol ? selectedSymbol.symbol : symbolInput.toUpperCase(),
          exchange: selectedSymbol ? selectedSymbol.exchange : exchange,
          transactionType,
          orderType,
          productType,
          quantity: Number(quantity),
          price: price ? Number(price) : 0,
          triggerPrice: triggerPrice ? Number(triggerPrice) : 0,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess(`Order Placed! ID: ${data.orderId}`);
        // Clear order fields
        setQuantity('');
        setPrice('');
        setTriggerPrice('');
        setSymbolInput('');
        setSelectedSymbol(null);
        // Refresh positions/orders
        fetchPortfolioData();
      } else {
        showError(data.error || 'Order placement failed');
      }
    } catch (err) {
      showError('Network error placing order');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Cancel order handler
  const handleCancelOrder = async (orderId: string) => {
    if (!confirm(`Cancel order ${orderId}?`)) return;

    try {
      const res = await fetch(`/api/broker/orders?accountId=${selectedAccountId}&orderId=${orderId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        showSuccess('Order cancelled successfully.');
        fetchPortfolioData();
      } else {
        showError(data.error || 'Cancellation failed');
      }
    } catch (err) {
      showError('Failed to cancel order');
    }
  };

  // Add leg to basket
  const handleAddToBasket = () => {
    if (!symbolInput || !quantity) {
      showError('Please enter a Symbol and Quantity.');
      return;
    }

    if (orderType === 'LIMIT' && !price) {
      showError('Price is required for Limit orders.');
      return;
    }

    const newLeg = {
      id: `leg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      symbol: selectedSymbol ? selectedSymbol.symbol : symbolInput.toUpperCase(),
      exchange: selectedSymbol ? selectedSymbol.exchange : exchange,
      transactionType: transactionType.toUpperCase() as 'BUY' | 'SELL',
      orderType: orderType.toUpperCase() as 'MARKET' | 'LIMIT' | 'SL' | 'SL-M',
      productType: productType.toUpperCase(),
      quantity: Number(quantity),
      price: price ? Number(price) : 0,
      triggerPrice: triggerPrice ? Number(triggerPrice) : 0,
    };

    setBasketLegs(prev => [...prev, newLeg]);
    showSuccess(`Leg added: ${newLeg.transactionType} ${newLeg.quantity}x ${newLeg.symbol}`);

    // Reset current form inputs (leave exchange and other selections as fallback)
    setSymbolInput('');
    setQuantity('');
    setPrice('');
    setTriggerPrice('');
    setSelectedSymbol(null);
  };

  // Remove leg from basket
  const handleRemoveFromBasket = (id: string) => {
    setBasketLegs(prev => prev.filter(leg => leg.id !== id));
  };

  // Execute multi-leg basket order strategy
  const handleExecuteBasket = async () => {
    const activeAcc = accounts.find(a => a.id === selectedAccountId);

    if (!selectedAccountId || !activeAcc?.isLoggedIn) {
      showError('Please select a logged in account first.');
      return;
    }

    if (basketLegs.length === 0) {
      showError('No legs in the basket to execute.');
      return;
    }

    try {
      setIsExecutingBasket(true);
      setBasketExecStatus('Placing BUY legs first...');

      const res = await fetch('/api/broker/orders/basket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          legs: basketLegs,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess(data.message || 'Basket executed successfully!');
        setBasketLegs([]); // Clear basket on success
        fetchPortfolioData(); // Refresh portfolio data
      } else {
        showError(data.error || 'Basket execution failed');
      }
    } catch (err: any) {
      showError(`Network error executing basket: ${err.message}`);
    } finally {
      setIsExecutingBasket(false);
      setBasketExecStatus(null);
    }
  };

  const activeAccount = accounts.find(a => a.id === selectedAccountId);

  // Helper to compute Portfolio stats
  const totalHoldingsValue = holdings.reduce((acc, curr) => acc + curr.marketValue, 0);
  const totalHoldingsPnl = holdings.reduce((acc, curr) => acc + curr.pnl, 0);
  
  const totalPositionsPnl = positions.reduce((acc, curr) => acc + curr.pnl, 0);
  const activePositionsCount = positions.filter(p => p.quantity !== 0).length;

  return (
    <div className="app-container">
      {/* Notifications */}
      {errorMsg && (
        <div className="error-message" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="sync-banner" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* LEFT PANEL - Accounts Sidebar */}
      <aside className="sidebar">
        <div className="brand-section">
          <ArrowRightLeft className="text-blue-400" size={24} style={{ color: '#3b82f6' }} />
          <h2 className="brand-title">APEX TERMINAL</h2>
        </div>

        <h3 className="account-section-title">Connected Accounts</h3>

        <div className="accounts-list">
          {isLoadingAccounts ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto', animation: 'spin 1.5s linear infinite' }} />
              <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Loading accounts...</p>
            </div>
          ) : accounts.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.8rem' }}>
              No accounts registered yet.
            </div>
          ) : (
            accounts.map((acc) => (
              <div 
                key={acc.id} 
                className={`account-card ${selectedAccountId === acc.id ? 'active' : ''}`}
                onClick={() => setSelectedAccountId(acc.id)}
              >
                <div className="account-header">
                  <span className="account-name">{acc.name}</span>
                  <span className={`broker-badge ${acc.broker.toLowerCase()}`}>{acc.broker}</span>
                </div>
                <div className="account-details">
                  ID: {acc.clientId}
                </div>
                
                <div className="status-row">
                  <div className="status-indicator">
                    <div className={`status-dot ${acc.isLoggedIn ? 'green' : 'orange'}`} />
                    <span className={acc.isLoggedIn ? 'text-green' : 'text-orange'}>
                      {acc.isLoggedIn ? 'Connected' : 'Pending'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    {!acc.isLoggedIn ? (
                      <button 
                        className="action-btn login-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLogin(acc.id);
                        }}
                      >
                        <Play size={10} />
                        Login
                      </button>
                    ) : (
                      <Clock size={12} className="text-green" />
                    )}
                    <button 
                      className="action-btn logout-btn" 
                      style={{ padding: '0.3rem' }}
                      onClick={(e) => handleDeleteAccount(acc.id, e)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <button className="btn-primary-wide" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            Add Account
          </button>
        </div>
      </aside>

      {/* MAIN VIEW - Dashboard View */}
      <main className="main-content">
        {/* Top Sync & Stats banner */}
        <div className="sync-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} style={{ animation: isSyncing ? 'spin 1.5s linear infinite' : 'none' }} />
            <span>Search Symbol Master is empty? Update local scrip tokens.</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="sync-btn" onClick={() => handleSyncSymbols('DHAN')} disabled={isSyncing}>
              Sync Dhan Master
            </button>
          </div>
        </div>

        {/* Dashboard Header */}
        <div className="dashboard-header">
          <div className="dashboard-title-group">
            <h1>
              {activeAccount 
                ? `${activeAccount.name} Dashboard` 
                : 'Welcome to Apex Terminal'}
            </h1>
            <p>
              {activeAccount 
                ? `Logged in as client ${activeAccount.clientId} (${activeAccount.broker})` 
                : 'Select or add a broker account in the left panel to start trading.'}
            </p>
          </div>
          
          {activeAccount?.isLoggedIn && (
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
              Token Expiry: <span className="text-orange">Midnight</span>
            </div>
          )}
        </div>

        {/* Overview cards */}
        {activeAccount?.isLoggedIn && (
          <div className="overview-grid">
            <div className="overview-card">
              <span className="card-label">Available Balance</span>
              <div className="card-value">
                ₹{funds ? funds.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
              </div>
              <div className="card-desc">
                <Wallet size={12} />
                <span>Margin Utilized: ₹{funds ? funds.utilizedMargin.toLocaleString('en-IN') : '0'}</span>
              </div>
            </div>

            <div className={`overview-card ${totalHoldingsPnl >= 0 ? 'profit' : 'loss'}`}>
              <span className="card-label">Holdings Value</span>
              <div className="card-value">
                ₹{totalHoldingsValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="card-desc">
                {totalHoldingsPnl >= 0 ? <ArrowUpRight className="text-green" size={12} /> : <ArrowDownRight className="text-red" size={12} />}
                <span className={totalHoldingsPnl >= 0 ? 'text-green' : 'text-red'}>
                  P&L: ₹{totalHoldingsPnl.toLocaleString('en-IN')} ({holdings.length} stocks)
                </span>
              </div>
            </div>

            <div className={`overview-card ${totalPositionsPnl >= 0 ? 'profit' : 'loss'}`}>
              <span className="card-label">Real-time P&L (Positions)</span>
              <div className={`card-value ${totalPositionsPnl >= 0 ? 'text-green' : 'text-red'}`}>
                ₹{totalPositionsPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="card-desc">
                {totalPositionsPnl >= 0 ? <ArrowUpRight className="text-green" size={12} /> : <ArrowDownRight className="text-red" size={12} />}
                <span className={totalPositionsPnl >= 0 ? 'text-green' : 'text-red'}>
                  {activePositionsCount} active open positions
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard grid: Order Entry & Trade Data tabs */}
        <div className="dashboard-grid">
          {/* Order Entry Panel */}
          <div className="order-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h2 style={{ border: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>
                <ArrowRightLeft size={16} />
                Order Panel
              </h2>
              <div style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.25)', padding: '2px', borderRadius: '6px' }}>
                <button 
                  type="button"
                  onClick={() => setOrderMode('single')}
                  style={{ 
                    border: 'none', 
                    padding: '0.3rem 0.6rem', 
                    fontSize: '0.75rem', 
                    fontWeight: 600, 
                    background: orderMode === 'single' ? 'var(--color-brand)' : 'transparent', 
                    color: orderMode === 'single' ? '#fff' : 'var(--text-secondary)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Single
                </button>
                <button 
                  type="button"
                  onClick={() => setOrderMode('basket')}
                  style={{ 
                    border: 'none', 
                    padding: '0.3rem 0.6rem', 
                    fontSize: '0.75rem', 
                    fontWeight: 600, 
                    background: orderMode === 'basket' ? 'var(--color-brand)' : 'transparent', 
                    color: orderMode === 'basket' ? '#fff' : 'var(--text-secondary)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Basket
                </button>
              </div>
            </div>

            <form onSubmit={handlePlaceOrder}>
              <div className="transaction-tabs">
                <button 
                  type="button" 
                  className={`tab-btn-txn buy ${transactionType === 'BUY' ? 'active' : ''}`}
                  onClick={() => setTransactionType('BUY')}
                >
                  BUY
                </button>
                <button 
                  type="button" 
                  className={`tab-btn-txn sell ${transactionType === 'SELL' ? 'active' : ''}`}
                  onClick={() => setTransactionType('SELL')}
                >
                  SELL
                </button>
              </div>

              {/* Autocomplete Search input */}
              <div className="form-group" ref={autocompleteRef}>
                <label>Symbol / Scrip</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="Search e.g. INFY, NIFTY 24Aug"
                    value={symbolInput}
                    onChange={(e) => handleSymbolSearch(e.target.value)}
                    onFocus={() => symbolInput.length >= 2 && setShowSuggestions(true)}
                  />
                  {/* Exchange Select (Manual fallback if not selecting suggestion) */}
                  <select 
                    className="form-control" 
                    style={{ width: '90px', padding: '0.5rem' }}
                    value={exchange}
                    onChange={(e) => setExchange(e.target.value)}
                  >
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                    <option value="NFO">NFO</option>
                    <option value="BFO">BFO</option>
                  </select>
                </div>

                {showSuggestions && symbolSuggestions.length > 0 && (
                  <div className="suggestions-box">
                    {symbolSuggestions.map((item) => (
                      <div 
                        key={item.id} 
                        className="suggestion-item"
                        onClick={() => {
                          setSelectedSymbol(item);
                          setSymbolInput(item.symbol);
                          setExchange(item.exchange);
                          setShowSuggestions(false);
                        }}
                      >
                        <div>
                          <span className="item-symbol">{item.symbol}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{item.name}</span>
                        </div>
                        <span className="item-exchange">{item.exchange}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-control-row">
                <div className="form-group">
                  <label>Order Type</label>
                  <select 
                    className="form-control"
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as any)}
                  >
                    <option value="MARKET">Market</option>
                    <option value="LIMIT">Limit</option>
                    <option value="SL">Stop Loss (SL)</option>
                    <option value="SL-M">Stop Market (SL-M)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Product</label>
                  <select 
                    className="form-control"
                    value={productType}
                    onChange={(e) => setProductType(e.target.value as any)}
                  >
                    <option value="INTRADAY">Intraday (MIS)</option>
                    <option value="CNC">Carryforward / Delivery</option>
                  </select>
                </div>
              </div>

              <div className="form-control-row">
                <div className="form-group">
                  <label>Quantity</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="Qty"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required={orderMode === 'single'}
                  />
                </div>
                <div className="form-group">
                  <label>Price</label>
                  <input 
                    type="number" 
                    step="0.05"
                    className="form-control" 
                    placeholder="Price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={orderType === 'MARKET' || orderType === 'SL-M'}
                    required={(orderType === 'LIMIT' || orderType === 'SL') && orderMode === 'single'}
                  />
                </div>
              </div>

              {(orderType === 'SL' || orderType === 'SL-M') && (
                <div className="form-group">
                  <label>Trigger Price</label>
                  <input 
                    type="number" 
                    step="0.05"
                    className="form-control" 
                    placeholder="Trigger Price"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(e.target.value)}
                    required={orderMode === 'single'}
                  />
                </div>
              )}

              {orderMode === 'single' ? (
                <button 
                  type="submit" 
                  className={transactionType === 'BUY' ? 'btn-order-buy' : 'btn-order-sell'}
                  disabled={isPlacingOrder || !activeAccount?.isLoggedIn}
                  style={{ opacity: !activeAccount?.isLoggedIn ? 0.5 : 1, cursor: !activeAccount?.isLoggedIn ? 'not-allowed' : 'pointer' }}
                >
                  {isPlacingOrder ? 'Processing...' : `${transactionType} ${symbolInput ? symbolInput.toUpperCase() : 'ORDER'}`}
                </button>
              ) : (
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={handleAddToBasket}
                  style={{ width: '100%', border: '1px dashed var(--color-brand)', color: '#93c5fd', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <Plus size={14} />
                  Add Leg to Basket
                </button>
              )}
            </form>

            {/* Render Legs in Basket */}
            {orderMode === 'basket' && (
              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Basket Legs ({basketLegs.length})
                  </h3>
                  {basketLegs.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => setBasketLegs([])} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {basketLegs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.75rem', background: 'rgba(0, 0, 0, 0.1)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                    No strategy legs added yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', marginBottom: '1.25rem' }}>
                    {basketLegs.map((leg) => (
                      <div 
                        key={leg.id} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '0.5rem 0.75rem', 
                          background: 'rgba(255, 255, 255, 0.02)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '6px', 
                          fontSize: '0.75rem' 
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span className={`badge-status ${leg.transactionType === 'BUY' ? 'success' : 'danger'}`} style={{ padding: '0.05rem 0.25rem', fontSize: '0.6rem' }}>
                              {leg.transactionType}
                            </span>
                            <span style={{ fontWeight: 700 }}>{leg.symbol}</span>
                            <span className="broker-badge" style={{ padding: '0.05rem 0.2rem', fontSize: '0.6rem' }}>{leg.exchange}</span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>
                            {leg.quantity} Qty • {leg.orderType} {leg.price > 0 ? `@ ₹${leg.price}` : ''}
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveFromBasket(leg.id)} 
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isExecutingBasket && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.75rem', marginBottom: '1rem', color: '#93c5fd' }}>
                    <RefreshCw size={12} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                    <span>{basketExecStatus}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleExecuteBasket}
                  className="btn-primary-wide"
                  disabled={isExecutingBasket || basketLegs.length === 0 || !activeAccount?.isLoggedIn}
                  style={{ 
                    opacity: (isExecutingBasket || basketLegs.length === 0 || !activeAccount?.isLoggedIn) ? 0.5 : 1, 
                    cursor: (basketLegs.length === 0 || !activeAccount?.isLoggedIn) ? 'not-allowed' : 'pointer' 
                  }}
                >
                  {isExecutingBasket ? 'Executing Strategy...' : 'Execute Basket Strategy'}
                </button>
              </div>
            )}
          </div>

          {/* Details Tables (Tabs container) */}
          <div className="details-tabs-container">
            <div className="tabs-header">
              <button 
                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <Briefcase size={14} />
                Overview
              </button>
              <button 
                className={`tab-btn ${activeTab === 'positions' ? 'active' : ''}`}
                onClick={() => setActiveTab('positions')}
              >
                <TrendingUp size={14} />
                Positions
              </button>
              <button 
                className={`tab-btn ${activeTab === 'holdings' ? 'active' : ''}`}
                onClick={() => setActiveTab('holdings')}
              >
                <List size={14} />
                Holdings
              </button>
              <button 
                className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
                onClick={() => setActiveTab('orders')}
              >
                <ArrowRightLeft size={14} />
                Orders
              </button>
              <button 
                className={`tab-btn ${activeTab === 'trades' ? 'active' : ''}`}
                onClick={() => setActiveTab('trades')}
              >
                <TrendingUp size={14} />
                Trades
              </button>
            </div>

            <div className="tab-content">
              {isLoadingData ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '4rem' }}>
                  <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto', animation: 'spin 1.5s linear infinite' }} />
                  <p style={{ marginTop: '1rem' }}>Updating data books from broker...</p>
                </div>
              ) : !activeAccount?.isLoggedIn ? (
                <div className="empty-state">
                  <AlertCircle size={48} />
                  <h3>Account Session Offline</h3>
                  <p>Please select an account and click "Login" in the left panel to fetch trading data.</p>
                </div>
              ) : (
                <>
                  {/* OVERVIEW TAB */}
                  {activeTab === 'overview' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Account Details</h3>
                        <table className="data-table" style={{ width: '100%' }}>
                          <tbody>
                            <tr>
                              <td style={{ color: 'var(--text-secondary)' }}>Broker Terminal</td>
                              <td>{activeAccount.broker}</td>
                            </tr>
                            <tr>
                              <td style={{ color: 'var(--text-secondary)' }}>Client Code</td>
                              <td>{activeAccount.clientId}</td>
                            </tr>
                            <tr>
                              <td style={{ color: 'var(--text-secondary)' }}>Connection Status</td>
                              <td>
                                <span className="badge-status success">Active</span>
                              </td>
                            </tr>
                            <tr>
                              <td style={{ color: 'var(--text-secondary)' }}>Token Expiration</td>
                              <td>Midnight</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Session Performance</h3>
                        <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TOTAL PORTFOLIO PNL</span>
                          <h4 className={totalPositionsPnl + totalHoldingsPnl >= 0 ? 'text-green' : 'text-red'} style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
                            ₹{(totalPositionsPnl + totalHoldingsPnl).toFixed(2)}
                          </h4>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                          <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>POSITIONS PNL</span>
                            <div className={totalPositionsPnl >= 0 ? 'text-green' : 'text-red'} style={{ fontWeight: 700 }}>
                              ₹{totalPositionsPnl.toFixed(2)}
                            </div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>HOLDINGS PNL</span>
                            <div className={totalHoldingsPnl >= 0 ? 'text-green' : 'text-red'} style={{ fontWeight: 700 }}>
                              ₹{totalHoldingsPnl.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* POSITIONS TAB */}
                  {activeTab === 'positions' && (
                    <div className="table-responsive">
                      {positions.length === 0 ? (
                        <div className="empty-state">
                          <TrendingUp size={36} />
                          <p>No active positions found for today.</p>
                        </div>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Symbol</th>
                              <th>Exchange</th>
                              <th>Product</th>
                              <th>Qty</th>
                              <th>Avg Price</th>
                              <th>LTP</th>
                              <th>P&L (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {positions.map((pos, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 700 }}>{pos.symbol}</td>
                                <td><span className="broker-badge" style={{ padding: '0.1rem 0.3rem', fontSize: '0.6rem' }}>{pos.exchange}</span></td>
                                <td>{pos.productType}</td>
                                <td className={pos.quantity > 0 ? 'text-green' : pos.quantity < 0 ? 'text-red' : ''}>
                                  {pos.quantity}
                                </td>
                                <td>₹{pos.buyPrice || pos.sellPrice}</td>
                                <td>₹{pos.ltp}</td>
                                <td className={pos.pnl >= 0 ? 'text-green' : 'text-red'} style={{ fontWeight: 700 }}>
                                  ₹{pos.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* HOLDINGS TAB */}
                  {activeTab === 'holdings' && (
                    <div className="table-responsive">
                      {holdings.length === 0 ? (
                        <div className="empty-state">
                          <Briefcase size={36} />
                          <p>No holdings found in demat account.</p>
                        </div>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Symbol</th>
                              <th>Exchange</th>
                              <th>Qty</th>
                              <th>Avg Price</th>
                              <th>Current Price</th>
                              <th>Value (₹)</th>
                              <th>P&L (₹)</th>
                              <th>Change (%)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {holdings.map((hold, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 700 }}>{hold.symbol}</td>
                                <td><span className="broker-badge" style={{ padding: '0.1rem 0.3rem', fontSize: '0.6rem' }}>{hold.exchange}</span></td>
                                <td>{hold.quantity}</td>
                                <td>₹{hold.averagePrice.toFixed(2)}</td>
                                <td>₹{hold.currentPrice.toFixed(2)}</td>
                                <td>₹{hold.marketValue.toLocaleString('en-IN')}</td>
                                <td className={hold.pnl >= 0 ? 'text-green' : 'text-red'} style={{ fontWeight: 700 }}>
                                  ₹{hold.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className={hold.pnlPercentage >= 0 ? 'text-green' : 'text-red'}>
                                  {hold.pnlPercentage >= 0 ? '+' : ''}{hold.pnlPercentage}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* ORDERS TAB */}
                  {activeTab === 'orders' && (
                    <div className="table-responsive">
                      {orders.length === 0 ? (
                        <div className="empty-state">
                          <List size={36} />
                          <p>No orders placed today.</p>
                        </div>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Time</th>
                              <th>Symbol</th>
                              <th>Type</th>
                              <th>Qty</th>
                              <th>Price</th>
                              <th>Product</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((ord, idx) => (
                              <tr key={idx}>
                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{ord.time}</td>
                                <td style={{ fontWeight: 700 }}>{ord.symbol}</td>
                                <td className={ord.transactionType === 'BUY' ? 'text-green' : 'text-red'}>
                                  {ord.transactionType}
                                </td>
                                <td>{ord.quantity}</td>
                                <td>{ord.price > 0 ? `₹${ord.price}` : 'MARKET'}</td>
                                <td>{ord.productType}</td>
                                <td>
                                  <span className={`badge-status ${
                                    ord.status === 'TRADED' || ord.status === 'SUCCESS' ? 'success' : 
                                    ord.status === 'CANCELLED' || ord.status === 'REJECTED' ? 'danger' : 'pending'
                                  }`}>
                                    {ord.status}
                                  </span>
                                </td>
                                <td>
                                  {(ord.status === 'PENDING' || ord.status === 'SUBMITTED') && (
                                    <button 
                                      className="action-btn logout-btn"
                                      onClick={() => handleCancelOrder(ord.orderId)}
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* TRADES TAB */}
                  {activeTab === 'trades' && (
                    <div className="table-responsive">
                      {trades.length === 0 ? (
                        <div className="empty-state">
                          <TrendingUp size={36} />
                          <p>No executions/trades executed today.</p>
                        </div>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Time</th>
                              <th>Trade ID</th>
                              <th>Symbol</th>
                              <th>Type</th>
                              <th>Qty</th>
                              <th>Price</th>
                              <th>Value (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trades.map((trd, idx) => (
                              <tr key={idx}>
                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{trd.time}</td>
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{trd.tradeId}</td>
                                <td style={{ fontWeight: 700 }}>{trd.symbol}</td>
                                <td className={trd.transactionType === 'BUY' ? 'text-green' : 'text-red'}>
                                  {trd.transactionType}
                                </td>
                                <td>{trd.quantity}</td>
                                <td>₹{trd.price.toFixed(2)}</td>
                                <td style={{ fontWeight: 700 }}>₹{(trd.quantity * trd.price).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* MODAL - Add Account Form */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Register Broker Account</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleAddAccount}>
              <div className="form-group">
                <label>Account Label / Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. My Dhan Account" 
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Broker Provider</label>
                <select 
                  className="form-control" 
                  value={newAccBroker}
                  onChange={(e) => setNewAccBroker(e.target.value as any)}
                >
                  <option value="DHAN">Dhan</option>
                  <option value="ANGELONE">AngelOne (Planned)</option>
                  <option value="FYERS">Fyers (Planned)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Client ID / Client Code</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Broker login ID / Code" 
                  value={newAccClientId}
                  onChange={(e) => setNewAccClientId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Numeric PIN / Password</label>
                <input 
                  type="password" 
                  className="form-control" 
                  placeholder="Used for login automation" 
                  value={newAccPassword}
                  onChange={(e) => setNewAccPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>2FA Secret Key (TOTP)</label>
                <input 
                  type="password" 
                  className="form-control" 
                  placeholder="Base32 key (for dynamic OTP entry)" 
                  value={newAccTotp}
                  onChange={(e) => setNewAccTotp(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-wide" style={{ width: 'auto', padding: '0.6rem 1.5rem' }}>
                  Register Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
