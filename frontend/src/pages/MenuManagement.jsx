import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { MenuAPI, InventoryAPI } from '../utils/api.js';

const MenuManagement = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [availableIngredients, setAvailableIngredients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('menu'); // 'menu', 'create'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    ingredients: [],
    baseCost: '',
    suggestedPrice: '',
    imageUrl: ''
  });

  // ===== Helpers to safely read ingredient refs =====
  const getIngId = (ing) => {
    // ing is an element from menuItem.ingredients
    // ing.ingredient can be a string ID, an object with _id, or null
    if (!ing) return null;
    if (typeof ing.ingredient === 'string') return ing.ingredient;
    return ing?.ingredient?._id ?? null;
  };

  const getIngName = (ing) => {
    // Prefer populated name if present, else look it up from availableIngredients by ID
    if (!ing) return 'Unknown';
    if (typeof ing.ingredient === 'object' && ing.ingredient?.name) return ing.ingredient.name;
    const id = getIngId(ing);
    const match = id ? availableIngredients.find(ai => ai._id === id) : null;
    return match?.name ?? 'Unknown';
  };

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

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addIngredientToForm = (ingredient) => {
    const existingIngredient = formData.ingredients.find(ing => ing.ingredient === ingredient._id);
    if (existingIngredient) {
      toast.error('Ingredient already added');
      return;
    }

    setFormData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, {
        ingredient: ingredient._id,
        quantity: 1,
        unit: ingredient.unit || 'pcs'
      }]
    }));
  };

  const updateIngredientQuantity = (index, quantity) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) =>
        i === index ? { ...ing, quantity: parseFloat(quantity) || 0 } : ing
      )
    }));
  };

  const removeIngredient = (index) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const handleCreateMenuItem = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.ingredients.length || !formData.baseCost || !formData.suggestedPrice) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      if (editingItem) {
        await MenuAPI.updateMenuItem(editingItem._id, formData);
        toast.success('Menu item updated successfully');
      } else {
        await MenuAPI.createMenuItem(formData);
        toast.success('Menu item created successfully');
      }
      setFormData({
        name: '',
        description: '',
        ingredients: [],
        baseCost: '',
        suggestedPrice: '',
        imageUrl: ''
      });
      setEditingItem(null);
      setShowCreateForm(false);
      fetchData();
    } catch (error) {
      toast.error(`Failed to ${editingItem ? 'update' : 'create'} menu item: ` + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item) => {
    // Normalize ingredients to the form { ingredient: "<id>", quantity, unit }
    const normalizedIngredients = (item.ingredients || []).map(ing => ({
      ingredient: typeof ing?.ingredient === 'string'
        ? ing.ingredient
        : ing?.ingredient?._id ?? '',
      quantity: ing?.quantity ?? 0,
      unit: ing?.unit ?? (typeof ing?.ingredient === 'object' ? (ing.ingredient?.unit || 'pcs') : 'pcs')
    }));

    setEditingItem(item);
    setFormData({
      name: item.name || '',
      description: item.description || '',
      ingredients: normalizedIngredients,
      baseCost: item.baseCost || '',
      suggestedPrice: item.suggestedPrice || '',
      imageUrl: item.imageUrl || ''
    });
    setShowCreateForm(true);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      description: '',
      ingredients: [],
      baseCost: '',
      suggestedPrice: '',
      imageUrl: ''
    });
    setShowCreateForm(false);
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
      const ingId = getIngId(ingredient);
      if (!ingId) return false;
      const availableIngredient = availableIngredients.find(ing => ing._id === ingId);
      if (!availableIngredient) return false;
      
      // Check if ingredient is expired
      if (availableIngredient.expiryDate && new Date(availableIngredient.expiryDate) < now) {
        return false;
      }
      if (availableIngredient.status === 'expired') {
        return false;
      }
      
      return availableIngredient.currentStock >= (ingredient.quantity ?? 0);
    });
  };

  const filteredMenuItems = menuItems.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (selectedCategory === '' || item.category === selectedCategory)
  );

  const filteredIngredients = availableIngredients.filter(ingredient =>
    ingredient.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (selectedCategory === '' || ingredient.category === selectedCategory)
  );

  if (loading && menuItems.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Menu Management</h2>
        <div className="flex space-x-3">
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
          <button
            onClick={() => {
              setEditingItem(null);
              setFormData({
                name: '',
                description: '',
                ingredients: [],
                baseCost: '',
                suggestedPrice: '',
                imageUrl: ''
              });
              setShowCreateForm(true);
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Add New Item
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setActiveTab('menu')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'menu' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Menu Items ({menuItems.length})
        </button>
      </div>

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

      {/* Menu Items Tab */}
      {activeTab === 'menu' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMenuItems.map((item) => (
            <div key={item._id} className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-2">{item.name}</h3>
              {item.description && (
                <p className="text-gray-600 mb-3">{item.description}</p>
              )}
              <div className="space-y-2 mb-4">
                <p><span className="font-medium">Base Cost:</span> ${item.baseCost}</p>
                <p><span className="font-medium">Suggested Price:</span> ${item.suggestedPrice}</p>
                <p>
                  <span className="font-medium">Profit Margin:</span>{' '}
                  {item?.profitMargin != null ? `${Number(item.profitMargin).toFixed(1)}%` : '-'}
                </p>
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
                    const ingId = getIngId(ing);
                    const availableIngredient = ingId
                      ? availableIngredients.find(ai => ai._id === ingId)
                      : null;
                    const now = new Date();
                    const isExpired = availableIngredient && (
                      (availableIngredient.expiryDate && new Date(availableIngredient.expiryDate) < now) ||
                      availableIngredient.status === 'expired'
                    );
                    const isAvailable = availableIngredient && !isExpired && availableIngredient.currentStock >= (ing.quantity ?? 0);
                    return (
                      <li key={index} className={`flex items-center justify-between ${
                        !isAvailable || isExpired ? 'text-red-600' : ''
                      }`}>
                        <span>
                          {getIngName(ing)}: {ing.quantity} {ing.unit}
                          {isExpired && <span className="ml-2 text-xs font-semibold text-red-600">(EXPIRED)</span>}
                        </span>
                        {availableIngredient && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            isExpired
                              ? 'bg-red-200 text-red-900'
                              : isAvailable 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                          }`}>
                            {isExpired 
                              ? 'Expired' 
                              : `${availableIngredient.currentStock} ${ing.unit} available`
                            }
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="flex space-x-2">
                <button 
                  onClick={() => handleEditItem(item)}
                  className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {editingItem ? 'Edit Menu Item' : 'Create Menu Item'}
              </h3>
              <button
                onClick={handleCancelEdit}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateMenuItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Base Cost *</label>
                <input
                  type="number"
                  step="0.01"
                  name="baseCost"
                  value={formData.baseCost}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text.sm font-medium mb-1">Suggested Price *</label>
                <input
                  type="number"
                  step="0.01"
                  name="suggestedPrice"
                  value={formData.suggestedPrice}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Image URL</label>
                <input
                  type="url"
                  name="imageUrl"
                  value={formData.imageUrl}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Ingredients *</label>
                <div className="border border-gray-300 rounded-lg p-3 min-h-[100px]">
                  {formData.ingredients.map((ing, index) => {
                    const ingredient = availableIngredients.find(ingredient => ingredient._id === ing.ingredient);
                    return (
                      <div key={index} className="flex items-center space-x-2 mb-2">
                        <span className="flex-1">{ingredient?.name ?? 'Unknown'}</span>
                        <input
                          type="number"
                          step="0.1"
                          value={ing.quantity}
                          onChange={(e) => updateIngredientQuantity(index, e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <span className="text-sm text-gray-600">{ing.unit}</span>
                        <button
                          type="button"
                          onClick={() => removeIngredient(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2">
                  {availableIngredients.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <p>No ingredients available. Please add some inventory items first.</p>
                    </div>
                  ) : (
                    <select
                      onChange={(e) => {
                        const ingredient = availableIngredients.find(ingredient => ingredient._id === e.target.value);
                        if (ingredient) addIngredientToForm(ingredient);
                        e.target.value = '';
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Add ingredient...</option>
                      {filteredIngredients.map(ingredient => (
                        <option key={ingredient._id} value={ingredient._id}>
                          {ingredient.name} ({ingredient.currentStock} {ingredient.unit}) {ingredient.currentStock === 0 ? '[Out of Stock]' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="flex space-x-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? (editingItem ? 'Updating...' : 'Creating...') : (editingItem ? 'Update Menu Item' : 'Create Menu Item')}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
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

export default MenuManagement;
