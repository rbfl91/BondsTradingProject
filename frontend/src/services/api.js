import axios from 'axios';

// API base URL - can be configured via environment or settings
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    if (API_TOKEN) {
      config.headers.Authorization = `Bearer ${API_TOKEN}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('Unauthorized - Invalid or missing auth token');
    }
    return Promise.reject(error);
  }
);

// ============ Bond API Services ============

const bondAPI = {
  // Health Check
  healthCheck: async () => {
    const response = await apiClient.get('/health');
    return response.data;
  },

  // API Status
  getStatus: async () => {
    const response = await apiClient.get('/status');
    return response.data;
  },

  // Get contract address
  getContractAddress: async () => {
    const response = await apiClient.get('/contract/address');
    return response.data;
  },

  // Bond Count - Get total number of bonds issued
  getBondCount: async () => {
    const response = await apiClient.get('/bond/count');
    return response.data;
  },

  // Issue Bond - Create a new bond
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

  // Purchase Bond - Buy bonds
  purchaseBond: async (bondId, amount) => {
    const response = await apiClient.post('/bond/purchase', {
      bondId,
      amount,
    });
    return response.data;
  },

  // Sell Bond - Sell bonds to another address
  sellBond: async (bondId, amount, buyerAddress) => {
    const response = await apiClient.post('/bond/sell', {
      bondId,
      amount,
      buyerAddress,
    });
    return response.data;
  },

  // Redeem Bond - Redeem bonds
  redeemBond: async (bondId, amount) => {
    const response = await apiClient.post('/bond/redeem', {
      bondId,
      amount,
    });
    return response.data;
  },

  // Get Bond Info - Get details of a specific bond
  getBondInfo: async (bondId) => {
    const response = await apiClient.get(`/bond/${bondId}/info`);
    return response.data;
  },

  // Get Bond Holders - Get list of holders for a bond
  getBondHolders: async (bondId) => {
    const response = await apiClient.get(`/bond/${bondId}/holders`);
    return response.data;
  },

  // Get Bond Holder Amount - Get amount for a specific holder
  getBondHolderAmount: async (bondId, holderAddress) => {
    const response = await apiClient.get(
      `/bond/${bondId}/holder/${holderAddress}/amount`
    );
    return response.data;
  },

  // Get All Bonds - Fetch all bond IDs by iterating through bondCount
  getAllBonds: async () => {
    const { bondCount } = await bondAPI.getBondCount();
    const bonds = [];
    for (let i = 1; i <= bondCount; i++) {
      try {
        const info = await bondAPI.getBondInfo(i);
        bonds.push(info);
      } catch (error) {
        console.warn(`Bond ${i} not available:`, error.message);
      }
    }
    return bonds;
  },
};

// ============ Crypto Market API Services ============

const cryptoAPI = {
  // Get API status (includes CMC key status)
  getStatus: async () => {
    const response = await apiClient.get('/status');
    return response.data;
  },

  // Get top N cryptocurrency listings with USD conversion
  getListings: async (limit = 100, start = 1, tag = null) => {
    const params = { limit, start };
    if (tag) params.tag = tag;
    const response = await apiClient.get('/crypto/listings', { params });
    return response.data;
  },

  // Get OHLC (Open/High/Low/Close) data for a cryptocurrency
  getOHLC: async (symbol, days = 7) => {
    const response = await apiClient.get('/crypto/ohlc', {
      params: { symbol, days }
    });
    return response.data;
  },

  // Get supply data for a cryptocurrency
  getSupply: async (symbol) => {
    const response = await apiClient.get('/crypto/supply', {
      params: { symbol }
    });
    return response.data;
  },

  // Get top movers and gainers/losers
  getMoversGainers: async () => {
    const response = await apiClient.get('/crypto/movers-gainers');
    return response.data;
  },

  // Get global market metrics
  getGlobalMetrics: async () => {
    const response = await apiClient.get('/crypto/global-metrics');
    return response.data;
  },

  // Convert crypto amount to fiat/crypto
  convert: async (symbol, amount, convert) => {
    const response = await apiClient.get('/crypto/convert', {
      params: { symbol, amount, convert }
    });
    return response.data;
  },

  // Get cryptocurrency news
  getNews: async () => {
    const response = await apiClient.get('/crypto/news');
    return response.data;
  },

  // Get trending cryptocurrencies
  getTrending: async () => {
    const response = await apiClient.get('/crypto/trending');
    return response.data;
  },
};

export default bondAPI;
export { cryptoAPI };