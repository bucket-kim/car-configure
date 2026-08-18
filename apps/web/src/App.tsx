import { useCatalogQuery } from './api/queries'
import './App.css'
import R3F from './components/R3F/R3F'
import UI from './components/UI/UI'

function App() {

  const { data, isLoading, error } = useCatalogQuery();

  console.log(data, isLoading, error)

  return (
    <div className="app">
      <R3F />
      <UI />
    </div>
  )
}

export default App
