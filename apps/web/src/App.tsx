import { useCatalogQuery } from "./api/queries";
import "./App.css";
import R3F from "./components/R3F/R3F";
import UI from "./components/UI/UI";

function App() {
  const { data: catalog, isLoading, error } = useCatalogQuery();

  if (isLoading) return <p>Loading catalog…</p>;
  if (error) return <p>Failed to load: {String(error)}</p>;
  if (!catalog) return null;

  return (
    <div className="app">
      <R3F catalog={catalog} />
      <UI catalog={catalog} />
    </div>
  );
}

export default App;
