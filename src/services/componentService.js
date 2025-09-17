const API_URL = '/api/components';

export const getComponents = async () => {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error('Error fetching components');
  }
  return response.json();
};

export const createComponent = async (component) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(component)
  });
  if (!response.ok) {
    throw new Error('Error creating component');
  }
  return response.json();
};

export const deleteComponent = async (id) => {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Error deleting component');
  }
  return response.json();
};
