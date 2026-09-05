import { Route, Routes } from "react-router-dom";

import { AppShell } from "./components/app-shell";
import { CreatePage } from "./pages/create-page";
import { DocsPage } from "./pages/docs-page";
import { ExplorePage } from "./pages/explore-page";
import { MyMarketsPage } from "./pages/my-markets-page";
import { TokenPage } from "./pages/token-page";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<ExplorePage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/token/:token" element={<TokenPage />} />
        <Route path="/me" element={<MyMarketsPage />} />
        <Route path="*" element={<ExplorePage />} />
      </Routes>
    </AppShell>
  );
}
