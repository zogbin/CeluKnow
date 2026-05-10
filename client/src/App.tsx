import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import DocumentPage from './pages/DocumentPage'
import TaxonomyPage from './pages/TaxonomyPage'
import GraphPage from './pages/GraphPage'
import UsersPage from './pages/UsersPage'
import Profile from './pages/Profile'
import HelpPage from './pages/HelpPage'
import MeetingsPage from './pages/MeetingsPage'

function App() {
  const token = localStorage.getItem('token')
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={!token ? <Login /> : <Navigate to="/" />} />
        <Route path="/" element={token ? <Dashboard /> : <Navigate to="/login" />}>
          <Route index element={<Home />} />
          <Route path="doc/help" element={<HelpPage />} />
          <Route path="doc/:id" element={<DocumentPage />} />
          <Route path="taxonomy" element={<TaxonomyPage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="profile" element={<Profile />} />
          <Route path="meetings" element={<MeetingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App