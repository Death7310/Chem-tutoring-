import { useLiveQuery } from "dexie-react-hooks";
import { HashRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { db } from "./lib/db";
import { reviewQueue } from "./lib/review";
import LibraryPage from "./pages/LibraryPage";
import NewBookSetPage from "./pages/NewBookSetPage";
import NewTestSetPage from "./pages/NewTestSetPage";
import ProblemPage from "./pages/ProblemPage";
import ProblemSetPage from "./pages/ProblemSetPage";
import ProblemsPage from "./pages/ProblemsPage";
import ReaderPage from "./pages/ReaderPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";
import TutorListPage from "./pages/TutorListPage";
import TutorPage from "./pages/TutorPage";

export default function App() {
  const dueCount = useLiveQuery(async () => reviewQueue(await db.problems.toArray()).length, [], 0);

  return (
    <HashRouter>
      <div className="app">
        <nav className="nav">
          <div className="brand">⚗️ Chem Tutor</div>
          <NavLink to="/tutor"><span aria-hidden>💬</span> Tutor</NavLink>
          <NavLink to="/problems"><span aria-hidden>📝</span> Problems</NavLink>
          <NavLink to="/review">
            <span aria-hidden>🔁</span> Review
            {dueCount > 0 && <span className="badge">{dueCount}</span>}
          </NavLink>
          <NavLink to="/library"><span aria-hidden>📚</span> Library</NavLink>
          <NavLink to="/settings"><span aria-hidden>⚙️</span> Settings</NavLink>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/tutor" replace />} />
            <Route path="/tutor" element={<TutorListPage />} />
            <Route path="/tutor/:id" element={<TutorPage />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/problems/new-test" element={<NewTestSetPage />} />
            <Route path="/problems/new-book" element={<NewBookSetPage />} />
            <Route path="/problems/set/:id" element={<ProblemSetPage />} />
            <Route path="/problems/p/:id" element={<ProblemPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/:bookId" element={<ReaderPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/tutor" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
