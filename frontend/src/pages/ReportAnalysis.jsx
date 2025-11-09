import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { MenuAPI, InventoryAPI, OrderAPI, SalesAPI, WasteAPI } from '../utils/api.js';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const ReportAnalysis = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [availableIngredients, setAvailableIngredients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('reports'); // 'reports', 'order-shift'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderData, setOrderData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    orderType: 'dine-in',
    items: [],
    notes: ''
  });

  // Sales analytics state
  const [salesAnalytics, setSalesAnalytics] = useState(null);
  const [salesTrends, setSalesTrends] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [salesByCategory, setSalesByCategory] = useState(null);
  const [profitMarginAnalysis, setProfitMarginAnalysis] = useState(null);
  const [reportPeriod, setReportPeriod] = useState('30d');
  const [reportLoading, setReportLoading] = useState(false);

  // Waste analytics state
  const [wasteStats, setWasteStats] = useState(null);
  const [wasteLogs, setWasteLogs] = useState([]);
  const [wasteLoading, setWasteLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'order-shift') {
      fetchData();
    } else if (activeTab === 'reports') {
      fetchSalesData();
      fetchWasteData();
    }
  }, [activeTab, reportPeriod]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [menuResponse, ingredientsResponse] = await Promise.all([
        MenuAPI.getAllMenuItems(),
        InventoryAPI.getAllItems({ limit: 1000 }) // Get all inventory items
      ]);
      
      setMenuItems(menuResponse.data.docs || menuResponse.data || []);
      
      // Filter inventory items that have stock > 0, or show all if none have stock
      const inventoryItems = ingredientsResponse.data.docs || ingredientsResponse.data || [];
      const availableItems = inventoryItems.filter(item => item.currentStock > 0);
      
      // If no items have stock, show all items so users can still create recipes
      const finalItems = availableItems.length > 0 ? availableItems : inventoryItems;
      setAvailableIngredients(finalItems);
      
      console.log('Total inventory items:', inventoryItems.length);
      console.log('Available ingredients (stock > 0):', availableItems.length);
      console.log('Final ingredients to show:', finalItems.length);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesData = async () => {
    setReportLoading(true);
    try {
      const params = { period: reportPeriod };
      
      const [
        analyticsResponse,
        trendsResponse,
        topProductsResponse,
        categoryResponse,
        profitResponse
      ] = await Promise.all([
        SalesAPI.getSalesAnalytics(params),
        SalesAPI.getSalesTrends(params),
        SalesAPI.getTopProducts({ ...params, limit: 10 }),
        SalesAPI.getSalesByCategory(params),
        SalesAPI.getProfitMarginAnalysis(params)
      ]);

      setSalesAnalytics(analyticsResponse.data);
      setSalesTrends(trendsResponse.data.trends || []);
      setTopProducts(topProductsResponse.data.topProducts || []);
      setSalesByCategory(categoryResponse.data);
      setProfitMarginAnalysis(profitResponse.data.analysis);
    } catch (error) {
      console.error('Error fetching sales data:', error);
      toast.error('Failed to fetch sales data: ' + error.message);
    } finally {
      setReportLoading(false);
    }
  };

  const fetchWasteData = async () => {
    setWasteLoading(true);
    try {
      const params = { period: reportPeriod };
      
      // Fetch both endpoints separately to handle errors gracefully
      const [statsResponse, logsResponse] = await Promise.allSettled([
        WasteAPI.getWasteStats(params),
        WasteAPI.getAllWasteLogs({ limit: 50, page: 1 })
      ]);

      // Handle stats response
      if (statsResponse.status === 'fulfilled') {
        setWasteStats(statsResponse.value.data);
      } else {
        console.error('Error fetching waste stats:', statsResponse.reason);
        // Set default empty stats if fetch fails
        setWasteStats({
          totalWasteLogs: 0,
          totalWasteQuantity: 0,
          totalFinancialLoss: 0,
          wasteByCategory: [],
          wasteByIngredient: [],
          wasteTrends: []
        });
      }

      // Handle logs response
      if (logsResponse.status === 'fulfilled') {
        setWasteLogs(logsResponse.value.data?.docs || logsResponse.value.data || []);
      } else {
        console.error('Error fetching waste logs:', logsResponse.reason);
        // Set empty array if fetch fails
        setWasteLogs([]);
      }

      // Show warning if one of the calls failed
      if (statsResponse.status === 'rejected' || logsResponse.status === 'rejected') {
        const failedCalls = [];
        if (statsResponse.status === 'rejected') failedCalls.push('waste statistics');
        if (logsResponse.status === 'rejected') failedCalls.push('waste logs');
        toast.warning(`Failed to fetch ${failedCalls.join(' and ')}. Showing available data.`);
      }
    } catch (error) {
      console.error('Error fetching waste data:', error);
      // Set default values on complete failure
      setWasteStats({
        totalWasteLogs: 0,
        totalWasteQuantity: 0,
        totalFinancialLoss: 0,
        wasteByCategory: [],
        wasteByIngredient: [],
        wasteTrends: []
      });
      setWasteLogs([]);
      toast.error('Failed to fetch waste data: ' + error.message);
    } finally {
      setWasteLoading(false);
    }
  };

  // Check if a menu item can be prepared based on available ingredients (no expired ingredients)
  const canPrepareItem = (menuItem) => {
    // Use the stock status from the backend if available
    if (menuItem.stockInfo) {
      return menuItem.stockInfo.isAvailable;
    }
    
    // Fallback to local calculation if stockInfo is not available
    if (!menuItem.ingredients || menuItem.ingredients.length === 0) return true;
    
    const now = new Date();
    return menuItem.ingredients.every(ingredient => {
      const ingId = typeof ingredient.ingredient === 'string' 
        ? ingredient.ingredient 
        : ingredient.ingredient?._id;
      const availableIngredient = availableIngredients.find(ing => ing._id === ingId);
      if (!availableIngredient) return false;
      
      // Check if ingredient is expired
      if (availableIngredient.expiryDate && new Date(availableIngredient.expiryDate) < now) {
        return false;
      }
      if (availableIngredient.status === 'expired') {
        return false;
      }
      
      return availableIngredient.currentStock >= ingredient.quantity;
    });
  };

  // Add item to order
  const addItemToOrder = (menuItem) => {
    if (!canPrepareItem(menuItem)) {
      toast.error('Cannot add item: insufficient ingredients available');
      return;
    }

    const existingItem = orderData.items.find(item => item.menuItem._id === menuItem._id);
    if (existingItem) {
      setOrderData(prev => ({
        ...prev,
        items: prev.items.map(item => 
          item.menuItem._id === menuItem._id 
            ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
            : item
        )
      }));
    } else {
      setOrderData(prev => ({
        ...prev,
        items: [...prev.items, {
          menuItem: menuItem,
          quantity: 1,
          unitPrice: menuItem.suggestedPrice,
          totalPrice: menuItem.suggestedPrice
        }]
      }));
    }
  };

  // Remove item from order
  const removeItemFromOrder = (menuItemId) => {
    setOrderData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.menuItem._id !== menuItemId)
    }));
  };

  // Update item quantity in order
  const updateOrderItemQuantity = (menuItemId, quantity) => {
    if (quantity <= 0) {
      removeItemFromOrder(menuItemId);
      return;
    }

    setOrderData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.menuItem._id === menuItemId 
          ? { ...item, quantity: quantity, totalPrice: quantity * item.unitPrice }
          : item
      )
    }));
  };

  // Calculate order total
  const calculateOrderTotal = () => {
    return orderData.items.reduce((total, item) => total + item.totalPrice, 0);
  };

  // Handle order input changes
  const handleOrderInputChange = (e) => {
    const { name, value } = e.target;
    setOrderData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Create order
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!orderData.customerName || orderData.items.length === 0) {
      toast.error('Please provide customer name and add at least one item');
      return;
    }

    try {
      setLoading(true);
      const orderPayload = {
        ...orderData,
        subtotal: calculateOrderTotal(),
        totalAmount: calculateOrderTotal(),
        items: orderData.items.map(item => ({
          menuItem: item.menuItem._id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice
        }))
      };

      // Create the order using the API
      await OrderAPI.createOrder(orderPayload);

      toast.success('Order created successfully!');
      setOrderData({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        orderType: 'dine-in',
        items: [],
        notes: ''
      });
      setOrderSearchTerm('');
      setShowOrderModal(false);
      fetchData(); // Refresh data to show updated ingredient levels
    } catch (error) {
      toast.error('Failed to create order: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset order modal
  const handleCancelOrder = () => {
    setOrderData({
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      orderType: 'dine-in',
      items: [],
      notes: ''
    });
    setOrderSearchTerm('');
    setShowOrderModal(false);
  };

  const filteredMenuItems = menuItems.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (selectedCategory === '' || item.category === selectedCategory)
  );

  if (loading && menuItems.length === 0 && activeTab === 'order-shift') {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Report and Analysis</h2>
        {activeTab === 'order-shift' && (
          <div className="flex space-x-3">
            <button
              onClick={() => setShowOrderModal(true)}
              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
            >
              Take Order
            </button>
            <button
              onClick={async () => {
                try {
                  setLoading(true);
                  await MenuAPI.updateAllMenuItemsStockStatus();
                  await fetchData(); // Refresh the data
                  toast.success('Stock status updated successfully!');
                } catch (error) {
                  toast.error('Failed to update stock status: ' + error.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 transition-colors"
            >
              Refresh Stock Status
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'reports' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Reports & Analytics
        </button>
        <button
          onClick={() => setActiveTab('order-shift')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'order-shift' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Order Shift ({menuItems.length})
        </button>
      </div>

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Period Selector */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Sales Analytics</h3>
              <select
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>
            
            {reportLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : salesAnalytics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-600">Total Revenue</h4>
                  <p className="text-2xl font-bold text-blue-800">${salesAnalytics.overallStats?.totalRevenue?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-green-600">Total Profit</h4>
                  <p className="text-2xl font-bold text-green-800">${salesAnalytics.overallStats?.totalProfit?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-purple-600">Profit Margin</h4>
                  <p className="text-2xl font-bold text-purple-800">{salesAnalytics.overallStats?.overallProfitMargin || '0'}%</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-orange-600">Avg Order Value</h4>
                  <p className="text-2xl font-bold text-orange-800">${salesAnalytics.overallStats?.averageOrderValue?.toFixed(2) || '0.00'}</p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Sales Trends Chart */}
          {salesTrends.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Sales Trends</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={salesTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="_id" 
                    tickFormatter={(value) => {
                      if (value.day) return `${value.month}/${value.day}`;
                      if (value.week) return `Week ${value.week}`;
                      return value.hour ? `${value.hour}:00` : 'Date';
                    }}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'totalRevenue' ? `$${value.toFixed(2)}` : value,
                      name === 'totalRevenue' ? 'Revenue' : 
                      name === 'totalCost' ? 'Cost' : 
                      name === 'profit' ? 'Profit' : name
                    ]}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="totalRevenue" stackId="1" stroke="#8884d8" fill="#8884d8" name="Revenue" />
                  <Area type="monotone" dataKey="totalCost" stackId="2" stroke="#82ca9d" fill="#82ca9d" name="Cost" />
                  <Area type="monotone" dataKey="profit" stackId="3" stroke="#ffc658" fill="#ffc658" name="Profit" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Products Chart */}
          {topProducts.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Top Performing Products</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProducts.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="menuItem.name" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'totalSales' ? `$${value.toFixed(2)}` : value,
                      name === 'totalSales' ? 'Revenue' : 
                      name === 'totalQuantitySold' ? 'Quantity Sold' : name
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="totalSales" fill="#8884d8" name="Revenue" />
                  <Bar dataKey="totalQuantitySold" fill="#82ca9d" name="Quantity Sold" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sales by Day of Week */}
          {salesByCategory?.salesByDay && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Sales by Day of Week</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={salesByCategory.salesByDay}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="totalRevenue"
                  >
                    {salesByCategory.salesByDay.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`hsl(${index * 45}, 70%, 50%)`} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${value.toFixed(2)}`, 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Profit Margin Analysis */}
          {profitMarginAnalysis && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Profit Margin Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Overall Performance</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Overall Margin:</span>
                      <span className="font-bold">{profitMarginAnalysis.overallMargin?.toFixed(2) || '0'}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Margin:</span>
                      <span className="font-bold">{profitMarginAnalysis.averageMargin?.toFixed(2) || '0'}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>High Margin Products:</span>
                      <span className="font-bold text-green-600">{profitMarginAnalysis.highMarginProducts || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Low Margin Products:</span>
                      <span className="font-bold text-red-600">{profitMarginAnalysis.lowMarginProducts || 0}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Product Margins</h4>
                  <div className="max-h-48 overflow-y-auto">
                    {profitMarginAnalysis.products?.slice(0, 5).map((product, index) => (
                      <div key={index} className="flex justify-between items-center py-1">
                        <span className="text-sm truncate">{product.menuItem?.name}</span>
                        <span className={`text-sm font-medium ${
                          product.profitMargin > 50 ? 'text-green-600' : 
                          product.profitMargin > 20 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {product.profitMargin?.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sales by Order Type */}
          {salesByCategory?.salesByOrderType && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Sales by Order Type</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {salesByCategory.salesByOrderType.map((type, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium capitalize">{type._id}</h4>
                    <p className="text-2xl font-bold text-blue-600">${type.totalRevenue?.toFixed(2) || '0.00'}</p>
                    <p className="text-sm text-gray-600">{type.totalOrders} orders</p>
                    <p className="text-sm text-gray-600">Avg: ${type.averageOrderValue?.toFixed(2) || '0.00'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Waste Analysis Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Waste Analysis</h3>
              <button
                onClick={async () => {
                  try {
                    setWasteLoading(true);
                    await WasteAPI.processExpiredItems();
                    await fetchWasteData();
                    toast.success('Expired items processed and logged as waste successfully!');
                  } catch (error) {
                    toast.error('Failed to process expired items: ' + error.message);
                  } finally {
                    setWasteLoading(false);
                  }
                }}
                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm"
              >
                Process Expired Items
              </button>
            </div>

            {wasteLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
              </div>
            ) : wasteStats ? (
              <>
                {/* Waste Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-red-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-red-600">Total Waste Logs</h4>
                    <p className="text-2xl font-bold text-red-800">{wasteStats.totalWasteLogs || 0}</p>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-orange-600">Total Waste Quantity</h4>
                    <p className="text-2xl font-bold text-orange-800">{wasteStats.totalWasteQuantity?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-yellow-600">Financial Loss</h4>
                    <p className="text-2xl font-bold text-yellow-800">${wasteStats.totalFinancialLoss?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-purple-600">Expired Items</h4>
                    <p className="text-2xl font-bold text-purple-800">
                      {wasteStats.wasteByCategory?.find(c => c._id === 'expired')?.count || 0}
                    </p>
                  </div>
                </div>

                {/* Waste by Category Chart */}
                {wasteStats.wasteByCategory && wasteStats.wasteByCategory.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium mb-3">Waste by Category</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={wasteStats.wasteByCategory}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="totalQuantity"
                        >
                          {wasteStats.wasteByCategory.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`hsl(${index * 60}, 70%, 50%)`} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [value.toFixed(2), 'Quantity']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Waste Trends Chart */}
                {wasteStats.wasteTrends && wasteStats.wasteTrends.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium mb-3">Waste Trends (Last 30 Days)</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={wasteStats.wasteTrends.map(trend => ({
                        date: `${trend._id.month}/${trend._id.day}`,
                        quantity: trend.totalQuantity,
                        count: trend.count
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="quantity" stroke="#ff6b6b" fill="#ff6b6b" name="Waste Quantity" />
                        <Area type="monotone" dataKey="count" stroke="#ffa500" fill="#ffa500" name="Waste Logs" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top Wasted Ingredients */}
                {wasteStats.wasteByIngredient && wasteStats.wasteByIngredient.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium mb-3">Top Wasted Ingredients</h4>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-4 py-2 text-left">Ingredient</th>
                            <th className="px-4 py-2 text-right">Quantity</th>
                            <th className="px-4 py-2 text-right">Logs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wasteStats.wasteByIngredient.map((item, index) => (
                            <tr key={index} className="border-b">
                              <td className="px-4 py-2">{item.ingredient?.name || 'Unknown'}</td>
                              <td className="px-4 py-2 text-right">{item.totalQuantity?.toFixed(2)} {item.ingredient?.unit || ''}</td>
                              <td className="px-4 py-2 text-right">{item.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Recent Waste Logs */}
                {wasteLogs.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Recent Waste Logs</h4>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-4 py-2 text-left">Ingredient</th>
                            <th className="px-4 py-2 text-left">Category</th>
                            <th className="px-4 py-2 text-right">Quantity</th>
                            <th className="px-4 py-2 text-left">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wasteLogs.slice(0, 10).map((log) => (
                            <tr key={log._id} className="border-b">
                              <td className="px-4 py-2">{log.ingredient?.name || 'Unknown'}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  log.category === 'expired' ? 'bg-red-100 text-red-800' :
                                  log.category === 'spoiled' ? 'bg-orange-100 text-orange-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {log.category}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right">{log.quantity} {log.unit}</td>
                              <td className="px-4 py-2 text-left">
                                {new Date(log.loggedAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No waste data available. Process expired items to generate waste logs.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Shift Tab */}
      {activeTab === 'order-shift' && (
        <div>
          {/* Search and Filter */}
          <div className="mb-6 flex space-x-4">
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              <option value="vegetables">Vegetables</option>
              <option value="fruits">Fruits</option>
              <option value="meat">Meat</option>
              <option value="dairy">Dairy</option>
              <option value="grains">Grains</option>
              <option value="spices">Spices</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Menu Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMenuItems.filter(item => canPrepareItem(item)).map((item) => (
              <div key={item._id} className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-2">{item.name}</h3>
                {item.description && (
                  <p className="text-gray-600 mb-3">{item.description}</p>
                )}
                <div className="space-y-2 mb-4">
                  <p><span className="font-medium">Base Cost:</span> ${item.baseCost}</p>
                  <p><span className="font-medium">Suggested Price:</span> ${item.suggestedPrice}</p>
                  <p><span className="font-medium">Profit Margin:</span> {item.profitMargin?.toFixed(1)}%</p>
                  {/* Stock Status */}
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Status:</span>
                    {item.stockInfo ? (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.stockInfo.stockStatus === 'available' 
                          ? 'bg-green-100 text-green-800' 
                          : item.stockInfo.stockStatus === 'low_stock'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.stockInfo.stockStatus === 'available' ? 'Available' : 
                         item.stockInfo.stockStatus === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
                      </span>
                    ) : (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        canPrepareItem(item) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {canPrepareItem(item) ? 'Available' : 'Out of Stock'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mb-4">
                  <h4 className="font-medium mb-2">Ingredients:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {item.ingredients?.map((ing, index) => {
                      const availableIngredient = availableIngredients.find(ai => ai._id === ing.ingredient._id);
                      const isAvailable = availableIngredient && availableIngredient.currentStock >= ing.quantity;
                      return (
                        <li key={index} className={`flex items-center justify-between ${
                          !isAvailable ? 'text-red-600' : ''
                        }`}>
                          <span>
                            {ing.ingredient?.name}: {ing.quantity} {ing.unit}
                          </span>
                          {availableIngredient && (
                            <span className={`text-xs px-2 py-1 rounded ${
                              isAvailable 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {availableIngredient.currentStock} {ing.unit} available
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => addItemToOrder(item)}
                    disabled={!canPrepareItem(item)}
                    className={`px-3 py-1 rounded text-sm ${
                      canPrepareItem(item) 
                        ? 'bg-green-500 text-white hover:bg-green-600' 
                        : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {canPrepareItem(item) ? 'Add to Order' : 'Out of Stock'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Take New Order</h3>
              <button
                onClick={handleCancelOrder}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-6">
              {/* Customer Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-lg font-medium mb-3">Customer Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Customer Name *</label>
                    <input
                      type="text"
                      name="customerName"
                      value={orderData.customerName}
                      onChange={handleOrderInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone Number</label>
                    <input
                      type="tel"
                      name="customerPhone"
                      value={orderData.customerPhone}
                      onChange={handleOrderInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      name="customerEmail"
                      value={orderData.customerEmail}
                      onChange={handleOrderInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Order Type</label>
                    <select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="dine-in">Dine In</option>
                      <option value="takeaway">Takeaway</option>
                      <option value="delivery">Delivery</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Menu Items Browser */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="text-lg font-medium mb-3">Available Menu Items</h4>
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search menu items..."
                    value={orderSearchTerm}
                    onChange={(e) => setOrderSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white">
                  {menuItems
                    .filter(item => 
                      item.name.toLowerCase().includes(orderSearchTerm.toLowerCase()) &&
                      canPrepareItem(item) // Only show items that can be prepared (no expired ingredients)
                    )
                    .map((item) => (
                      <div key={item._id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                        <div className="flex-1">
                          <h5 className="font-medium text-sm">{item.name}</h5>
                          <p className="text-xs text-gray-600">${item.suggestedPrice}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              canPrepareItem(item) 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {canPrepareItem(item) ? 'Available' : 'Out of Stock'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addItemToOrder(item)}
                          disabled={!canPrepareItem(item)}
                          className={`px-3 py-1 rounded text-xs ${
                            canPrepareItem(item) 
                              ? 'bg-blue-500 text-white hover:bg-blue-600' 
                              : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          }`}
                        >
                          Add
                        </button>
                      </div>
                    ))}
                </div>
              </div>

              {/* Order Items */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="text-lg font-medium mb-3">Order Items</h4>
                {orderData.items.length === 0 ? (
                  <p className="text-gray-500 text-center py-4 bg-white rounded-lg border-2 border-dashed border-gray-300">
                    No items added to order yet. Select items from the menu above to add them to your order.
                  </p>
                ) : (
                  <div className="space-y-2 bg-white p-3 rounded-lg border">
                    {orderData.items.map((item) => (
                      <div key={item.menuItem._id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <div className="flex-1">
                          <h5 className="font-medium">{item.menuItem.name}</h5>
                          <p className="text-sm text-gray-600">${item.unitPrice} each</p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <button
                            type="button"
                            onClick={() => updateOrderItemQuantity(item.menuItem._id, item.quantity - 1)}
                            className="bg-red-500 text-white w-8 h-8 rounded-full hover:bg-red-600"
                          >
                            -
                          </button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateOrderItemQuantity(item.menuItem._id, item.quantity + 1)}
                            className="bg-green-500 text-white w-8 h-8 rounded-full hover:bg-green-600"
                          >
                            +
                          </button>
                          <span className="font-medium w-20 text-right">${item.totalPrice.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => removeItemFromOrder(item.menuItem._id)}
                            className="text-red-500 hover:text-red-700 ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Order Total */}
              {orderData.items.length > 0 && (
                <div className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
                  <div className="flex justify-between items-center text-xl font-bold text-yellow-800">
                    <span>Order Total:</span>
                    <span>${calculateOrderTotal().toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium mb-1">Order Notes</label>
                <textarea
                  name="notes"
                  value={orderData.notes}
                  onChange={handleOrderInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Special instructions or notes for this order..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  type="submit"
                  disabled={loading || orderData.items.length === 0}
                  className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating Order...' : 'Create Order'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelOrder}
                  className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportAnalysis;


