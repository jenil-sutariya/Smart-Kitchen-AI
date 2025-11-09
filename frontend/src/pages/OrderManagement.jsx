import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { OrderAPI, MenuAPI } from '../utils/api.js';

const OrderManagement = () => {
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'create'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderData, setOrderData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    orderType: 'dine-in',
    items: [],
    notes: ''
  });
  const [editOrderData, setEditOrderData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    orderType: 'dine-in',
    items: [],
    notes: ''
  });
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [editOrderSearchTerm, setEditOrderSearchTerm] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 1,
    totalDocs: 0
  });

  useEffect(() => {
    fetchOrders();
    fetchMenuItems();
  }, [pagination.page, statusFilter, orderTypeFilter, searchTerm]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...(statusFilter && { status: statusFilter }),
        ...(orderTypeFilter && { orderType: orderTypeFilter }),
        ...(searchTerm && { search: searchTerm })
      };

      const response = await OrderAPI.getAllOrders(params);
      setOrders(response.data.docs || []);
      setPagination(prev => ({
        ...prev,
        totalPages: response.data.totalPages || 1,
        totalDocs: response.data.totalDocs || 0
      }));
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenuItems = async () => {
    try {
      const response = await MenuAPI.getAllMenuItems();
      setMenuItems(response.data.docs || response.data || []);
    } catch (error) {
      console.error('Error fetching menu items:', error);
    }
  };

  // Add item to order
  const addItemToOrder = (menuItem) => {
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

  // Helpers for Edit Order modal
  const addItemToEditOrder = (menuItem) => {
    const existingItem = editOrderData.items.find(item => item.menuItem._id === menuItem._id);
    if (existingItem) {
      setEditOrderData(prev => ({
        ...prev,
        items: prev.items.map(item => 
          item.menuItem._id === menuItem._id 
            ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
            : item
        )
      }));
    } else {
      setEditOrderData(prev => ({
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

  const removeItemFromEditOrder = (menuItemId) => {
    setEditOrderData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.menuItem._id !== menuItemId)
    }));
  };

  const updateEditOrderItemQuantity = (menuItemId, quantity) => {
    if (quantity <= 0) {
      removeItemFromEditOrder(menuItemId);
      return;
    }

    setEditOrderData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.menuItem._id === menuItemId 
          ? { ...item, quantity: quantity, totalPrice: quantity * item.unitPrice }
          : item
      )
    }));
  };

  const calculateEditOrderTotal = () => {
    return editOrderData.items.reduce((total, item) => total + item.totalPrice, 0);
  };

  const handleEditOrderInputChange = (e) => {
    const { name, value } = e.target;
    setEditOrderData(prev => ({
      ...prev,
      [name]: value
    }));
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

      await OrderAPI.createOrder(orderPayload);
      toast.success('Order created successfully!');
      
      // Reset form
      setOrderData({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        orderType: 'dine-in',
        items: [],
        notes: ''
      });
      setOrderSearchTerm('');
      setShowCreateForm(false);
      fetchOrders(); // Refresh orders list
    } catch (error) {
      toast.error('Failed to create order: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Update order status
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      setLoading(true);
      await OrderAPI.updateOrderStatus(orderId, { status: newStatus });
      toast.success('Order status updated successfully!');
      fetchOrders(); // Refresh orders list
    } catch (error) {
      toast.error('Failed to update order status: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete order
  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to delete this order?')) {
      return;
    }

    try {
      setLoading(true);
      await OrderAPI.deleteOrder(orderId);
      toast.success('Order deleted successfully!');
      fetchOrders(); // Refresh orders list
    } catch (error) {
      toast.error('Failed to delete order: ' + error.message);
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
    setShowCreateForm(false);
  };

  const openEditOrder = (order) => {
    setEditingOrderId(order._id);
    setEditOrderData({
      customerName: order.customerName || '',
      customerPhone: order.customerPhone || '',
      customerEmail: order.customerEmail || '',
      orderType: order.orderType || 'dine-in',
      items: (order.items || []).map(it => ({
        menuItem: it.menuItem,
        quantity: it.quantity,
        unitPrice: it.unitPrice ?? it.menuItem?.suggestedPrice ?? 0,
        totalPrice: it.totalPrice ?? (it.quantity * (it.unitPrice ?? it.menuItem?.suggestedPrice ?? 0))
      })),
      notes: order.notes || ''
    });
    setEditOrderSearchTerm('');
    setShowEditForm(true);
  };

  const handleUpdateOrder = async (e) => {
    e.preventDefault();
    if (!editingOrderId) return;
    if (!editOrderData.customerName || editOrderData.items.length === 0) {
      toast.error('Please provide customer name and add at least one item');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        ...editOrderData,
        subtotal: calculateEditOrderTotal(),
        totalAmount: calculateEditOrderTotal(),
        items: editOrderData.items.map(item => ({
          menuItem: item.menuItem._id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice
        }))
      };
      await OrderAPI.updateOrder(editingOrderId, payload);
      toast.success('Order updated successfully!');
      setShowEditForm(false);
      setEditingOrderId(null);
      fetchOrders();
    } catch (error) {
      toast.error('Failed to update order: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Check if a menu item can be prepared (no expired ingredients)
  const canPrepareItem = (menuItem) => {
    // Use the stock status from the backend if available
    if (menuItem.stockInfo) {
      return menuItem.stockInfo.isAvailable;
    }
    // Fallback: check if any ingredient is expired
    if (!menuItem.ingredients || menuItem.ingredients.length === 0) return true;
    const now = new Date();
    return menuItem.ingredients.every(ingredient => {
      const ingItem = ingredient.ingredient;
      if (!ingItem) return false;
      // Check if ingredient is expired
      if (ingItem.expiryDate && new Date(ingItem.expiryDate) < now) return false;
      if (ingItem.status === 'expired') return false;
      // Check stock availability
      return ingItem.currentStock >= (ingredient.quantity ?? 0);
    });
  };

  const filteredMenuItems = menuItems.filter(item => 
    item.name.toLowerCase().includes(orderSearchTerm.toLowerCase()) &&
    canPrepareItem(item) // Only show items that can be prepared (no expired ingredients)
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'preparing': return 'bg-orange-100 text-orange-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'delivered': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getOrderTypeColor = (orderType) => {
    switch (orderType) {
      case 'dine-in': return 'bg-green-100 text-green-800';
      case 'takeaway': return 'bg-blue-100 text-blue-800';
      case 'delivery': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Order Management</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Create New Order
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'orders' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Orders ({pagination.totalDocs})
        </button>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex space-x-4">
        <input
          type="text"
          placeholder="Search orders by customer name or order number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={orderTypeFilter}
          onChange={(e) => setOrderTypeFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          <option value="dine-in">Dine-in</option>
          <option value="takeaway">Takeaway</option>
          <option value="delivery">Delivery</option>
        </select>
      </div>

      {/* Orders List */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order._id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Order #{order.orderNumber}</h3>
                  <p className="text-gray-600">Customer: {order.customerName}</p>
                  {order.customerPhone && (
                    <p className="text-gray-600">Phone: {order.customerPhone}</p>
                  )}
                  <p className="text-gray-600">Total: ${order.totalAmount}</p>
                </div>
                <div className="flex space-x-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.status)}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getOrderTypeColor(order.orderType)}`}>
                    {order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <h4 className="font-medium mb-2">Items:</h4>
                <ul className="space-y-1">
                  {order.items?.map((item, index) => (
                    <li key={index} className="flex justify-between text-sm">
                      <span>{item.menuItem?.name || 'Unknown Item'} x {item.quantity}</span>
                      <span>${item.totalPrice}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {order.notes && (
                <div className="mb-4">
                  <h4 className="font-medium mb-1">Notes:</h4>
                  <p className="text-sm text-gray-600">{order.notes}</p>
                </div>
              )}

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  Created: {new Date(order.createdAt).toLocaleString()}
                  {order.createdBy && (
                    <span> by {order.createdBy.fullname || order.createdBy.email}</span>
                  )}
                </div>
                <div className="flex space-x-2">
                  {order.status === 'pending' && (
                    <>
                      <button
                        onClick={() => openEditOrder(order)}
                        className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleUpdateOrderStatus(order._id, 'confirmed')}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                      >
                        Confirm
                      </button>
                    </>
                  )}
                  {order.status === 'confirmed' && (
                    <button
                      onClick={() => handleUpdateOrderStatus(order._id, 'preparing')}
                      className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600"
                    >
                      Start Preparing
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => handleUpdateOrderStatus(order._id, 'ready')}
                      className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                    >
                      Mark Ready
                    </button>
                  )}
                  {order.status === 'ready' && (
                    <button
                      onClick={() => handleUpdateOrderStatus(order._id, 'delivered')}
                      className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                    >
                      Mark Delivered
                    </button>
                  )}
                  {(order.status === 'pending' || order.status === 'confirmed') && (
                    <button
                      onClick={() => handleUpdateOrderStatus(order._id, 'cancelled')}
                      className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteOrder(order._id)}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

          {orders.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No orders found.</p>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center space-x-2 mt-6">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-4 py-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Order Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Create New Order</h3>
              <button
                onClick={handleCancelOrder}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-6">
              {/* Customer Information */}
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
                    <option value="dine-in">Dine-in</option>
                    <option value="takeaway">Takeaway</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>
              </div>

              {/* Menu Items Selection */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Available Menu Items */}
                <div>
                  <h4 className="font-medium mb-3">Available Menu Items</h4>
                  <input
                    type="text"
                    placeholder="Search menu items..."
                    value={orderSearchTerm}
                    onChange={(e) => setOrderSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                  />
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filteredMenuItems.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        <p>No available menu items. Some items may have expired ingredients.</p>
                      </div>
                    ) : (
                      filteredMenuItems.map((item) => (
                        <div key={item._id} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                          <div>
                            <h5 className="font-medium">{item.name}</h5>
                            <p className="text-sm text-gray-600">${item.suggestedPrice}</p>
                            {item.stockInfo && (
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                item.stockInfo.isAvailable 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {item.stockInfo.isAvailable ? 'Available' : 'Unavailable'}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => addItemToOrder(item)}
                            disabled={!canPrepareItem(item)}
                            className={`px-3 py-1 rounded text-sm ${
                              canPrepareItem(item)
                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                            }`}
                          >
                            Add
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Order Items */}
                <div>
                  <h4 className="font-medium mb-3">Order Items</h4>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {orderData.items.map((item, index) => (
                      <div key={index} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                        <div>
                          <h5 className="font-medium">{item.menuItem.name}</h5>
                          <p className="text-sm text-gray-600">${item.unitPrice} each</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => updateOrderItemQuantity(item.menuItem._id, item.quantity - 1)}
                            className="bg-gray-500 text-white px-2 py-1 rounded text-sm hover:bg-gray-600"
                          >
                            -
                          </button>
                          <span className="px-2">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateOrderItemQuantity(item.menuItem._id, item.quantity + 1)}
                            className="bg-gray-500 text-white px-2 py-1 rounded text-sm hover:bg-gray-600"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItemFromOrder(item.menuItem._id)}
                            className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600 ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {orderData.items.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between font-medium">
                        <span>Total:</span>
                        <span>${calculateOrderTotal().toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
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

      {/* Edit Order Modal */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w/full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Edit Order</h3>
              <button
                onClick={() => setShowEditForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateOrder} className="space-y-6">
              {/* Customer Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Customer Name *</label>
                  <input
                    type="text"
                    name="customerName"
                    value={editOrderData.customerName}
                    onChange={handleEditOrderInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone Number</label>
                  <input
                    type="tel"
                    name="customerPhone"
                    value={editOrderData.customerPhone}
                    onChange={handleEditOrderInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    name="customerEmail"
                    value={editOrderData.customerEmail}
                    onChange={handleEditOrderInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Order Type</label>
                  <select
                    name="orderType"
                    value={editOrderData.orderType}
                    onChange={handleEditOrderInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="dine-in">Dine-in</option>
                    <option value="takeaway">Takeaway</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>
              </div>

              {/* Menu Items Selection */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Available Menu Items */}
                <div>
                  <h4 className="font-medium mb-3">Available Menu Items</h4>
                  <input
                    type="text"
                    placeholder="Search menu items..."
                    value={editOrderSearchTerm}
                    onChange={(e) => setEditOrderSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                  />
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {menuItems
                      .filter(item => 
                        item.name.toLowerCase().includes(editOrderSearchTerm.toLowerCase()) &&
                        canPrepareItem(item) // Only show items that can be prepared (no expired ingredients)
                      )
                      .map((item) => (
                        <div key={item._id} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                          <div>
                            <h5 className="font-medium">{item.name}</h5>
                            <p className="text-sm text-gray-600">${item.suggestedPrice}</p>
                            {item.stockInfo && (
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                item.stockInfo.isAvailable 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {item.stockInfo.isAvailable ? 'Available' : 'Unavailable'}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => addItemToEditOrder(item)}
                            disabled={!canPrepareItem(item)}
                            className={`px-3 py-1 rounded text-sm ${
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
                <div>
                  <h4 className="font-medium mb-3">Order Items</h4>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {editOrderData.items.map((item, index) => (
                      <div key={index} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                        <div>
                          <h5 className="font-medium">{item.menuItem.name}</h5>
                          <p className="text-sm text-gray-600">${item.unitPrice} each</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => updateEditOrderItemQuantity(item.menuItem._id, item.quantity - 1)}
                            className="bg-gray-500 text-white px-2 py-1 rounded text-sm hover:bg-gray-600"
                          >
                            -
                          </button>
                          <span className="px-2">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateEditOrderItemQuantity(item.menuItem._id, item.quantity + 1)}
                            className="bg-gray-500 text-white px-2 py-1 rounded text-sm hover:bg-gray-600"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItemFromEditOrder(item.menuItem._id)}
                            className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600 ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {editOrderData.items.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between font-medium">
                        <span>Total:</span>
                        <span>${calculateEditOrderTotal().toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">Order Notes</label>
                <textarea
                  name="notes"
                  value={editOrderData.notes}
                  onChange={handleEditOrderInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Special instructions or notes for this order..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  type="submit"
                  disabled={loading || editOrderData.items.length === 0}
                  className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditForm(false)}
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

export default OrderManagement;