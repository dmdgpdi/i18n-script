import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { useTranslation } from 'react-i18next'

function App() {
  const { t } = useTranslation()
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>{t('hello')}</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          {t('count', { count })}
        </button>
        <p>
          {t('edit')}
        </p>
      </div>
      <p className="read-the-docs">
        {t('click')}
      </p>
    </>
  )
}

export default App
