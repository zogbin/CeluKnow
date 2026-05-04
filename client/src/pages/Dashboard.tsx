import { Outlet } from 'react-router-dom'
import Layout from '../components/Layout'

export default function Dashboard() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}