import { defineConfig } from "@playwright/test";

export default defineConfig({ testDir: "tests/real", timeout: 240000, workers: 1, reporter: [["list"]], outputDir: "test-results" });
