import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { MigrationPage } from "../pages/MigrationPage";
import { NotesPage } from "../pages/NotesPage";
import { RouteErrorPage } from "../pages/RouteErrorPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <NotesPage />
      },
      {
        path: "folders/:folderId",
        element: <NotesPage />
      },
      {
        path: "folders/:folderId/notes/:noteId",
        element: <NotesPage />
      },
      {
        path: "notes/:noteId",
        element: <NotesPage />
      },
      {
        path: "migration",
        element: <MigrationPage />
      }
    ]
  }
]);
