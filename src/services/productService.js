const API_URL = '/api/products';
const DEFAULT_PAGE_SIZE = 25;

const buildProductsUrl = ({ page, limit } = {}) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (page) params.set('page', String(page));
  const query = params.toString();
  return query ? `${API_URL}?${query}` : API_URL;
};

export const getProducts = async () => {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error('Error fetching products');
  }
  return response.json();
};

export const getProductsPage = async ({ page = 1, limit = DEFAULT_PAGE_SIZE } = {}) => {
  const response = await fetch(buildProductsUrl({ page, limit }));
  if (!response.ok) {
    throw new Error('Error fetching products');
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};

export const getAllProducts = async ({ limit = DEFAULT_PAGE_SIZE, maxPages = 200 } = {}) => {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await getProductsPage({ page, limit });
    all.push(...chunk);
    if (chunk.length < limit) break;
  }
  return all;
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
