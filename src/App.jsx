import './App.css'
import Camera from './components/camera'
import Report from './components/Report'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {

  return (
    <BrowserRouter>
      <Routes>
        {/* Root path → Camera */}
        <Route classname="justify-center" path="/" element={<Camera wsUrl="wss://hackws.austin.kim/ws/upload" />} />

        {/* /report path → Report page */}
        <Route path="/report" element={<Report />} />
      </Routes>
    </BrowserRouter>
  )
}


export default App

