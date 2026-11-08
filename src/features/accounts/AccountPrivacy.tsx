import { useState } from 'react';
import { useAccounts } from './AccountBoundary';
import { LegalContent } from '../legal/LegalContent';
import { SsoButton } from './SsoButton';

export type AccountPrivacyAction='withdraw'|'account';
export function AccountPrivacy({action=null,showControls=false,onComplete}:{action?:AccountPrivacyAction|null;showControls?:boolean;onComplete:()=>void}) {
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
    {(action||showControls)&&<section className={`account-settings ${action?'account-management':'account-privacy'}`} aria-label="個人データの管理">
      <h2>{action==='account'?'アカウントを削除しますか？':action==='withdraw'?'分析への参加をやめますか？':'個人データの管理'}</h2>
      {account.state.ownerId!=='guest'?<>
        <p>{account.state.profiles[account.state.ownerId].name??'ログイン済み'}</p>
        {!confirm&&<><div className="account-actions"><button disabled={busy} onClick={()=>setConfirm('account')}>アカウントを削除</button></div><button className="account-withdraw-link" disabled={busy} onClick={()=>setConfirm('withdraw')}>分析への参加をやめる</button></>}
        {confirm&&<div role="group" aria-label="個人データの変更確認">
          <p>{confirm==='withdraw'?'同意を撤回して自動送信を停止し、ログアウトします。保存済みの分析データは削除されません。次回ログイン時は再度同意を確認します。':'ログイン方法・セッション・サーバーの分析データを削除します。取り消せません。削除には直前の再ログインが必要です。'} この端末のローカル記録は残ります。</p>
          <div className="account-actions"><button disabled={busy} onClick={()=>void perform()}>{busy?'処理しています…':confirm==='withdraw'?'参加をやめてログアウト':'削除を実行する'}</button><button disabled={busy} onClick={()=>action?onComplete():setConfirm(null)}>キャンセル</button></div>
        </div>}
        {error&&<><p role="alert">{error}</p><p>再認証が必要な場合は、同じログイン方法を選び、戻ってから操作を再試行してください。</p><div className="account-sso-options"><SsoButton provider="google" disabled={busy} onClick={()=>void account.login('google').catch(e=>setError(String(e)))}/>{account.info?.appleEnabled&&<SsoButton provider="apple" disabled={busy} onClick={()=>void account.login('apple').catch(e=>setError(String(e)))}/>}</div></>}
      </>:<p>アカウントを削除するには、設定からログインしてください。</p>}
    </section>}
    {!action&&<LegalContent page="privacy" />}
  </>;
}
