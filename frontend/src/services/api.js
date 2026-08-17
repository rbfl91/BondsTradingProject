import axios from 'axios';
import { getAuthToken, markUnauthorized } from '../auth';

// API base URL — configurable via Vite env
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
// H-04 FIX: no static token is embedded in the bundle anymore. The bearer
// token is injected server-side (Vite dev proxy / production reverse proxy),
// or, when the API is reached directly, by the operator at runtime via the
// AuthGate (stored in localStorage, see src/auth.js).

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // N-18 FIX: deliberately LONGER than the server-side CMC upstream timeout
  // (30 s). At the old 30 s the client aborted exactly as a slow upstream
  // call succeeded (then the cached result made a retry succeed — confusing
  // UX). 40 s gives the server headroom while still bounding the wait.
  timeout: 40000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token (H-04: operator token from src/auth.js;
// in dev/prod the proxy usually already injects it server-side)
apiClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // H-04: ask the UI (AuthGate) to prompt for the operator token.
      markUnauthorized();
    }
    return Promise.reject(error);
  }
);

// ============ Bond API Services ============

const bondAPI = {
  healthCheck: async () => {
    const response = await apiClient.get('/health');
    return response.data;
  },

  getStatus: async () => {
    const response = await apiClient.get('/status');
    return response.data;
  },

  getContractAddress: async () => {
    const response = await apiClient.get('/contract/address');
    return response.data;
  },

  getBondCount: async () => {
    const response = await apiClient.get('/bond/count');
    return response.data;
  },

  // M-08 FIX: Batch endpoint — fetches ALL bonds in a single API call
  getAllBonds: async () => {
    const response = await apiClient.get('/bond/all');
    return response.data; // { bonds: [...], bondCount: N }
  },

  issueBond: async (data) => {
    const response = await apiClient.post('/bond/issue', {
      name: data.name,
      issuer: data.issuer,
      faceValue: data.faceValue,
      maturityDate: data.maturityDate,
      interestRate: data.interestRate,
      supply: data.supply,
    });
    return response.data;
  },

  purchaseBond: async (bondId, amount) => {
    const response = await apiClient.post('/bond/purchase', { bondId, amount });
    return response.data;
  },

  sellBond: async (bondId, amount, buyerAddress) => {
    const response = await apiClient.post('/bond/sell', { bondId, amount, buyerAddress });
    return response.data;
  },

  redeemBond: async (bondId, amount) => {
    const response = await apiClient.post('/bond/redeem', { bondId, amount });
    return response.data;
  },

  getBondInfo: async (bondId) => {
    const response = await apiClient.get(`/bond/${bondId}/info`);
    return response.data;
  },

  getBondHolders: async (bondId) => {
    const response = await apiClient.get(`/bond/${bondId}/holders`);
    return response.data;
  },

  getBondHolderAmount: async (bondId, holderAddress) => {
    const response = await apiClient.get(`/bond/${bondId}/holder/${holderAddress}/amount`);
    return response.data;
  },
};

// ============ Crypto Market API Services ============

const cryptoAPI = {
  getStatus: async () => {
    const response = await apiClient.get('/status');
    return response.data;
  },

  getListings: async (limit = 100, start = 1, tag = null) => {
    const params = { limit, start };
    if (tag) params.tag = tag;
    const response = await apiClient.get('/crypto/listings', { params });
    return response.data;
  },

  getOHLC: async (symbol, days = 7) => {
    const response = await apiClient.get('/crypto/ohlc', { params: { symbol, days } });
    return response.data;
  },

  getSupply: async (symbol) => {
    const response = await apiClient.get('/crypto/supply', { params: { symbol } });
    return response.data;
  },

  getMoversGainers: async () => {
    const response = await apiClient.get('/crypto/movers-gainers');
    return response.data;
  },

  getGlobalMetrics: async () => {
    const response = await apiClient.get('/crypto/global-metrics');
    return response.data;
  },

  convert: async (symbol, amount, convert) => {
    const response = await apiClient.get('/crypto/convert', { params: { symbol, amount, convert } });
    return response.data;
  },

  getNews: async () => {
    const response = await apiClient.get('/crypto/news');
    return response.data;
  },

  getTrending: async () => {
    const response = await apiClient.get('/crypto/trending');
    return response.data;
  },
};

export default bondAPI;
export { cryptoAPI };
