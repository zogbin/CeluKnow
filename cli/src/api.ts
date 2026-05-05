import axios, { AxiosInstance } from 'axios';

export class CeluKnowAPI {
  private client: AxiosInstance;

  constructor(baseURL: string, token?: string) {
    this.client = axios.create({
      baseURL,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  }

  setToken(token: string) {
    this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
  }

  async login(username: string, password: string) {
    const res = await this.client.post('/api/auth/login', { username, password });
    return res.data;
  }

  async getDocuments(params?: { category?: string; limit?: number; offset?: number }) {
    const res = await this.client.get('/api/documents', { params });
    return res.data;
  }

  async searchDocuments(keyword: string, options?: { category?: string; limit?: number }) {
    const res = await this.client.get('/api/documents/search', { 
      params: { q: keyword, ...options } 
    });
    return res.data;
  }

  async getDocument(id: number) {
    const res = await this.client.get(`/api/documents/${id}`);
    return res.data;
  }

  async deleteDocument(id: number) {
    const res = await this.client.delete(`/api/documents/${id}`);
    return res.data;
  }

  async importFiles(files: { name: string; content: string; folder?: string }[]) {
    const res = await this.client.post('/api/import', { files });
    return res.data;
  }

  async exportDocuments() {
    const res = await this.client.get('/api/export');
    return res.data;
  }
}