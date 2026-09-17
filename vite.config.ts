import { defineConfig } from 'vite'

// Relative assets work at / and at /repository-name/ on GitHub Pages.
export default defineConfig({ base: './' })
