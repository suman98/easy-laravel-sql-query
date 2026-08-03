import { Routes, Route, Navigate } from "react-router-dom";
import ConnectionsPage from "@/pages/ConnectionsPage";
import NewConnectionPage from "@/pages/NewConnectionPage";
import ConnectionAnalyzerPage from "@/pages/ConnectionAnalyzerPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/connections" replace />} />
      <Route path="/connections" element={<ConnectionsPage />} />
      <Route path="/connections/new" element={<NewConnectionPage />} />
      <Route path="/connections/:id" element={<ConnectionAnalyzerPage />} />
    </Routes>
  );
}

export default App;
