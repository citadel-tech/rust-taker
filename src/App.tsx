import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { SetupPage } from "./pages/setup/SetupPage";
import { WalletPage } from "./pages/wallet/WalletPage";
import { useSessionStore } from "./store/session";

function App() {
  const initialized = useSessionStore((s) => s.initialized);

  if (!initialized) {
    return <SetupPage />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<WalletPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
