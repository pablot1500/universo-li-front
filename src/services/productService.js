const API_URL = '/api/products';

export const getProducts = async () => {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error('Error fetching products');
  }
  return response.json();
};

export const createProduct = async (product) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  });
  if (!response.ok) {
    throw new Error('Error creating product');
  }
  return response.json();
};

export const deleteProduct = async (id) => {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Error deleting product');
  }
  return response.json();
};
