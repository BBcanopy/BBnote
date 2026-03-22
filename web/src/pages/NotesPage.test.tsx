import { render, screen } from "@testing-library/react";
import { NotesPage } from "./NotesPage";

describe("NotesPage", () => {
  it("renders the base workspace shell", () => {
    render(<NotesPage />);
    expect(screen.getByRole("heading", { name: "BBNote" })).toBeInTheDocument();
    expect(screen.getByText(/markdown notes/i)).toBeInTheDocument();
  });
});

