import axios from 'axios';
export class CeluKnowAPI {
    constructor(baseURL, token) {
        const apiBase = baseURL.endsWith('/api') ? baseURL : `${baseURL}/api`;
        this.client = axios.create({
            baseURL: apiBase,
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
    }
    setToken(token) {
        this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
    }
    async login(username, password) {
        const res = await this.client.post('/auth/login', { username, password });
        return res.data;
    }
    async getDocuments(params) {
        const res = await this.client.get('/documents', { params });
        return res.data;
    }
    async searchDocuments(keyword, options) {
        const res = await this.client.get('/documents/search', {
            params: { q: keyword, ...options }
        });
        return res.data;
    }
    async getDocument(id) {
        const res = await this.client.get(`/documents/${id}`);
        return res.data;
    }
    async deleteDocument(id) {
        const res = await this.client.delete(`/documents/${id}`);
        return res.data;
    }
    async importFiles(files) {
        const res = await this.client.post('/import-export/import', { files });
        return res.data;
    }
    async exportDocuments() {
        const res = await this.client.get('/import-export/export');
        return res.data;
    }
}
