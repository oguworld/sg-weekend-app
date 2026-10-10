// Google Play本番公開の自動化スクリプト(VPS上で手動実行、CI化しない)。
// Google Play Developer API(androidpublisher v3)をgoogleapisパッケージ経由で直接呼ぶ。
// 審査通過後は人間の追加操作なしで即座に一般公開される「完全自動」(status:'completed', userFraction省略=100%ロールアウト)。
//
// 使い方:
//   node android-app/scripts/publish-android.js --version-code 3
//   node android-app/scripts/publish-android.js --aab /path/to/app-release.aab --version-code 3
//
// 事前準備(ユーザー自身が行う、詳細はCLAUDE.md「Androidアプリ化」参照):
//   1. Google Cloud Consoleでサービスアカウントを作成しJSON鍵をダウンロード
//   2. Play Console「設定 > API アクセス」でサービスアカウントをリンクし、
//      app.dosuruに対して「製品版への公開」権限を付与
//   3. JSON鍵を ~/android-keystore/play-publisher-service-account.json に配置(chmod 600推奨)
//
// --non-interactive フラグについて:
//   ⚠️ このフラグは人間が直接ターミナルで実行する際には使わないこと。
//   信頼されたリリース自動化エージェント(releaser)からの呼び出し専用。
//   対話確認プロンプト(readlineでの"production"入力)をスキップしてそのまま本番公開を実行する。
//   人間が直接実行する場合は、フラグを付けずデフォルトの対話確認フローを使うこと。
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const PACKAGE_NAME = 'app.dosuru';
const APP_DISPLAY_NAME = 'SG在住Navi';
const TRACK = 'production';

function parseArgs(argv) {
  const args = { aab: null, versionCode: null, nonInteractive: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--aab') { args.aab = argv[++i]; }
    else if (argv[i] === '--version-code') { args.versionCode = parseInt(argv[++i], 10); }
    else if (argv[i] === '--non-interactive') { args.nonInteractive = true; }
  }
  return args;
}

function getDefaultServiceAccountPath() {
  if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH) {
    return process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH;
  }
  return path.join(os.homedir(), 'android-keystore', 'play-publisher-service-account.json');
}

function getDefaultAabPath() {
  return path.join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
}

function getDefaultVersionCode() {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.androidVersionCode;
}

// 現在本番トラックで公開中の最大versionCodeを取得する(読み取りのみ、実際の変更は加えない)。
// edits.insert → edits.tracks.get → edits.delete の順で呼び、最後に必ず編集セッションを破棄する。
// 失敗した場合はnullを返す(呼び出し側で「事前チェックに失敗したため従来通り進めます」の扱いにする)。
async function getCurrentProductionVersionCode(androidpublisher) {
  let editId = null;
  try {
    const editInsertRes = await androidpublisher.edits.insert({
      packageName: PACKAGE_NAME,
    });
    editId = editInsertRes.data.id;

    const trackRes = await androidpublisher.edits.tracks.get({
      packageName: PACKAGE_NAME,
      editId,
      track: TRACK,
    });

    const releases = (trackRes.data && trackRes.data.releases) || [];
    let maxVersionCode = null;
    for (const release of releases) {
      const codes = release.versionCodes || [];
      for (const code of codes) {
        const num = parseInt(code, 10);
        if (!Number.isNaN(num) && (maxVersionCode === null || num > maxVersionCode)) {
          maxVersionCode = num;
        }
      }
    }
    return maxVersionCode;
  } finally {
    if (editId) {
      try {
        await androidpublisher.edits.delete({
          packageName: PACKAGE_NAME,
          editId,
        });
      } catch (e) {
        // 破棄に失敗しても致命的ではない(Google側で編集セッションは一定時間後に自動失効する)。
        console.warn(`警告: 事前チェック用の編集セッション(editId: ${editId})の破棄に失敗しました。`, e.message || e);
      }
    }
  }
}

