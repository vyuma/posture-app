import { useState } from 'react';
import { useAccounts } from './AccountBoundary';
import { LegalContent } from '../legal/LegalContent';
import { SsoButton } from './SsoButton';

export function AccountPrivacy() {
  const account=useAccounts();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<'withdraw'|'data'|'account'|null>(null);
  async function perform(){
    if(!confirm||busy)return;setBusy(true);setError('');
    try{
      if(confirm==='withdraw'){await account.participate(false);await account.logout();}
      else {await account.erase(confirm==='account');if(confirm==='data')await account.logout();}
      setConfirm(null);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <>
    <section className="account-settings account-privacy" aria-label="個人データの管理">
      <h2>個人データの管理</h2>
      {account.state.ownerId!=='guest'?<>
        <p>{account.state.profiles[account.state.ownerId].name??'ログイン済み'}</p>
        <p>ログアウトはこの端末の送信を止めますが、同意は保持します。同意を撤回すると自動送信を停止し、ログアウトします。次回ログイン時は再度同意を確認します。</p>
        <div className="account-actions"><button disabled={busy} onClick={()=>setConfirm('withdraw')}>同意を撤回してログアウト</button><button disabled={busy} onClick={()=>setConfirm('data')}>分析データを削除</button><button disabled={busy} onClick={()=>setConfirm('account')}>アカウントを削除</button></div>
        {confirm&&<div role="group" aria-label="個人データの変更確認">
          <p>{confirm==='withdraw'?'今後の自動送信を停止します。保存済みの分析データは削除されません。':confirm==='data'?'保存済みの分析データを削除し、同意を撤回してログアウトします。削除した測定は再送信できません。':'ログイン方法・セッション・分析データを削除します。取り消せません。削除には直前の再ログインが必要です。'} この端末のローカル記録は残ります。</p>
          <div className="account-actions"><button disabled={busy} onClick={()=>void perform()}>{busy?'処理しています…':confirm==='withdraw'?'同意を撤回する':'削除を実行する'}</button><button disabled={busy} onClick={()=>setConfirm(null)}>キャンセル</button></div>
        </div>}
        {error&&<><p role="alert">{error}</p><p>再認証が必要な場合は、同じログイン方法を選び、戻ってから操作を再試行してください。</p><div className="account-sso-options"><SsoButton provider="google" disabled={busy} onClick={()=>void account.login('google').catch(e=>setError(String(e)))}/>{account.info?.appleEnabled&&<SsoButton provider="apple" disabled={busy} onClick={()=>void account.login('apple').catch(e=>setError(String(e)))}/>}</div></>}
      </>:<p>保存済みの分析データやアカウントを削除するには、設定からログインしてください。分析に同意する前でも、この画面から削除できます。</p>}
    </section>
    <LegalContent page="privacy" />
  </>;
}
