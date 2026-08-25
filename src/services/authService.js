const parseAuthResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Error de autenticación');
  }
  return data;
};

export const getAuthSession = async () => {
  const response = await fetch('/api/auth/me', {
    credentials: 'same-origin'
  });
  return parseAuthResponse(response);
};

export const login = async ({ username, password }) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return parseAuthResponse(response);
};

export const logout = async () => {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin'
  });
  return parseAuthResponse(response);
};
