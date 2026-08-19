import { defineConfig } from "orval";

export default defineConfig({
  liteNotion: {
    input: {
      target: "../api/openapi.json",
    },
    output: {
      clean: true,
      client: "react-query",
      httpClient: "fetch",
      mock: {
        generators: [
          {
            delay: false,
            type: "msw",
            useExamples: true,
          },
        ],
        indexMockFiles: true,
      },
      mode: "tags-split",
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          name: "apiFetch",
          path: "./src/shared/api/api-fetch.ts",
        },
      },
      schemas: "src/shared/api/generated/model",
      target: "src/shared/api/generated/endpoints.ts",
    },
  },
});