function confirmProduction(versionCode) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('');
    console.log('========================================');
    console.log('  本番トラックへ公開します');
    console.log(`  アプリ: ${APP_DISPLAY_NAME} (${PACKAGE_NAME})`);
    console.log(`  versionCode: ${versionCode}`);
    console.log('========================================');
    console.log('');
    rl.question('続行しますか? (本番公開を実行するには production と入力): ', (answer) => {
      rl.close();
      resolve(answer === 'production');
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const aabPath = args.aab ? path.resolve(args.aab) : getDefaultAabPath();
  if (!fs.existsSync(aabPath)) {
    console.error(`エラー: AABファイルが見つかりません: ${aabPath}`);
    console.error('--aab <path> で明示的に指定するか、./gradlew bundleRelease でビルドしてください。');
    process.exit(1);
  }

  let versionCode = args.versionCode;
  if (!versionCode) {
    try {
      versionCode = getDefaultVersionCode();
    } catch (e) {
      console.error('エラー: android-app/package.json からandroidVersionCodeを取得できませんでした。');
      console.error(e.message);
      process.exit(1);
    }
  }
  if (!versionCode || Number.isNaN(versionCode)) {
    console.error('エラー: versionCodeが不正です。--version-code <number> で指定してください。');
    process.exit(1);
  }

  const serviceAccountPath = getDefaultServiceAccountPath();
  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`エラー: サービスアカウントのJSON鍵が見つかりません: ${serviceAccountPath}`);
    console.error('');
    console.error('Google Play Developer APIを使うには、事前にサービスアカウントの作成・');
    console.error('Play Consoleでの権限付与が必要です。手順はCLAUDE.mdの');
    console.error('「Androidアプリ化」節(Play Developer API 本番公開自動化)を参照してください。');
    console.error('');
    console.error('環境変数 GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH でパスを指定することもできます。');
    process.exit(1);
  }

  console.log('');
  console.log('認証中...');
  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const androidpublisher = google.androidpublisher({ version: 'v3', auth });

  // 安全策: AABアップロードや確認プロンプトより前に、現在本番トラックで公開中の
  // 最大versionCodeを取得し、これからアップロードするversionCode以上でないか確認する。
  // (対話・非対話どちらのモードでも常に実行する)
  console.log('現在本番公開中のversionCodeを確認します(事前チェック)...');
  let currentProductionVersionCode = null;
  let precheckFailed = false;
  try {
    currentProductionVersionCode = await getCurrentProductionVersionCode(androidpublisher);
  } catch (e) {
    precheckFailed = true;
    console.warn('警告: 事前チェック(本番versionCode取得)に失敗しました。事前チェックに失敗したため従来通り進めます。');
    if (e.response && e.response.data) {
      console.warn(JSON.stringify(e.response.data, null, 2));
    } else {
      console.warn(e.message || e);
    }
  }

  if (!precheckFailed) {
    if (currentProductionVersionCode === null) {
      console.log('本番トラックに公開中のリリースが見つかりませんでした(初回公開の可能性)。事前チェックをスキップして続行します。');
    } else if (versionCode <= currentProductionVersionCode) {
      console.error('');
      console.error('エラー: 指定したversionCodeが現在本番公開中のversionCode以下です。');
      console.error(`  現在本番公開中のversionCode: ${currentProductionVersionCode}`);
      console.error(`  指定したversionCode: ${versionCode}`);
      console.error('');
      console.error('android-app/package.jsonのandroidVersionCodeを上げるか、--version-code で正しい値を指定してください。');
      process.exit(1);
    } else {
      console.log(`事前チェックOK: 現在本番公開中のversionCode(${currentProductionVersionCode}) < 指定したversionCode(${versionCode})`);
    }
  }

  if (args.nonInteractive) {
    console.log('');
    console.log('--non-interactive が指定されたため、対話確認プロンプトをスキップします。');
  } else {
    const proceed = await confirmProduction(versionCode);
    if (!proceed) {
      console.log('中断しました。本番公開は実行されていません。');
      process.exit(0);
    }
  }

  try {
    console.log('編集セッションを開始します(edits.insert)...');
    const editInsertRes = await androidpublisher.edits.insert({
      packageName: PACKAGE_NAME,
    });
    const editId = editInsertRes.data.id;
    console.log(`editId: ${editId}`);

    console.log(`AABをアップロードします(edits.bundles.upload): ${aabPath}`);
    const uploadRes = await androidpublisher.edits.bundles.upload({
      packageName: PACKAGE_NAME,
      editId,
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(aabPath),
      },
    });
    const uploadedVersionCode = uploadRes.data.versionCode;
    console.log(`アップロード完了。アップロードされたversionCode: ${uploadedVersionCode}`);

    if (uploadedVersionCode !== versionCode) {
      console.warn(`警告: 指定/package.json上のversionCode(${versionCode})とAAB内のversionCode(${uploadedVersionCode})が一致しません。`);
      console.warn('AAB内の実際のversionCodeを使って続行します。');
      versionCode = uploadedVersionCode;
    }

    console.log(`本番トラックを更新します(edits.tracks.update, track=${TRACK}, status=completed)...`);
    await androidpublisher.edits.tracks.update({
      packageName: PACKAGE_NAME,
      editId,
      track: TRACK,
      requestBody: {
        track: TRACK,
        releases: [
          {
            versionCodes: [String(versionCode)],
            status: 'completed',
          },
        ],
      },
    });

    console.log('編集内容を確定します(edits.commit)...');
    await androidpublisher.edits.commit({
      packageName: PACKAGE_NAME,
      editId,
    });

    console.log('');
    console.log('========================================');
    console.log(`本番公開の審査提出が完了しました。versionCode: ${versionCode}`);
    console.log('Googleの審査通過後、人間の追加操作なしで即座に一般公開されます。');
    console.log('========================================');
  } catch (err) {
    console.error('');
    console.error('エラー: Google Play Developer APIの呼び出しに失敗しました。');
    if (err.response && err.response.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message || err);
    }
    process.exit(1);
  }
}

main();
