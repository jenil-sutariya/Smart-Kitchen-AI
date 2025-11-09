const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000/api/v1";

async function refreshAccessToken() {
  const res = await fetch(`${API_BASE}/user/refresh-token`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Failed to refresh session");
  }
  const newToken = data?.data?.accessToken;
  if (newToken) {
    try {
      localStorage.setItem("accessToken", newToken);
    } catch {}
  }
  return newToken;
}

async function http(path, { method = "GET", body, headers = {} } = {}) {
  let requestHeaders = { "Content-Type": "application/json", ...headers };
  
  // Get JWT token from localStorage for authentication
  try {
    const token = localStorage.getItem("accessToken");
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn("Could not get access token:", error);
  }

  let res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: requestHeaders,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  // If unauthorized, try refreshing the token once and retry
  if (res.status === 401) {
    try {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryHeaders = { ...requestHeaders, Authorization: `Bearer ${newToken}` };
        res = await fetch(`${API_BASE}${path}`, {
          method,
          headers: retryHeaders,
          credentials: "include",
          body: body ? JSON.stringify(body) : undefined,
        });
      }
    } catch {}
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.error || "Request failed";
    throw new Error(message);
  }
  return data;
}

export const AuthAPI = {
  login(email, password) {
    return http("/user/login", { method: "POST", body: { email, password } });
  },
  register({ fullname, username, email, password }) {
    return http("/user/register", { method: "POST", body: { fullname, username, email, password } });
  },
  logout() {
    return http("/user/logout", { method: "POST" });
  },
};

