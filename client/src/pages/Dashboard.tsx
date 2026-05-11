import { Outlet, useLocation } from 'react-router-dom'
import Layout from '../components/Layout'

export default function Dashboard() {
  const location = useLocation()
  const defaultSidebarCollapsed = location.pathname === '/meetings'
  
  return (
    <Layout defaultSidebarCollapsed={defaultSidebarCollapsed}>
      <Outlet />
    </Layout>
  )
}