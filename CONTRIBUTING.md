# 開発の準備

<!-- 次は既定。バージョンの管理に mise を使わないなら書き換える。必要なランタイムとツールの名前、最初に実行するコマンド -->

必要なものは mise である。ランタイムとツールのバージョンは `mise.toml` にある。

```sh
mise install
```

<!-- 次は apm で導入した場合。コーディングエージェントの標準の方法で導入したなら、その導入の手順に書き換える -->

スキルとフックは apm で配置し、Git で追跡しない。clone した後の最初のセッションで、セッションの開始のフックが配置する。手で配置するときは次を実行する。

```sh
apm install --frozen
```

`apm install` の後に配置先を `.gitignore` に足す post-install は、マシンごとに 1 度信頼させる。

```sh
apm lifecycle trust
```

## 文書を直すとき

<!-- 文書のチェックの実行方法 -->

## コミットするとき

- 変更の分け方とメッセージの書き方は、スキル write-commit に従う。

## ブランチとリリース

<!-- 次は既定の運用。運用が違えば本文と図を書き換える -->

ブランチは、`main`、`develop`、issue ごとの作業用のブランチにする。

- `main` はリリース済みの状態を指す。`develop` は次のリリースに向けて変更を集める。
- 作業用のブランチは `develop` から切る。名前は `feature/<issue 番号>` にし、不具合は `fix/<issue 番号>` にする。`develop` へは、pull request を通して取り込む。
- リリースは、`develop` を `main` へ pull request で取り込み、`main` のコミットにタグを付ける。バージョンはセマンティック バージョニングに従う。
- リリース後の緊急の修正は、`main` から `hotfix/<issue 番号>` を切り、`main` と `develop` の両方へ取り込む。
- 保護するブランチは `main`、`develop` である。直接はコミットせず、pull request を通して取り込む。直接コミットを許す場面があれば、この行の下に場面と理由を書く。
  - リポジトリを作った直後の、agent-harness の導入のコミットだけは `main` へ直接積んだ。`develop` はこのコミットから切った。

<!-- 次のバージョンを何から決めるか。コミットメッセージからなら release-please、変更ごとの記述からなら changesets -->

```mermaid
gitGraph
    commit id: "v1.0.0" tag: "v1.0.0"
    branch develop
    checkout develop
    commit id: "dev-1"
    branch "feature/12"
    checkout "feature/12"
    commit id: "12-1"
    checkout develop
    branch "fix/13"
    checkout "fix/13"
    commit id: "13-1"
    checkout develop
    merge "fix/13" id: "PR #13"
    checkout "feature/12"
    commit id: "12-2"
    checkout develop
    merge "feature/12" id: "PR #12"
    checkout main
    merge develop id: "release" tag: "v1.1.0"
```

## issue と pull request

<!-- issue の種類とラベル、pull request との対応 -->

- 作業は issue から始める。pull request は 1 つの issue に対応させる。
- 題と本文の書き方は、スキル write-issue-pr に従う。
