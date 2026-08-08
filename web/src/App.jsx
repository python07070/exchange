import { Routes, Route, Navigate } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import Discover from './pages/Discover.jsx';
import BusinessPage from './pages/BusinessPage.jsx';
import Feed from './pages/Feed.jsx';
import Favourites from './pages/Favourites.jsx';
import OwnerDashboard from './pages/OwnerDashboard.jsx';

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Discover />} />
        <Route path="/b/:slug" element={<BusinessPage />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/saved" element={<Favourites />} />
        <Route path="/business" element={<OwnerDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
