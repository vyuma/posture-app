import { t, useAppLanguage } from "../i18n";
import { useState } from 'react';
import { useAccounts } from './AccountBoundary';
import { LegalContent } from '../legal/LegalContent';

export type AccountPrivacyAction='withdraw'|'account';
export function AccountPrivacy({action=null,showControls=false,onComplete}:{action?:AccountPrivacyAction|null;showControls?:boolean;onComplete:()=>void}) {
  useAppLanguage();
  const account=useAccounts();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<AccountPrivacyAction|null>(action);
  async function perform(){
    if(!confirm||busy)return;setBusy(true);setError('');
    try{
      if(confirm==='withdraw'){await account.participate(false);await account.logout();}
      else await account.erase(true);
      setConfirm(null);onComplete();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <>
    {(action||showControls)&&<section className={`account-settings ${action?'account-management':'account-privacy'}`} aria-label={t("個人データの管理")}>
      <h2>{action==='account'?t("アカウントを削除しますか？"):action==='withdraw'?t("分析への参加をやめますか？"):t("個人データの管理")}</h2>
      {account.state.ownerId!=='guest'?<>
        <p>{account.state.profiles[account.state.ownerId].name??t("ログイン済み")}</p>
        {!confirm&&<><div className="account-actions"><button disabled={busy} onClick={()=>setConfirm('account')}>{t("アカウントを削除")}</button></div><button className="account-withdraw-link" disabled={busy} onClick={()=>setConfirm('withdraw')}>{t("分析への参加をやめる")}</button></>}
        {confirm&&<div role="group" aria-label={t("個人データの変更確認")}>
          <p>{confirm==='withdraw'?t("同意を撤回して自動送信を停止し、ログアウトします。保存済みの分析データは削除されません。次回ログイン時は再度同意を確認します。"):t("ログイン方法・セッション・サーバーの分析データを削除します。取り消せません。削除には直前の再ログインが必要です。")} {t("この端末のローカル記録は残ります。")}</p>
          <div className="account-actions"><button disabled={busy} onClick={()=>void perform()}>{busy?t("処理しています…"):confirm==='withdraw'?t("参加をやめてログアウト"):t("削除を実行する")}</button><button disabled={busy} onClick={()=>action?onComplete():setConfirm(null)}>{t("キャンセル")}</button></div>
        </div>}
        {error&&<><p role="alert">{t(error)}</p><button disabled={busy} onClick={()=>void account.openAuth('login').catch(e=>setError(String(e)))}>{t("再ログイン")}</button></>}

      </>:<p>{t("アカウントを削除するには、設定からログインしてください。")}</p>}
    </section>}
    {!action&&<LegalContent page="privacy" />}
  </>;
}
