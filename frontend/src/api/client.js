import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/',
  timeout: 5000,
  headers: { Accept: 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('ub-herbal-token')
  if (token) config.headers.Authorization = `Token ${token}`
  return config
})

export default client
