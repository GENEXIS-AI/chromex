# Chromex

[![CI](https://github.com/GENEXIS-AI/chromex/actions/workflows/ci.yml/badge.svg)](https://github.com/GENEXIS-AI/chromex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/GENEXIS-AI/chromex?style=social)](https://github.com/GENEXIS-AI/chromex/stargazers)
[![English](https://img.shields.io/badge/readme-English-111827.svg)](./README.md)
[![한국어](https://img.shields.io/badge/readme-한국어-2563eb.svg)](./README.ko.md)
[![日本語](https://img.shields.io/badge/readme-日本語-dc2626.svg)](./README.ja.md)
[![简体中文](https://img.shields.io/badge/readme-简体中文-16a34a.svg)](./README.zh-CN.md)

Chromex は、Chrome と Codex をローカルのネイティブブリッジで接続する Chrome MV3 サイドパネルアシスタントです。現在のページ、選択したタブ、アップロードしたファイル、音声入力、画像、ブラウザ操作を扱いながら、認証情報を拡張機能ストレージの外に保ちます。

Published by **GenexisAI CHOI**.

![Chromex browser side-panel assistant](./assets/chromex-hero.png)

## Star History

<a href="https://www.star-history.com/#GENEXIS-AI/chromex&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date" />
  </picture>
</a>

## 主な機能

- 現在のウェブページ、選択した開いているタブ、スクリーンショット、アップロードファイル、PDF、Office ファイル、画像、ブラウザ履歴を、ユーザーが求めたときだけ会話の文脈に使います。
- ページ、YouTube 動画、ニュース記事、調査ページ、PDF、arXiv 論文を要約・比較します。
- Codex の画像ワークフローで画像を編集または生成し、出力をローカルで扱います。
- 音声文字起こし、ライブ音声モード、ページに応じた提案、カスタムプロファイル、任意の Codex スキルを利用できます。
- Chrome content script を通じてブラウザ操作ワークフローを実行し、ページ上に作業状態を表示します。

## 5 分でインストール

一般ユーザー向けの最短手順:

1. [latest GitHub Release](https://github.com/GENEXIS-AI/chromex/releases/latest) を開きます。
2. Release assets から [`chromex-unpacked-extension.zip`](https://github.com/GENEXIS-AI/chromex/releases/latest/download/chromex-unpacked-extension.zip) をダウンロードします。
3. ZIP を展開します。
4. Chrome で `chrome://extensions` を開きます。
5. **Developer mode** を有効にします。
6. **Load unpacked** を選び、展開した `chromex-extension` フォルダを選択します。
7. Chrome ツールバーまたはサイドパネルから Chromex を開き、オンボーディングに従います。

Release ZIP ファイルは GitHub Releases に添付されます。リポジトリのファイルツリーには直接コミットされません。直接ダウンロードリンクが開けない場合は、[latest release page](https://github.com/GENEXIS-AI/chromex/releases/latest) の **Assets** から `chromex-unpacked-extension.zip` をダウンロードしてください。

拡張機能 ZIP がインストールするのは Chrome UI だけです。ローカルブリッジは、ソース checkout または `chromex-public-source.zip` から一度インストールする必要があります。

開発者向けソースインストール:

```bash
git clone https://github.com/GENEXIS-AI/chromex.git
cd chromex
npm install
npm run build
node scripts/install-native-host.mjs
```

その後、`chrome://extensions` で **Developer mode** を有効にし、**Load unpacked** から次のフォルダを選択します。

```text
packages/extension/dist
```

### Windows ローカルブリッジ設定

Windows では Node.js 20 LTS 以降をインストールしたうえで、先に Codex CLI をインストールして確認します。

```powershell
npm install -g @openai/codex
codex --version
```

その後、`chromex` ソースフォルダから **PowerShell** で実行します。

```powershell
npm install
npm run build
node scripts/install-native-host.mjs --browser=chrome
```

その後 `chrome://extensions` を開き、Chromex の **Reload** を押してから、Chromex サイドパネルで **Check connection** を押してください。

それでもローカルブリッジ待機のままの場合:

1. Chromex が release の `chromex-extension` フォルダ、または `packages/extension/dist` から読み込まれていることを確認します。
2. `chrome://extensions` の Chromex カードに表示される extension ID をコピーします。
3. その ID を指定してインストーラを再実行します。

```powershell
node scripts/install-native-host.mjs <extension-id> --browser=chrome
```

公開リリースで想定される ID は `menmlhahmendmkiicbjihgjhppkgaeom` です。Chrome に別の ID が表示される場合は、Chrome に表示された ID を使用してください。

ログイン時に `Failed to start codex app-server` が出る場合、Chromex はローカルブリッジには接続できていますが Codex CLI を起動できていません。`codex --version` を再確認してください。Windows が Codex を見つけられない場合は、optional Codex binary path に `%APPDATA%\npm\codex.cmd` を設定するか、フォルダとして `%APPDATA%\npm` を設定します。workspace フォルダと Codex executable path は別の設定なので、Codex binary 欄にプロジェクトフォルダを入れないでください。

## ランタイム境界

Chromex は次の境界で動作します。

```text
Chrome Extension -> Native Messaging Host -> Local Bridge -> codex app-server
```

ソースツリーは次のように分かれています。

- `packages/extension`: Chrome MV3 サイドパネル拡張機能
- `packages/bridge`: Codex app-server とマルチモーダルワークフロー用のローカルブリッジ
- `packages/native-host`: Chrome Native Messaging リレー
- `packages/shared`: 共有型、ポリシー、プロファイル、ヘルパー

## 言語サポート

Chromex は既定でブラウザの言語に自動的に従います。ユーザーは **Settings > General > App UI language** から言語を手動で選択することもできます。

拡張機能は、英語、韓国語、日本語、中国語、アラビア語、フランス語、ドイツ語、スペイン語、ポルトガル語、ヒンディー語、ベトナム語、タイ語、トルコ語、ウクライナ語など、多くの Chrome 互換ロケールを `_locales` として同梱しています。ユーザーが別の言語を指定しない限り、モデル応答は選択された UI 言語に従うよう指示されます。

## セキュリティとプライバシーの既定値

- 拡張機能は、OpenAI API キー、OAuth トークン、ChatGPT セッショントークンの生値を Chrome extension storage に保存しません。
- Codex OAuth / ChatGPT ログインは、ローカル Codex app-server フローで処理されます。
- API キーログインは任意のローカル fallback であり、ユーザー確認なしに自動使用されません。
- ページ内容、タブデータ、スクリーンショット、ブラウザ履歴、マイク入力、ブラウザ操作は、ユーザーが要求したワークフローでのみ使われます。
- `history`、`tabs`、画面キャプチャ、マイク、サイトアクセス権限は、機能が必要とするときだけ要求されます。
- 会話履歴は既定でセッション専用です。永続的なローカルチャット履歴はオプトインです。
- Native host の子プロセスとワークスペースフックは、縮小された環境変数 allowlist で実行されます。
- 生成画像の元データ、一時アップロード、診断情報はローカルブリッジで処理されます。

変更したビルドを公開または配布する前に、[SECURITY.md](./SECURITY.md) と [PRIVACY.md](./PRIVACY.md) を確認してください。

## 機能

- チャット中心の永続的な MV3 サイドパネル
- ページ、ファイル、画像、履歴、音声、ブラウザ操作リクエストの自動ルーティング
- 複数の開いているタブを選択できる `@` ピッカー
- プロファイル選択用の `/` ピッカー
- 画像、テキスト、PDF、DOCX、CSV、TSV、XLSX、XLSM の添付
- DOM、vision、hybrid、site adapter ワークフロー向けの読み取り戦略ポリシー
- YouTube、ニュース、調査、メール、共同作業、ノート、タスク管理、ショッピング、旅行、韓国の業務サービスに応じたサイト提案
- 現在のタイムスタンプ文脈とシーク操作に対応した YouTube adapter
- アップロード画像、ページ画像、表示画面キャプチャに対する非破壊的な画像編集
- コードブロック、テーブル、リンク、コピー操作を備えた Markdown レンダリング
- ユーザーが有効化した場合にのみ読み込まれるローカル `.codex/skills/*/SKILL.md` ベースの任意 Codex スキル

## 開発

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run release:audit
```

任意のブラウザ smoke test:

```bash
npm run smoke
```

互換ブラウザがない場合は、Playwright Chromium ランタイムをインストールします。

```bash
npm run smoke:install-browser
```

ビルド済み拡張機能は次の場所に出力されます。

```text
packages/extension/dist
```

## リリース管理

Chromex は `0.1.1` 以降、通常のオープンソースリリース履歴を使います。バージョニング、pull request フロー、リリースチェックリストは [RELEASE.md](./RELEASE.md) に記載されています。

## トラブルシューティング

- **Native host missing or forbidden**: `npm run build` を実行し、続けて `node scripts/install-native-host.mjs --browser=chrome` を実行します。`chrome://extensions` で拡張機能を再読み込みし、Chromex のオンボーディングまたはシステム状態を確認してください。Chrome に別の extension ID が表示される場合は、`node scripts/install-native-host.mjs <extension-id> --browser=chrome` で再インストールしてください。
- **モデル一覧が読み込まれない**: native bridge が接続されていることを確認し、app-server ベースのログインフローでサインインしてください。
- **ページ文脈を利用できない**: 対象タブから Chromex を開くか、ワークフローが要求する Chrome サイト権限を許可してください。
- **Chrome に古い UI が表示され続ける**: `npm run build` を実行し、拡張機能カードを再読み込みして、Chrome が `packages/extension/dist` を読み込んでいることを確認してください。
- **ブラウザ smoke test がブラウザなしで失敗する**: `npm run smoke:install-browser` を実行してから `npm run smoke` を実行してください。

## ライセンス

MIT. 詳細は [LICENSE](./LICENSE) を参照してください。
