import { Routes, Route, BrowserRouter } from 'react-router-dom'
import { useState } from 'react'
import Layout from './components/Layout.jsx'
import Login from './pages/auth/Login.jsx'
import SignUp from './pages/auth/SignUp.jsx'
import ForgotPassword from './pages/auth/ForgotPassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import UserList from './pages/users/UserList.jsx'
import CreateUser from './pages/users/CreateUser.jsx'
import EditUser from './pages/users/EditUser.jsx'
import { AuthContext } from './contexts/AuthContext.jsx'

function App() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(
    localStorage.getItem('token')
  )

  const login = (userData, tokenData) => {
    setUser(userData)
    setToken(tokenData)
    localStorage.setItem('token', tokenData)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
  }

  const authValue = {
    user,
    token,
    login,
    logout,
    isAuthenticated: !!token,
  }

  return (
    <BrowserRouter>
      <AuthContext.Provider value={authValue}>
        {!token ? (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="*" element={<Login />} />
          </Routes>
        ) : (
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/users" element={<UserList />} />
              <Route path="/users/new" element={<CreateUser />} />
              <Route path="/users/:id/edit" element={<EditUser />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Layout>
        )}
      </AuthContext.Provider>
    </BrowserRouter>
  )
}

export default App
