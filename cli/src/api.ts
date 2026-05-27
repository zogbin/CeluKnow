import axios, { AxiosInstance } from 'axios';

export interface IndexSection {
  name: string;
  docTitles: string[];
}

export interface IndexData {
  systemCategories: IndexSection[];
  userCategories: IndexSection[];
  tags: IndexSection[];
}

export interface GraphNode {
  id: number;
  name: string;
  val: number;
  categories: { name: string; color: string }[];
  tags: string[];
}

export interface GraphLink {
  source: number;
  target: number;
  type: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface QueryOptions {
  q: string;
  limit?: number;
  offset?: number;
  min_score?: number;
  full?: boolean;
  related?: boolean;
  explain?: boolean;
}

export interface QueryResult {
  query: string;
  total: number;
  results: any[];
}

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

  async getKnowledgeIndex(): Promise<IndexData> {
    const res = await this.client.get('/documents/knowledge-index');
    return res.data;
  }

  async getGraph(): Promise<GraphData> {
    const res = await this.client.get('/documents/graph');
    return res.data;
  }

  async getCategoryDocuments(categoryId: number) {
    const res = await this.client.get(`/categories/${categoryId}/documents`);
    return res.data;
  }

  async getDocumentCategories(docId: number) {
    const res = await this.client.get(`/categories/document/${docId}`);
    return res.data;
  }

  async queryDocuments(options: QueryOptions): Promise<QueryResult> {
    const params: any = { q: options.q };
    if (options.limit) params.limit = options.limit;
    if (options.offset) params.offset = options.offset;
    if (options.min_score) params.min_score = options.min_score;
    if (options.full) params.full = 'true';
    if (options.related) params.related = 'true';
    if (options.explain) params.explain = 'true';
    const res = await this.client.get('/documents/query', { params });
    return res.data;
  }
}