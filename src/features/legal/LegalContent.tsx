import { useEffect } from 'react';
import './legal.css';

export type LegalPage = 'privacy' | 'support';
export const LEGAL_TITLES = { privacy: 'プライバシーポリシー', support: 'サポート' } as const;

export function LegalContent({ page }: { page: LegalPage }) {
  return <article className="piiin-legal-content">
    <h1>{LEGAL_TITLES[page]}</h1>
    {page === 'privacy' ? <>
      <p className="piiin-legal-date">更新日：2026年10月30日</p>
      <p>PiiiNの運営者 Kyoung は、ウェブ版およびデスクトップ版で扱う情報について、以下のとおり説明します。お問い合わせは gwakkyoungpin@gmail.com で受け付けます。</p>
      <h2>カメラと姿勢の推定</h2>
      <p>カメラ映像から顔や肩などの位置を端末内で推定し、登録した基準姿勢との変化をお知らせします。姿勢の推定のために、カメラ映像をPiiiNの運営者のサーバーへ送信することはありません。マイクは使用しません。</p>
      <h2>端末に保存する情報と目的</h2>
      <ul>
        <li>基準姿勢の数値、姿勢スコア、測定日時、集中・休憩時間、良い姿勢の割合、再登録などの履歴：測定の継続と結果の表示に使用します。</li>
        <li>獲得カード、選択したキャラクター、タイマー・サウンド・動画の設定、初回案内の完了状態：コレクションの表示と次回の設定の復元に使用します。</li>
        <li>タイムラプスを有効にした場合のカメラ動画と、その時点のペットの反応・残り時間など：動画の再生、保存、共有に使用します。</li>
      </ul>
      <p>ウェブ版では利用中のブラウザーの保存領域、デスクトップ版ではアプリの保存領域に記録します。端末やブラウザー、配布版の間で自動同期はしません。</p>
      <h2>タイムラプスの記録</h2>
      <p>録画は初期状態では無効です。プロフィールの「設定」で有効にすると、その選択を記憶し、以後の集中時間を無音で記録します。休憩・一時停止・姿勢の再登録中は記録しません。顔や室内の様子が動画に含まれるため、周囲の人が映り込まない環境でご利用ください。設定を無効にすると次の測定から録画しません。</p>
      <h2>保存期間と削除</h2>
      <p>動画は利用者が削除するまで端末に保管します。プロフィールの「コレクションを初期化」では、獲得カード・選択したキャラクター・アプリ内のタイムラプス（共有用の一時コピーを含む）を削除します。測定記録とタイマーなどの設定は残ります。ブラウザーやOSによる保存領域の整理でもデータが失われる場合があるため、大切な動画はファイルとして保存してください。</p>
      <p>ウェブ版の記録をすべて削除するには、ブラウザーの設定でPiiiNのサイトデータを削除してください。デスクトップ版の保存領域を含む全データの削除方法はサポートでご案内します。アプリの削除だけでは保存領域が残る場合があります。運営者は利用者の端末内の記録を遠隔で閲覧・削除できません。</p>
      <p>利用者がアプリの外へ保存・共有したファイルは、コレクションの初期化では削除されません。保存先や共有先で管理・削除してください。</p>
      <h2>通信先と外部サービス</h2>
      <p>ウェブサイトの配信にはVercelを利用します。Mac App Store版は姿勢推定用モデルと推定プログラムをアプリに同梱し、姿勢推定のための外部ダウンロードを行いません。その他の配布版では、モデルの取得にGoogleの配信基盤、推定プログラムの取得にjsDelivrを利用します。Macの直接配布版ではGitHubから更新情報や更新ファイルを取得します。Microsoft Store版・Mac App Store版の配布と更新には各ストアを利用します。Windows版はMicrosoft WebView2上で動作します。</p>
      <p>これらの通信では、接続元IPアドレス、ブラウザー・端末に関する情報、アクセス日時、要求したURLなどが通信先に伝わる場合があります。これはカメラ映像のアップロードとは別の処理です。各サービスの処理には各提供者のプライバシーポリシーが適用され、日本国外で処理される場合があります。</p>
      <ul className="piiin-legal-providers">
        <li>Vercel：vercel.com/legal/privacy-policy</li>
        <li>Google（モデル配信・Gmail）：policies.google.com/privacy</li>
        <li>jsDelivr：jsdelivr.com/terms/privacy-policy</li>
        <li>GitHub：docs.github.com/site-policy/privacy-policies/github-general-privacy-statement</li>
        <li>Apple：apple.com/legal/privacy/</li>
        <li>Microsoft：privacy.microsoft.com/privacystatement</li>
      </ul>
      <h2>Cookieとブラウザーの保存領域</h2>
      <p>設定や測定記録の保持にブラウザーの保存領域を使用します。開発者向けページではログイン状態を維持するCookieを使用します。PiiiNには広告配信や広告目的の行動追跡機能を組み込んでいません。</p>
      <h2>保存・共有を選んだ場合</h2>
      <p>保存・共有は利用者の操作により行われます。選択した共有先には動画やカード画像に含まれる情報が渡ります。共有先での取り扱いをご確認ください。端末やブラウザーによっては、共有の代わりにファイルを保存してから添付する方式になります。</p>
      <h2>お問い合わせ</h2>
      <p>お問い合わせのメールアドレス、本文、任意の添付ファイルは、Gmailで受け取り、回答・不具合の調査・対応記録のために扱います。個人を識別できる原文や画像を共同開発者にそのまま共有せず、名前、メールアドレス、顔、その他の識別情報を取り除いた必要最小限の不具合情報のみをDiscordなどで共有します。調査に不要な個人情報や動画は送らないでください。</p>
      <p>お問い合わせの情報は対応と必要な記録管理のために保管し、不要になった情報は削除します。運営者が保有する情報についての確認・訂正・削除などのご相談は、上記窓口へご連絡ください。本人確認に必要な範囲で追加確認をお願いする場合があります。</p>
      <h2>安全管理・変更</h2>
      <p>運営者が取り扱う情報へのアクセスを必要な範囲に限定します。端末内の記録については、端末のロックやOSの暗号化などもご利用ください。第三者への個人情報の提供が別途必要になる場合は、法令に基づく場合を除き、必要な説明と同意の確認を行います。取り扱いを変更する場合は本ページを更新し、重要な変更は適切な方法でお知らせします。</p>
    </> : <>
      <p>PiiiNは、カメラで登録した基準姿勢からの変化をお知らせする無料アプリです。アカウント登録、課金、サブスクリプションはありません。</p>
      <h2>お問い合わせ</h2>
      <p><a href="mailto:gwakkyoungpin@gmail.com">gwakkyoungpin@gmail.com</a></p>
      <p>アプリのバージョン、OS・ブラウザー、問題が起きた操作をお知らせください。パスワードやAPIキーは送らないでください。画像を添付する場合は、顔、名前、通知、メールアドレスなどの個人情報を隠してください。</p>
      <h2>姿勢が正しく判定されないとき</h2>
      <p>顔と肩がカメラに映り、十分に明るい場所で基準姿勢を登録し直してください。カメラの位置、距離、服装、照明、遮蔽物などで推定が変わる場合があります。顔や肩を認識できない状態が続いた場合にも、姿勢を戻す案内が表示されます。</p>
      <p>スコアは登録した姿勢との差をもとにした目安です。医学的な診断や治療、姿勢改善の効果を保証するものではありません。</p>
      <h2>カメラを使えないとき</h2>
      <p>OSとブラウザーの設定でPiiiNのカメラ許可を確認し、カメラを使用する他のアプリを閉じて再度お試しください。Mac App Store版の姿勢推定はインターネット接続なしで利用できます。その他の配布版は推定プログラムとモデルの取得にインターネット接続が必要です。</p>
      <h2>動画の保存と削除</h2>
      <p>プロフィールの「設定」でタイムラプスを有効にすると、集中時間のみを無音で記録します。動画は利用者が削除するまでこの端末に残ります。プロフィールの「コレクションを初期化」でアプリ内のカードと動画を削除できます。測定記録・設定と、アプリ外に書き出したファイルは残ります。</p>
      <p>ウェブ版の全記録はブラウザーのサイトデータ削除で消せます。デスクトップ版の全記録の削除は、利用しているOSと配布版を添えてお問い合わせください。動画や測定記録をメールで送る必要はありません。</p>
      <h2>配布版の切り替え</h2>
      <p>Macの直接ダウンロード版とMac App Store版は保存領域が異なります。カード・測定記録・動画は自動移行されません。大切な動画やカード画像は元のアプリで保存し、確認が終わるまで元のアプリとデータを残してください。ウェブ版とWindows版の間にも自動同期はありません。</p>
    </>}
  </article>;
}

export function LegalPageView({ page }: { page: LegalPage }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${LEGAL_TITLES[page]} | PiiiN`;
    document.documentElement.classList.add('piiin-legal-document');
    document.body.classList.add('piiin-legal-document');
    return () => { document.title = previousTitle; document.documentElement.classList.remove('piiin-legal-document'); document.body.classList.remove('piiin-legal-document'); };
  }, [page]);
  return <div className="piiin-legal-page"><header><a href="/" aria-label="PiiiN ホーム">PiiiN</a><nav aria-label="サポートナビゲーション"><a href="/privacy" aria-current={page === 'privacy' ? 'page' : undefined}>プライバシー</a><a href="/support" aria-current={page === 'support' ? 'page' : undefined}>サポート</a></nav></header><main><LegalContent page={page} /></main><footer><a href="/">PiiiNのサイトに戻る</a></footer></div>;
}
