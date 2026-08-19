import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./src/shared/api/mocks/server";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
