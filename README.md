<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Studio App - GroupTrip Setup

This contains everything you need to run your app locally and deploy it online.

## 🚀 1. 專案建置與套件安裝 (Project Setup & Packages)

**Prerequisites:** Node.js (v18+)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the environment variables in `.env` based on `.env.example`.
3. Start the dev server:
   ```bash
   npm run dev
   ```

## 🌐 2. 部署上線 (Deploy with GitHub Actions)

本專案已經設定好 GitHub Actions，可以透過 `.github/workflows/deploy.yml` 自動將 React + Vite 專案部署到 **GitHub Pages**。

### 如何啟用部署：
1. 將程式碼推送到 GitHub 儲存庫的 `main` 分支。
2. 至儲存庫的 **Settings** > **Pages**：
   - 將 Source 設為 **GitHub Actions**。
3. 每次推送到 `main` 時，GitHub Actions 就會自動建置(`npm run build`)並部署最新的網站。

## 🛡️ 3. 專案過濾設定 (.gitignore)

為了避免上傳不必要的資料夾、暫存檔與隱私檔，已經更新了專案的 `.gitignore` 檔案：
- 隱私檔與設定檔 (`.env`, `.env.local`, `.DS_Store`) 都不會被加入 Git 追蹤。
- 打包出來的資料夾 (`dist/`, `build/`)，以及依賴庫 (`node_modules/`) 皆被正確過濾。
- 編輯器暫存檔 (`.vscode/`, `.idea/`) 也設定為不提交。
