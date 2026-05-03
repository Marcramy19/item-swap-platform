// frontend/js/app.js
// ✅ Use RELATIVE path - frontend is served from same origin as API via express.static()
const API_BASE = '/api';

// Auth storage helpers
function getToken() {
  return localStorage.getItem('ecoswap_token');
}

function setToken(token) {
  if (token) {
    localStorage.setItem('ecoswap_token', token);
  } else {
    localStorage.removeItem('ecoswap_token');
  }
}

function getUser() {
  const user = localStorage.getItem('ecoswap_user');
  return user ? JSON.parse(user) : null;
}

function setUser(user) {
  if (user) {
    localStorage.setItem('ecoswap_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('ecoswap_user');
  }
}

// API fetch wrapper with auth header
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    // ✅ Relative URL - browser auto-prefixes with current origin (localhost:3005)
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'same-origin'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Update navigation based on auth status
function updateNav() {
  const nav = document.getElementById('nav-links');
  const user = getUser();
  
  if (!nav) return;
  
  if (user) {
    nav.innerHTML = `
      <a href="items.html">Browse</a>
      <a href="item-form.html">Post Item</a>
      <a href="my-items.html">My Items</a>
      <a href="swaps.html">Swaps</a>
      // <a href="profile.html">Profile</a>
      <a href="#" id="logout-btn">Logout (${escapeHtml(user.name)})</a>
    `;
    
    document.getElementById('logout-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  } else {
    nav.innerHTML = `
      <a href="items.html">Browse</a>
      <a href="login.html">Login</a>
      <a href="register.html">Register</a>
    `;
  }
}

// Login function
async function login(email, password) {
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    setToken(data.token);
    setUser(data.user);
    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Register function
async function register(name, email, password) {
  try {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    
    setToken(data.token);
    setUser(data.user);
    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Logout function
function logout() {
  setToken(null);
  setUser(null);
  window.location.href = 'index.html';
}

// Require auth - redirect if not logged in
function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// XSS protection helper
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  updateNav();
});

// Export for use in other pages
window.apiFetch = apiFetch;
window.login = login;
window.register = register;
window.logout = logout;
window.requireAuth = requireAuth;
window.getUser = getUser;
window.getToken = getToken;
window.escapeHtml = escapeHtml;