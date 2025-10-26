import './App.css'
import Camera from './components/Camera'
import Report from './components/Report'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-20 dark:bg-[#FFFFFF00] dark:border-0 bg-[#FFFFFF5b] backdrop-blur-md border-b border-gray-200">
        <div className="max-w-screen-lg mx-auto flex items-center justify-center py-3 px-4 space-x-3">
          <img
            src="/logo.png"
            alt="Cheater Beater Logo"
            className="h-7 w-7 object-contain"
          />
          <h1 className="text-[20pt]! font-semibold tracking-tight dark:text-white">
            Cheater Beater Demo
          </h1>
        </div>
      </header>

      <BrowserRouter>
        <Routes>
          {/* Root path → Camera */}
          <Route classname="justify-center" path="/" element={<Camera wsUrl="wss://hackws.austin.kim/ws/upload" />} />

          {/* /report path → Report page */}
          <Route path="/report" element={<Report />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}


export default App

