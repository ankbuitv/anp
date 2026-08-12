import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/layout/AppShell";
import { Viewer } from "./components/media/Viewer";
import { Toasts } from "./components/common/Toasts";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { VerifyEmail } from "./pages/VerifyEmail";
import { VerifyEmailPending } from "./pages/VerifyEmailPending";
import { Home } from "./pages/Home";
import { Library, Videos, Favorites, Recent } from "./pages/Library";
import { Albums, AlbumDetail } from "./pages/Albums";
import { CalendarPage } from "./pages/Calendar";
import { MapPage } from "./pages/MapPage";
import { Memories } from "./pages/Memories";
import { Private } from "./pages/Private";
import { Shares } from "./pages/Shares";
import { ShareView } from "./pages/ShareView";
import { Drop } from "./pages/Drop";
import { Backup } from "./pages/Backup";
import { Cleanup } from "./pages/Cleanup";
import { Storage } from "./pages/Storage";
import { Trash } from "./pages/Trash";
import { Notifications } from "./pages/Notifications";
import { Activity } from "./pages/Activity";
import { Settings } from "./pages/Settings";
import { Devices } from "./pages/Devices";
import { Search } from "./pages/Search";

export function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/verify-email/pending" element={<VerifyEmailPending />} />
        <Route
          path="/s/:token"
          element={
            <>
              <ShareView />
              <Viewer />
              <Toasts />
            </>
          }
        />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/memories" element={<Memories />} />
          <Route path="/albums" element={<Albums />} />
          <Route path="/albums/:id" element={<AlbumDetail />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/recent" element={<Recent />} />
          <Route path="/private" element={<Private />} />
          <Route path="/shares" element={<Shares />} />
          <Route path="/drop" element={<Drop />} />
          <Route path="/backup" element={<Backup />} />
          <Route path="/cleanup" element={<Cleanup />} />
          <Route path="/storage" element={<Storage />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/search" element={<Search />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
