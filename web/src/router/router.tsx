import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { DocsPage } from "../pages/DocsPage";
import { ExportPage } from "../pages/ExportPage";
import { ImportPage } from "../pages/ImportPage";
import { NotesPage } from "../pages/NotesPage";

export const router = createBrowserRouter([
  {
    path: "/docs",
    element: <DocsPage />
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <NotesPage />
      },
      {
        path: "imports",
        element: <ImportPage />
      },
      {
        path: "exports",
        element: <ExportPage />
      }
    ]
  }
]);
