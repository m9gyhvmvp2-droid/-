# Trace — Photo to Your Art (Prototype)

写真を下敷きにして、自分で描いて作品にするWebプロトタイプです。

## MVP機能
- 写真選択（端末内画像）
- 写真透明度の調整
- Sobel法による輪郭ガイドの自動生成
- 輪郭ガイドのON/OFF・強度調整
- 指/マウス/Apple Pencil互換のCanvas描画
- Auto Color：描いている位置の元写真の色を自動取得
- 手動カラー + スポイト
- ブラシサイズ
- 消しゴム
- Undo / Redo（最大25状態）
- 作品のみプレビュー
- PNG書き出し

## 使い方
`index.html` をブラウザで開くか、ローカルサーバーで配信してください。

例：
```bash
python3 -m http.server 8000
```
その後 `http://localhost:8000` を開きます。