export const InventoryAPI = {
  // Get all inventory items
  getAllItems(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/inventory${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get single inventory item
  getItemById(id) {
    return http(`/inventory/${id}`);
  },

  // Add new inventory item
  addItem(itemData) {
    const formData = new FormData();
    
    // Add all fields to FormData
    Object.keys(itemData).forEach(key => {
      if (itemData[key] !== null && itemData[key] !== undefined) {
        formData.append(key, itemData[key]);
      }
    });

    // Get JWT token from localStorage
    let token = null;
    try {
      token = localStorage.getItem("accessToken");
    } catch (error) {
      console.warn("Could not get access token:", error);
    }

    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const doFetch = async (authHeaders) => fetch(`${API_BASE}/inventory`, {
      method: "POST",
      headers: authHeaders,
      credentials: "include",
      body: formData,
    });

    return doFetch(headers).then(async (res) => {
      if (res.status === 401) {
        try {
          const newToken = await refreshAccessToken();
          if (newToken) {
            const retryHeaders = { ...(headers || {}), Authorization: `Bearer ${newToken}` };
            res = await doFetch(retryHeaders);
          }
        } catch {}
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.message || data?.error || "Request failed";
        throw new Error(message);
      }
      return data;
    });
  },

  // Update inventory item
  updateItem(id, itemData) {
    const formData = new FormData();
    
    // Add all fields to FormData
    Object.keys(itemData).forEach(key => {
      if (itemData[key] !== null && itemData[key] !== undefined) {
        formData.append(key, itemData[key]);
      }
    });

    // Get JWT token from localStorage
    let token = null;
    try {
      token = localStorage.getItem("accessToken");
    } catch (error) {
      console.warn("Could not get access token:", error);
    }

    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const doFetch = async (authHeaders) => fetch(`${API_BASE}/inventory/${id}`, {
      method: "PUT",
      headers: authHeaders,
      credentials: "include",
      body: formData,
    });

    return doFetch(headers).then(async (res) => {
      if (res.status === 401) {
        try {
          const newToken = await refreshAccessToken();
          if (newToken) {
            const retryHeaders = { ...(headers || {}), Authorization: `Bearer ${newToken}` };
            res = await doFetch(retryHeaders);
          }
        } catch {}
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.message || data?.error || "Request failed";
        throw new Error(message);
      }
      return data;
    });
  },

  // Delete inventory item
  deleteItem(id) {
    return http(`/inventory/${id}`, { method: "DELETE" });
  },

  // Get low stock items
  getLowStockItems() {
    return http("/inventory/low-stock");
  },

  // Get expired items
  getExpiredItems() {
    return http("/inventory/expired");
  },

  // Get inventory statistics
  getStats() {
    return http("/inventory/stats");
  },

  // Get items by category
  getItemsByCategory(category) {
    return http(`/inventory/category/${category}`);
  },

  // Export inventory to CSV
  exportToCSV(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const url = `${API_BASE}/inventory/export${queryParams ? `?${queryParams}` : ''}`;
    
    // Get JWT token from localStorage
    let token = null;
    try {
      token = localStorage.getItem("accessToken");
    } catch (error) {
      console.warn("Could not get access token:", error);
    }

    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const doFetch = async (authHeaders) => fetch(url, {
      method: "GET",
      headers: authHeaders,
      credentials: "include",
    });

    return doFetch(headers).then(async (res) => {
      if (res.status === 401) {
        try {
          const newToken = await refreshAccessToken();
          if (newToken) {
            const retryHeaders = { ...(headers || {}), Authorization: `Bearer ${newToken}` };
            res = await doFetch(retryHeaders);
          }
        } catch {}
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.message || data?.error || "Export failed";
        throw new Error(message);
      }
      return res.blob();
    });
  },


};

export const DashboardAPI = {
  // Get dashboard statistics
  getStats() {
    return http("/dashboard/stats");
  },

  // Get dashboard charts data
  getCharts() {
    return http("/dashboard/charts");
  }
};

export const MenuAPI = {
  // Get all menu items
  getAllMenuItems(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/menu/items${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get single menu item
  getMenuItemById(id) {
    return http(`/menu/items/${id}`);
  },

  // Create new menu item
  createMenuItem(itemData) {
    return http("/menu/items", { method: "POST", body: itemData });
  },

  // Update menu item
  updateMenuItem(id, itemData) {
    return http(`/menu/items/${id}`, { method: "PUT", body: itemData });
  },

  // Delete menu item
  deleteMenuItem(id) {
    return http(`/menu/items/${id}`, { method: "DELETE" });
  },

  // Get available ingredients
  getAvailableIngredients(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/menu/ingredients${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get all recipe recommendations
  getAllRecipes(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/menu/recipes${queryParams ? `?${queryParams}` : ''}`);
  },

  // Create new recipe recommendation
  createRecipe(recipeData) {
    return http("/menu/recipes", { method: "POST", body: recipeData });
  },

  // Check stock status for a specific menu item
  checkMenuItemStockStatus(id, quantity = 1) {
    return http(`/menu/items/${id}/stock-status?quantity=${quantity}`);
  },

  // Update stock status for all menu items
  updateAllMenuItemsStockStatus() {
    return http("/menu/items/update-stock-status", { method: "POST" });
  }
};

export const OrderAPI = {
  // Get all orders
  getAllOrders(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/orders${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get single order
  getOrderById(id) {
    return http(`/orders/${id}`);
  },

  // Create new order
  createOrder(orderData) {
    return http("/orders", { method: "POST", body: orderData });
  },

  // Update order (edit order)
  updateOrder(id, orderData) {
    return http(`/orders/${id}`, { method: "PUT", body: orderData });
  },

  // Update order status
  updateOrderStatus(id, statusData) {
    return http(`/orders/${id}/status`, { method: "PUT", body: statusData });
  },

  // Delete order
  deleteOrder(id) {
    return http(`/orders/${id}`, { method: "DELETE" });
  },

  // Get order statistics
  getOrderStats() {
    return http("/orders/stats");
  },

  // Get invoice data
  getInvoice(id) {
    return http(`/orders/${id}/invoice`);
  }
};

export const SalesAPI = {
  // Get comprehensive sales analytics
  getSalesAnalytics(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/sales/analytics${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get sales trends over time
  getSalesTrends(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/sales/trends${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get top performing products
  getTopProducts(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/sales/top-products${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get sales by category analysis
  getSalesByCategory(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/sales/by-category${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get profit margin analysis
  getProfitMarginAnalysis(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/sales/profit-margin${queryParams ? `?${queryParams}` : ''}`);
  }
};

export const WasteAPI = {
  // Get all waste logs
  getAllWasteLogs(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/waste${queryParams ? `?${queryParams}` : ''}`);
  },

  // Get single waste log
  getWasteLogById(id) {
    return http(`/waste/${id}`);
  },

  // Create waste log
  createWasteLog(wasteData) {
    return http("/waste", { method: "POST", body: wasteData });
  },

  // Get waste statistics
  getWasteStats(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return http(`/waste/stats${queryParams ? `?${queryParams}` : ''}`);
  },

  // Process expired items and log them as waste
  processExpiredItems() {
    return http("/waste/process-expired", { method: "POST" });
  }
};

export const DailyInventoryAPI = {
  // Get today's inventory
  getTodayInventory() {
    return http("/daily-inventory/today");
  },

  // Get inventory for a specific date
  getDateInventory(date) {
    return http(`/daily-inventory/date/${date}`);
  },

  // Get day status
  getDayStatus() {
    return http("/daily-inventory/day-status");
  },

  // Get available items (generalized inventory items)
  getAvailableItems() {
    return http("/daily-inventory/available-items");
  },

  // Add item to today's inventory
  addItemToToday(itemData) {
    return http("/daily-inventory/add-item", { method: "POST", body: itemData });
  },

  // End the day
  endDay() {
    return http("/daily-inventory/end-day", { method: "POST" });
  },

  // Start new day
  startNewDay() {
    return http("/daily-inventory/start-new-day", { method: "POST" });
  }
};
