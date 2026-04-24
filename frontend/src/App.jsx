import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/login/LoginPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  )
}
