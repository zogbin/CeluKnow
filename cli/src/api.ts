import axios, { AxiosInstance } from 'axios';

export class CeluKnowAPI {
  private client: AxiosInstance;

  constructor(baseURL: string, token?: string) {
    const apiBase = baseURL.endsWith('/api') ? baseURL : `${baseURL}/api`;
    this.client = axios.create({
      baseURL: apiBase,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  }

  setToken(token: string) {
    this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
  }

  async login(username: string, password: string) {
    const res = await this.client.post('/auth/login', { username, password });
    return res.data;
  }

  async getDocuments(params?: { category?: string; limit?: number; offset?: number }) {
    const res = await this.client.get('/documents', { params });
    return res.data;
  }

  async searchDocuments(keyword: string, options?: { category?: string; limit?: number }) {
    const res = await this.client.get('/documents/search', { 
      params: { q: keyword, ...options } 
    });
    return res.data;
  }

  async getDocument(id: number) {
    const res = await this.client.get(`/documents/${id}`);
    return res.data;
  }

  async deleteDocument(id: number) {
    const res = await this.client.delete(`/documents/${id}`);
    return res.data;
  }

  async importFiles(files: { name: string; content: string; folder?: string }[]) {
    const res = await this.client.post('/import-export/import', { files });
    return res.data;
  }

  async exportDocuments() {
    const res = await this.client.get('/import-export/export');
    return res.data;
  }
}