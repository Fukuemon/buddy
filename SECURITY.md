# セキュリティの問題の届け方

脆弱性を見つけたら、公開の issue、pull request、コメントには書かない。  
GitHub の private vulnerability reporting で、メンテナーだけが読める形で届ける。

1. リポジトリの Security のタブを開く。
2. 「Report a vulnerability」を押す。
3. 再現の手順、影響を受ける箇所（ファイル、API の操作、画面）、確認したコミットを書いて送る。

届け先のページ: [Report a vulnerability](https://github.com/Fukuemon/buddy/security/advisories/new)

## 対象

対象は `develop` ブランチの最新のコミットである。  
`compose.yml`、`compose/` の下のファイル、`apps/web/.env.msw` のシークレット、パスワード、クレームは、ローカル環境で起動するためのダミーの値で、脆弱性には当たらない。
