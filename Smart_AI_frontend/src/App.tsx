import { useEffect, lazy, Suspense } from 'react'
import AppRouter from '@/routes/AppRouter'
import { useAuthStore } from '@/stores/authStore'
import { useCompareStore } from '@/stores/compareStore'
import './App.css'

const FloatingChat = lazy(() =>
  import('@/features/chat').then((module) => ({
    default: module.FloatingChat,
  }))
)

function App() {
  const initialize = useAuthStore((state) => state.initialize)
  const loadCompareFromStorage = useCompareStore((state) => state.loadFromStorage)

  useEffect(() => {
    // Initialize auth state on app load
    // Check for existing tokens and validate them
    initialize()
    
    // Load compare list from localStorage (Requirement 1.5)
    loadCompareFromStorage()
  }, [initialize, loadCompareFromStorage])

  return (
    <>
      <AppRouter />
      <Suspense fallback={null}>
        <FloatingChat />
      </Suspense>
    </>
  )
}

export default App
