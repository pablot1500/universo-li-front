const API_URL = '/api/products';
const DEFAULT_PAGE_SIZE = 25;

const parseProductsPage = async (response) => {
  if (!response.ok) {
    throw new Error('Error fetching products');
  }
  const data = await response.json();
  if (Array.isArray(data)) {
    return {
      items: data,
      page: 1,
      limit: data.length,
      total: data.length,
      hasMore: false
    };
  }
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    page: data?.page || 1,
    limit: data?.limit || DEFAULT_PAGE_SIZE,
    total: data?.total || 0,
    hasMore: Boolean(data?.hasMore)
  };
};

const buildProductsUrl = ({ page, limit, category, featured = false, summary = false, search } = {}) => {
  const params = new URLSearchParams();
  if (summary) params.set('summary', '1');
  if (limit) params.set('limit', String(limit));
  if (page) params.set('page', String(page));
  if (category) params.set('category', category);
  if (featured) params.set('featured', '1');
  if (search) params.set('search', search);
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
  const data = await parseProductsPage(response);
  return data.items;
};

export const getProductSummariesPage = async ({
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  category,
  featured,
  search
} = {}) => {
  const response = await fetch(buildProductsUrl({ page, limit, category, featured, search, summary: true }));
  return parseProductsPage(response);
};

export const getProductCategories = async () => {
  const response = await fetch(`${API_URL}/categories`);
  if (!response.ok) {
    throw new Error('Error fetching product categories');
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};

export const getProductById = async (id) => {
  const response = await fetch(`${API_URL}/${id}`);
  if (!response.ok) {
    throw new Error('Error fetching product');
  }
  return response.json();
};

export const getProductThumbnails = async (ids = []) => {
  const cleanIds = ids.filter(Boolean);
  if (!cleanIds.length) return [];
  const params = new URLSearchParams({ ids: cleanIds.join(',') });
  const response = await fetch(`${API_URL}/thumbnails?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Error fetching product thumbnails');
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};

export const getAllProducts = async ({ limit = DEFAULT_PAGE_SIZE, maxPages = 200 } = {}) => {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await getProductSummariesPage({ page, limit });
    all.push(...chunk.items);
    if (!chunk.hasMore || chunk.items.length < limit) break;
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

export const patchProduct = async (id, patch) => {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    throw new Error('Error updating product');
  }
  return response.json();
};
