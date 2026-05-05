import axios from 'axios';
export class CeluKnowAPI {
    constructor(baseURL, token) {
        this.client = axios.create({
            baseURL,
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
    }
    setToken(token) {
        this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
    }
    async login(username, password) {
        const res = await this.client.post('/api/auth/login', { username, password });
        return res.data;
    }
    async getDocuments(params) {
        const res = await this.client.get('/api/documents', { params });
        return res.data;
    }
    async searchDocuments(keyword, options) {
        const res = await this.client.get('/api/documents/search', {
            params: { q: keyword, ...options }
        });
        return res.data;
    }
    async getDocument(id) {
        const res = await this.client.get(`/api/documents/${id}`);
        return res.data;
    }
    async deleteDocument(id) {
        const res = await this.client.delete(`/api/documents/${id}`);
        return res.data;
    }
    async importFiles(files) {
        const res = await this.client.post('/api/import', { files });
        return res.data;
    }
    async exportDocuments() {
        const res = await this.client.get('/api/export');
        return res.data;
    }
}
