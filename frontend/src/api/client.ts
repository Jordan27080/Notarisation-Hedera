import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use(config => {
  const raw = localStorage.getItem('nh_auth')
  if (raw) {
    const { token } = JSON.parse(raw)
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default client
